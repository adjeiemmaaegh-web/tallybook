/** Tactile Ledger design reminder: stock is never silently overwritten—every quantity change leaves a clear local movement record. */
import { nanoid } from "nanoid";
import { z } from "zod";
import { db, type TallybookDB } from "@/db/TallybookDB";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";

export const INVENTORY_BUSINESS_ID = "primary" as const;

export const stockMovementTypes = ["initial", "increase", "decrease", "correction", "sale", "purchase"] as const;
export type StockMovementType = (typeof stockMovementTypes)[number];

export interface ProductCategory {
  id: string;
  businessProfileId: string;
  name: string;
  normalizedName: string;
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
  categoryId?: string;
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

export const categoryFormSchema = z.object({ name: nameSchema });

export const productFormSchema = z.object({
  name: nameSchema,
  sku: optionalText(48, "Reference"),
  categoryId: z.string(),
  sellingPrice: requiredAmount("Selling price"),
  costPrice: optionalAmount("Cost price"),
  initialStock: nonNegativeInteger("Opening stock"),
  lowStockThreshold: nonNegativeInteger("Low-stock level"),
});

export const stockAdjustmentSchema = z.object({
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
  const parsed = Number(normalizeMoneyInput(value));
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error("Enter a valid amount.");
  return Math.round(parsed * currencyMinorDivisor(currency));
}

export function formatMinorAmount(value: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: currencyMinorDivisor(currency) === 1 ? 0 : 2 }).format(value / currencyMinorDivisor(currency));
}

function cleanOptional(value: string | undefined) { const cleaned = value?.trim(); return cleaned || undefined; }

export async function getInventorySnapshot(database: TallybookDB = db): Promise<InventorySnapshot> {
  const activeId = getActiveBusinessProfileId();
  const [allCategories, allProducts, allMovements] = await Promise.all([
    database.categories.orderBy("name").toArray(),
    database.products.orderBy("name").toArray(),
    database.inventoryMovements.orderBy("createdAt").reverse().toArray(),
  ]);
  const categories = allCategories.filter((category) => category.businessProfileId === activeId);
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
  const input = categoryFormSchema.parse(values);
  const now = new Date().toISOString();
  const normalizedName = normalizeName(input.name);
  const activeId = getActiveBusinessProfileId();
  const duplicate = await database.categories.where("normalizedName").equals(normalizedName).and((category) => category.businessProfileId === activeId && !category.archivedAt).first();
  if (duplicate) throw new Error("A category with this name already exists.");
  const category: ProductCategory = { id: nanoid(12), businessProfileId: getActiveBusinessProfileId(), name: input.name.trim(), normalizedName, createdAt: now, updatedAt: now };
  await database.categories.add(category);
  return category;
}

export async function createProduct(values: ProductFormValues, currency: string, database: TallybookDB = db) {
  const input = productFormSchema.parse(values);
  const now = new Date().toISOString();
  const normalizedName = normalizeName(input.name);
  const initialStock = Number(input.initialStock);
  const activeId = getActiveBusinessProfileId();
  const duplicate = await database.products.where("normalizedName").equals(normalizedName).and((product) => product.businessProfileId === activeId && !product.archivedAt).first();
  if (duplicate) throw new Error("An active product with this name already exists.");
  if (input.categoryId !== "uncategorized") {
    const category = await database.categories.get(input.categoryId);
    if (!category || category.businessProfileId !== getActiveBusinessProfileId() || category.archivedAt) throw new Error("Choose an active category or leave the product uncategorized.");
  }
  const product: Product = {
    id: nanoid(12), businessProfileId: getActiveBusinessProfileId(), name: input.name.trim(), normalizedName,
    sku: cleanOptional(input.sku), categoryId: input.categoryId === "uncategorized" ? undefined : input.categoryId,
    sellingPriceMinor: parseAmountToMinor(input.sellingPrice, currency), costPriceMinor: input.costPrice ? parseAmountToMinor(input.costPrice, currency) : undefined,
    stockQuantity: initialStock, lowStockThreshold: Number(input.lowStockThreshold), createdAt: now, updatedAt: now,
  };
  const initialMovement: InventoryMovement = { id: nanoid(14), businessProfileId: getActiveBusinessProfileId(), productId: product.id, movementType: "initial", quantityDelta: initialStock, previousQuantity: 0, resultingQuantity: initialStock, note: "Opening stock", createdAt: now };
  await database.transaction("rw", database.products, database.inventoryMovements, async () => {
    await database.products.add(product);
    await database.inventoryMovements.add(initialMovement);
  });
  return product;
}

export async function updateProduct(productId: string, values: ProductFormValues, currency: string, database: TallybookDB = db) {
  const input = productFormSchema.parse(values);
  const existing = await database.products.get(productId);
  if (!existing || existing.businessProfileId !== getActiveBusinessProfileId() || existing.archivedAt) throw new Error("This product is no longer active.");
  const normalizedName = normalizeName(input.name);
  const duplicate = await database.products.where("normalizedName").equals(normalizedName).and((product) => product.id !== productId && !product.archivedAt).first();
  if (duplicate) throw new Error("An active product with this name already exists.");
  if (input.categoryId !== "uncategorized") {
    const category = await database.categories.get(input.categoryId);
    if (!category || category.businessProfileId !== getActiveBusinessProfileId() || category.archivedAt) throw new Error("Choose an active category or leave the product uncategorized.");
  }
  const initialStock = Number(input.initialStock);
  if (initialStock !== existing.stockQuantity) throw new Error("Use Adjust stock to change the quantity so the history remains complete.");
  const updated: Product = { ...existing, name: input.name.trim(), normalizedName, sku: cleanOptional(input.sku), categoryId: input.categoryId === "uncategorized" ? undefined : input.categoryId, sellingPriceMinor: parseAmountToMinor(input.sellingPrice, currency), costPriceMinor: input.costPrice ? parseAmountToMinor(input.costPrice, currency) : undefined, lowStockThreshold: Number(input.lowStockThreshold), updatedAt: new Date().toISOString() };
  await database.products.put(updated);
  return updated;
}

export async function archiveProduct(productId: string, database: TallybookDB = db) {
  const product = await database.products.get(productId);
  if (!product || product.businessProfileId !== getActiveBusinessProfileId() || product.archivedAt) throw new Error("This product is already archived or unavailable.");
  const archived = { ...product, archivedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await database.products.put(archived);
  return archived;
}

export async function adjustStock(productId: string, values: StockAdjustmentValues, database: TallybookDB = db) {
  const input = stockAdjustmentSchema.parse(values);
  const product = await database.products.get(productId);
  if (!product || product.businessProfileId !== getActiveBusinessProfileId() || product.archivedAt) throw new Error("This product is unavailable for adjustment.");
  const requested = Number(input.quantity);
  const quantityDelta = input.movementType === "increase" ? requested : input.movementType === "decrease" ? -requested : requested - product.stockQuantity;
  const resultingQuantity = product.stockQuantity + quantityDelta;
  if (resultingQuantity < 0) throw new Error("You cannot reduce stock below zero.");
  const now = new Date().toISOString();
  const movement: InventoryMovement = { id: nanoid(14), businessProfileId: getActiveBusinessProfileId(), productId, movementType: input.movementType, quantityDelta, previousQuantity: product.stockQuantity, resultingQuantity, note: cleanOptional(input.note), createdAt: now };
  await database.transaction("rw", database.products, database.inventoryMovements, async () => {
    await database.products.put({ ...product, stockQuantity: resultingQuantity, updatedAt: now });
    await database.inventoryMovements.add(movement);
  });
  return movement;
}

export function isLowStock(product: Product) { return product.stockQuantity <= product.lowStockThreshold; }
