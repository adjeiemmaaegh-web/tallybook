import { withCoordinatedRetailWrite } from "@/features/backup/coordinatedRetailWrite";
import {assertRun7RetailWriteReady} from "@/features/backup/run7RetailWriteBarrier.mjs";
import { withCrossTabDataLock } from "@/features/backup/crossTabDataLock.mjs";
import { requirePermission } from "@/features/staff/staff";
/** Tactile Ledger design reminder: stock is never silently overwritten—every quantity change leaves a clear local movement record. */
import { nanoid } from "nanoid";
import { postStoreStockDelta } from "@/features/stores/storeStockLedger";
import {reservedRun16Units} from "@/features/commerce/run16Availability";
import { z } from "zod";
import type { GhanaTaxTreatment } from "@/features/sales/ghanaVat.mjs";
import { db, type TallybookDB } from "@/db/TallybookDB";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import { assertCompanyScope } from "@/features/business/companyScope.mjs";
import { appendInventoryCostChange } from "./costLedger";
import {validateCategoryHierarchy} from "./categoryHierarchy.mjs";

export const INVENTORY_BUSINESS_ID = "primary" as const;

export const stockMovementTypes = ["initial", "increase", "decrease", "correction", "sale", "purchase", "reversal"] as const;
export type StockMovementType = (typeof stockMovementTypes)[number];

export interface ProductCategory {
  id: string;
  businessProfileId: string;
  name: string;
  normalizedName: string;
  /** Optional three-level parent category; no physical stock is implied. */
  parentCategoryId?:string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface Product {
  id: string;
  businessProfileId: string;
  name: string;
  normalizedName: string;
  sku?: string;
  barcode?: string;
  /** Optional family reference. Every variant is still an independent stocked SKU. */
  parentProductId?: string;
  variantLabel?: string;
  /** The existing sales ledger remains integer-unit based. */
  baseUnit?: string;
  packSize?: number;
  wholesalePriceMinor?: number;
  wholesaleMinimumQuantity?: number;
  itemKind?: "stock" | "service";
  /** Restricted-size local image; no remote fetch. */
  imageDataUrl?: string;
  categoryId?: string;
  /** Explicit owner classification for optional Ghana VAT. Omitted means unclassified, never assumed taxable. */
  ghanaTaxTreatment?: GhanaTaxTreatment;
  sellingPriceMinor: number;
  costPriceMinor?: number;
  stockQuantity: number;
  lowStockThreshold: number;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface InventoryMovement {
  id: string;
  businessProfileId: string;
  productId: string;
  movementType: StockMovementType;
  quantityDelta: number;
  previousQuantity: number;
  resultingQuantity: number;
  note?: string;
  purchaseId?: string;
  createdAt: string;
}

export interface InventorySnapshot {
  categories: ProductCategory[];
  products: Product[];
  archivedProducts: Product[];
  movements: InventoryMovement[];
}

const nameSchema = z.string().trim().min(2, "Use at least 2 characters.").max(80, "Use 80 characters or fewer.");
const optionalText = (maximum: number, label: string) => z.string().trim().max(maximum, `${label} must be ${maximum} characters or fewer.`).optional().or(z.literal(""));
const nonNegativeInteger = (label: string) => z.string().trim().regex(/^\d+$/, `${label} must be a whole number.`).refine((value) => Number(value) <= 9_999_999, `${label} is too large.`);
const requiredAmount = (label: string) => z.string().trim().refine((value) => /^\d+(?:\.\d{1,2})?$/.test(normalizeMoneyInput(value)), `${label} must be a valid amount.`);
const optionalAmount = (label: string) => requiredAmount(label).optional().or(z.literal(""));

export const categoryFormSchema = z.object({ name: nameSchema, parentCategoryId:z.string().max(80).optional() });

export const productFormSchema = z.object({
  storeId: z.string().min(1).max(200).optional(),
  name: nameSchema,
  sku: optionalText(48, "Reference"),
  barcode: optionalText(64, "Barcode"),
  categoryId: z.string(),
  ghanaTaxTreatment: z.enum(["unclassified", "standard", "zero-rated", "exempt"]).optional(),
  sellingPrice: requiredAmount("Selling price"),
  costPrice: optionalAmount("Cost price"),
  initialStock: nonNegativeInteger("Opening stock"),
  lowStockThreshold: nonNegativeInteger("Low-stock level"),
});

export const stockAdjustmentSchema = z.object({
  storeId: z.string().min(1).max(200).optional(),
  movementType: z.enum(["increase", "decrease", "correction"]),
  quantity: nonNegativeInteger("Quantity"),
  note: optionalText(160, "Note"),
});

export type CategoryFormValues = z.infer<typeof categoryFormSchema>;
export type ProductFormValues = z.infer<typeof productFormSchema>;
export type StockAdjustmentValues = z.infer<typeof stockAdjustmentSchema>;

export function normalizeName(value: string) { return value.trim().replace(/\s+/g, " ").toLocaleLowerCase(); }

export function currencyMinorDivisor(currency: string) {
  return ["RWF", "TZS", "UGX"].includes(currency) ? 1 : 100;
}

export function normalizeMoneyInput(value: string) {
  const compact = value.trim().replace(/\s+/g, "");
  const commas = Array.from(compact.matchAll(/,/g)).map((match) => match.index ?? -1);
  const dots = Array.from(compact.matchAll(/\./g)).map((match) => match.index ?? -1);
  if (!compact) return compact;
  if (commas.length && dots.length) {
    const decimalSeparator = commas.at(-1)! > dots.at(-1)! ? "," : ".";
    const groupingSeparator = decimalSeparator === "," ? "." : ",";
    return compact.replaceAll(groupingSeparator, "").replace(decimalSeparator, ".");
  }
  if (commas.length) {
    const finalGroupLength = compact.length - commas.at(-1)! - 1;
    return finalGroupLength <= 2 ? compact.replace(",", ".") : compact.replaceAll(",", "");
  }
  if (dots.length > 1 || (dots.length === 1 && compact.length - dots[0] - 1 === 3)) return compact.replaceAll(".", "");
  return compact;
}

export function parseAmountToMinor(value: string, currency: string) {
  const normalized = normalizeMoneyInput(value) || "0";
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error("Enter a valid amount.");
  const [whole, fraction = ""] = normalized.split(".");
  const divisor = currencyMinorDivisor(currency);
  if (divisor === 1 && Number(fraction) !== 0) throw new Error("This currency requires a whole amount.");
  // Preserve monetary precision before converting to JavaScript numbers.
  // Multiplying a large Number first can round even when the final value
  // happens to pass Number.isSafeInteger.
  const result = BigInt(whole) * BigInt(divisor) +
    BigInt(divisor === 1 ? 0 : Number(fraction.padEnd(2, "0")));
  if (result < 0n || result > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("Amount exceeds safe limits.");
  return Number(result);
}

export function formatMinorAmount(value: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: currencyMinorDivisor(currency) === 1 ? 0 : 2 }).format(value / currencyMinorDivisor(currency));
}

function cleanOptional(value: string | undefined) { const cleaned = value?.trim(); return cleaned || undefined; }

export async function getInventorySnapshot(database: TallybookDB = db): Promise<InventorySnapshot> {
  const activeId = getActiveBusinessProfileId();
  const [allCategories, allProducts, allMovements] = await database.transaction("r", [database.categories, database.products, database.inventoryMovements, database.staffMembers], async () => {
    await requirePermission("sell",database,activeId);
    return Promise.all([
      database.categories.orderBy("name").toArray(),
      database.products.orderBy("name").toArray(),
      database.inventoryMovements.orderBy("createdAt").reverse().toArray(),
    ]);
  });
  assertCompanyScope(activeId, getActiveBusinessProfileId());
  await requirePermission("sell",database,activeId);
  const categories = allCategories.filter((category) => category.businessProfileId === activeId);
  validateCategoryHierarchy(categories,activeId);
  const products = allProducts.filter((product) => product.businessProfileId === activeId);
  const movements = allMovements.filter((movement) => movement.businessProfileId === activeId);
  return {
    categories: categories.filter((category) => !category.archivedAt),
      products: products.filter((product) => !product.archivedAt),
      archivedProducts: products.filter((product) => Boolean(product.archivedAt)),
    movements,
  };
}

export async function createCategory(values: CategoryFormValues, database: TallybookDB = db) {
  return withCoordinatedRetailWrite(async () => {
    const input = categoryFormSchema.parse(values);
    const now = new Date().toISOString();
    const normalizedName = normalizeName(input.name);
    const activeId = getActiveBusinessProfileId();
    return database.transaction("rw", [database.appMeta, database.categories, database.staffMembers], async () => {
    await assertRun7RetailWriteReady(database.appMeta);
    await requirePermission("inventory", database, activeId);
    const duplicate = await database.categories.where("normalizedName").equals(normalizedName).and((category) => category.businessProfileId === activeId && !category.archivedAt).first();
    if (duplicate) throw new Error("A category with this name already exists.");
    const parentCategoryId=input.parentCategoryId?.trim()||undefined;
    const category: ProductCategory = { id: nanoid(12), businessProfileId: activeId,
      name: input.name.trim(), normalizedName,...(parentCategoryId?{parentCategoryId}:{}) ,createdAt: now, updatedAt: now };
    if(parentCategoryId){
      const existing=await database.categories.where("businessProfileId").equals(activeId).toArray();
      const parent=existing.find(row=>row.id===parentCategoryId&&!row.archivedAt);
      if(!parent)throw Error("Choose an active parent category from this business.");
      validateCategoryHierarchy([...existing,category],activeId);
    }
    assertCompanyScope(activeId, getActiveBusinessProfileId());
    await database.categories.add(category);
    assertCompanyScope(activeId, getActiveBusinessProfileId());
    return category;
    });
  });
}

/** Normalized identifiers must be unique among active items of the same company. */
export function normalizeProductCode(value: string | undefined) { return value?.trim().toLocaleLowerCase() ?? ""; }

async function assertUniqueProductCodes(database: TallybookDB, companyId: string, sku: string | undefined, barcode: string | undefined, excludeId?: string) {
  const identifiers = [normalizeProductCode(sku), normalizeProductCode(barcode)].filter(Boolean);
  if (new Set(identifiers).size !== identifiers.length) throw new Error("SKU and barcode must be different identifiers.");
  if (!identifiers.length) return;
  const products = await database.products.toArray();
  for (const product of products) {
    if (product.businessProfileId !== companyId || product.archivedAt || product.id === excludeId) continue;
    const existing = [normalizeProductCode(product.sku), normalizeProductCode(product.barcode)].filter(Boolean);
    if (identifiers.some((code) => existing.includes(code))) throw new Error("This SKU or barcode is already assigned to an active product.");
  }
}

export async function createProduct(values: ProductFormValues, currency: string, database: TallybookDB = db) {
  return withCoordinatedRetailWrite(async () => {
    const input = productFormSchema.parse(values);
    const now = new Date().toISOString();
    const normalizedName = normalizeName(input.name);
    const initialStock = Number(input.initialStock);
    const activeId = getActiveBusinessProfileId();
    return database.transaction("rw", [database.appMeta, database.products, database.categories, database.inventoryMovements, database.inventoryCostEvents, database.staffMembers, database.storeStockModes, database.storeStockEntries, database.storeLocations, database.storeAssignments, database.storeTransferRequests, database.commerceHolds], async () => {
    await assertRun7RetailWriteReady(database.appMeta);
    await requirePermission("inventory", database, activeId);
    const duplicate = await database.products.where("normalizedName").equals(normalizedName).and((product) => product.businessProfileId === activeId && !product.archivedAt).first();
    if (duplicate) throw new Error("An active product with this name already exists.");
    if (input.categoryId !== "uncategorized") {
      const category = await database.categories.get(input.categoryId);
      if (!category || category.businessProfileId !== activeId || category.archivedAt) throw new Error("Choose an active category or leave the product uncategorized.");
    }
    const product: Product = {
      id: nanoid(12), businessProfileId: activeId, name: input.name.trim(), normalizedName,
      sku: cleanOptional(input.sku), barcode: cleanOptional(input.barcode), categoryId: input.categoryId === "uncategorized" ? undefined : input.categoryId,
      sellingPriceMinor: parseAmountToMinor(input.sellingPrice, currency), costPriceMinor: input.costPrice ? parseAmountToMinor(input.costPrice, currency) : undefined,
      ...(input.ghanaTaxTreatment && input.ghanaTaxTreatment !== "unclassified" ? { ghanaTaxTreatment: input.ghanaTaxTreatment } : {}),
      stockQuantity: initialStock, lowStockThreshold: Number(input.lowStockThreshold), createdAt: now, updatedAt: now,
    };
    const initialMovement: InventoryMovement = { id: nanoid(14), businessProfileId: activeId, productId: product.id, movementType: "initial", quantityDelta: initialStock, previousQuantity: 0, resultingQuantity: initialStock, note: "Opening stock", createdAt: now };
      await assertUniqueProductCodes(database, activeId, input.sku, input.barcode);
      assertCompanyScope(activeId, getActiveBusinessProfileId());
      await database.products.add(product);
      if (initialStock) await postStoreStockDelta(database,activeId,product.id,input.storeId,initialStock,initialMovement.id,"opening",now,0,initialStock);
      await database.inventoryMovements.add(initialMovement);
      await appendInventoryCostChange(database, product, initialStock, { sourceId: initialMovement.id, createdAt: now }, { opening: true, unitCostMinor: product.costPriceMinor });
      assertCompanyScope(activeId, getActiveBusinessProfileId());
    return product;
    });
  });
}

export async function updateProduct(productId: string, values: ProductFormValues, currency: string, database: TallybookDB = db) {
  return withCoordinatedRetailWrite(async () => {
    const company = getActiveBusinessProfileId();
    const input = productFormSchema.parse(values);
    return database.transaction("rw", [database.appMeta, database.products, database.categories, database.staffMembers], async () => {
    await assertRun7RetailWriteReady(database.appMeta);
    await requirePermission("inventory", database, company);
    const existing = await database.products.get(productId);
    if (!existing || existing.businessProfileId !== company || existing.archivedAt) throw new Error("This product is no longer active.");
    const normalizedName = normalizeName(input.name);
    const duplicate = await database.products.where("normalizedName").equals(normalizedName).and((product) => product.businessProfileId === company && product.id !== productId && !product.archivedAt).first();
    if (duplicate) throw new Error("An active product with this name already exists.");
    if (input.categoryId !== "uncategorized") {
      const category = await database.categories.get(input.categoryId);
      if (!category || category.businessProfileId !== company || category.archivedAt) throw new Error("Choose an active category or leave the product uncategorized.");
    }
    const initialStock = Number(input.initialStock);
    if (initialStock !== existing.stockQuantity) throw new Error("Use Adjust stock to change the quantity so the history remains complete.");
    const updated: Product = { ...existing, name: input.name.trim(), normalizedName, sku: cleanOptional(input.sku), barcode: cleanOptional(input.barcode), categoryId: input.categoryId === "uncategorized" ? undefined : input.categoryId, sellingPriceMinor: parseAmountToMinor(input.sellingPrice, currency), costPriceMinor: input.costPrice ? parseAmountToMinor(input.costPrice, currency) : undefined, ghanaTaxTreatment: input.ghanaTaxTreatment === "unclassified" ? undefined : input.ghanaTaxTreatment ?? existing.ghanaTaxTreatment, lowStockThreshold: Number(input.lowStockThreshold), updatedAt: new Date().toISOString() };
      await assertUniqueProductCodes(database, existing.businessProfileId, input.sku, input.barcode, productId);
      assertCompanyScope(company, getActiveBusinessProfileId());
      await database.products.put(updated);
      assertCompanyScope(company, getActiveBusinessProfileId());
    return updated;
    });
  });
}

export async function archiveProduct(productId: string, database: TallybookDB = db) {
  return withCoordinatedRetailWrite(async () => {
    const company = getActiveBusinessProfileId();
    return database.transaction("rw", [database.appMeta, database.products, database.staffMembers, database.storeStockModes, database.commerceHolds], async () => {
    await assertRun7RetailWriteReady(database.appMeta);
    await requirePermission("inventory", database, company);
    const product = await database.products.get(productId);
    if (!product || product.businessProfileId !== company || product.archivedAt) throw new Error("This product is already archived or unavailable.");
    if((await database.commerceHolds.where("[businessProfileId+productId]").equals([company,productId]).toArray()).some(h=>h.status==="active"&&Date.parse(h.expiresAt)>Date.now()))
      throw new Error("This product has customer reservations and cannot be archived.");
    if (await database.storeStockModes.get(company) && product.stockQuantity!==0)
      throw new Error("Transfer or reconcile all store units before archiving stock.");
    const archived = { ...product, archivedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    assertCompanyScope(company, getActiveBusinessProfileId());
    await database.products.put(archived);
    assertCompanyScope(company, getActiveBusinessProfileId());
    return archived;
    });
  });
}

export async function adjustStock(productId: string, values: StockAdjustmentValues, database: TallybookDB = db) {
  // Acquire the cross-tab shared lock before opening the IndexedDB write transaction.
  return withCrossTabDataLock("shared", () => adjustStockWhileLocked(productId, values, database));
}

async function adjustStockWhileLocked(productId: string, values: StockAdjustmentValues, database: TallybookDB = db) {
  const input = stockAdjustmentSchema.parse(values);
  const company = getActiveBusinessProfileId();
  return database.transaction("rw", [database.appMeta, database.products, database.inventoryMovements, database.inventoryCostEvents, database.inventoryBatches, database.staffMembers, database.staffAudits, database.storeStockModes, database.storeStockEntries, database.storeLocations, database.storeAssignments, database.storeTransferRequests, database.commerceHolds], async () => {
    await assertRun7RetailWriteReady(database.appMeta);
    const staff = await requirePermission("inventory", database, company);
    const product = await database.products.get(productId);
    if (!product || product.businessProfileId !== company || product.archivedAt) throw new Error("This product is unavailable for adjustment.");
    if (product.itemKind === "service") throw new Error("Services cannot have physical stock adjustments.");
    if (!Number.isSafeInteger(product.stockQuantity) || product.stockQuantity < 0) throw new Error("Stock needs reconciliation before adjustment.");
    if (input.movementType==="correction" && await database.storeStockModes.get(company))
      throw new Error("Company-wide stock correction is disabled after store activation. Record a store increase or decrease.");
    const requested = Number(input.quantity);
    const quantityDelta = input.movementType === "increase" ? requested : input.movementType === "decrease" ? -requested : requested - product.stockQuantity;
    const resultingQuantity = product.stockQuantity + quantityDelta;
    if (resultingQuantity < 0) throw new Error("You cannot reduce stock below zero.");
    if (!Number.isSafeInteger(resultingQuantity) || resultingQuantity > 9_999_999) throw new Error("Stock quantity exceeds supported limits.");
    const batches = await database.inventoryBatches.where("productId").equals(productId).and(b => b.businessProfileId === company).toArray();
    if (quantityDelta && batches.length) throw new Error("Reconcile batches before changing tracked stock.");
    const now = new Date().toISOString();
    if(quantityDelta<0 && resultingQuantity<await reservedRun16Units(database,company,productId,undefined,now))
      throw new Error("Customer orders reserve these stock units. Resolve reservations before reducing stock.");
    const movement: InventoryMovement = { id: nanoid(14), businessProfileId: company, productId, movementType: input.movementType, quantityDelta, previousQuantity: product.stockQuantity, resultingQuantity, note: cleanOptional(input.note), createdAt: now };
    assertCompanyScope(company, getActiveBusinessProfileId());
    await appendInventoryCostChange(database, product, quantityDelta, { sourceId: movement.id, createdAt: now });
    await database.products.put({ ...product, stockQuantity: resultingQuantity, updatedAt: now });
    if (quantityDelta) await postStoreStockDelta(database,company,productId,input.storeId,quantityDelta,movement.id,"adjustment",now,product.stockQuantity,resultingQuantity);
    await database.inventoryMovements.add(movement);
    if(staff)await database.staffAudits.add({id:nanoid(14),businessProfileId:staff.businessProfileId,staffId:staff.id,action:'inventory.adjusted',createdAt:now,details:movement.id});
    assertCompanyScope(company, getActiveBusinessProfileId());
    return movement;
  });
}

export function isLowStock(product: Product) { return product.stockQuantity <= product.lowStockThreshold; }
