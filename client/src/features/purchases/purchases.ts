/** Tallybook Africa Stage 7: supplier and purchase records are local, immutable after completion, and atomically linked to positive stock movements. */
import { nanoid } from "nanoid";
import { z } from "zod";
import { db, type TallybookDB } from "@/db/TallybookDB";
import { INVENTORY_BUSINESS_ID, normalizeName, parseAmountToMinor, type InventoryMovement, type Product } from "@/features/inventory/inventory";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";

export interface Supplier {
  id: string;
  businessProfileId: string;
  name: string;
  normalizedName: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Purchase {
  id: string;
  businessProfileId: string;
  supplierId: string;
  supplierName: string;
  purchaseDate: string;
  totalCostMinor: number;
  note?: string;
  submissionKey: string;
  createdAt: string;
}

export interface PurchaseLine {
  id: string;
  purchaseId: string;
  productId: string;
  businessProfileId: string;
  productName: string;
  quantity: number;
  unitCostMinor: number;
  lineTotalMinor: number;
}

export interface PurchaseDetail extends Purchase { lines: PurchaseLine[]; }
export interface PurchasesSnapshot { suppliers: Supplier[]; archivedSuppliers: Supplier[]; purchases: PurchaseDetail[]; }

const nameSchema = z.string().trim().min(2, "Use at least 2 characters.").max(100, "Use 100 characters or fewer.");
const optionalText = (maximum: number, label: string) => z.string().trim().max(maximum, `${label} must be ${maximum} characters or fewer.`).optional().or(z.literal(""));
const positiveQuantity = z.string().trim().regex(/^\d+$/, "Quantity must be a whole number.").refine((value) => Number(value) > 0 && Number(value) <= 9_999_999, "Quantity must be between 1 and 9,999,999.");
const cost = z.string().trim().regex(/^\d+(?:[.,]\d{1,2})?$/, "Unit cost must be a valid amount.");

export const supplierFormSchema = z.object({ name: nameSchema, phone: optionalText(40, "Phone"), email: optionalText(120, "Email"), address: optionalText(240, "Address"), notes: optionalText(240, "Notes") });
export const purchaseFormSchema = z.object({ supplierId: z.string().min(1, "Choose a supplier."), purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a purchase date."), note: optionalText(240, "Note"), lines: z.array(z.object({ productId: z.string().min(1, "Choose a product."), quantity: positiveQuantity, unitCost: cost })).min(1, "Add at least one product."), submissionKey: z.string().trim().min(8).max(80).optional() });
export type SupplierFormValues = z.infer<typeof supplierFormSchema>;
export type PurchaseFormValues = z.infer<typeof purchaseFormSchema>;

function clean(value: string | undefined) { const result = value?.trim(); return result || undefined; }

function detail(purchase: Purchase, lines: PurchaseLine[]): PurchaseDetail { return { ...purchase, lines: lines.filter((line) => line.purchaseId === purchase.id) }; }

export async function getPurchasesSnapshot(database: TallybookDB = db): Promise<PurchasesSnapshot> {
  const activeId = getActiveBusinessProfileId();
  const [allSupplierRecords, allPurchases, allLines] = await Promise.all([database.suppliers.toArray(), database.purchases.orderBy("createdAt").reverse().toArray(), database.purchaseLines.toArray()]);
  const allSuppliers = allSupplierRecords.filter((supplier) => supplier.businessProfileId === activeId).sort((left, right) => left.name.localeCompare(right.name));
  const purchases = allPurchases.filter((purchase) => purchase.businessProfileId === activeId);
  const lines = allLines.filter((line) => line.businessProfileId === activeId);
  return { suppliers: allSuppliers.filter((supplier) => !supplier.archivedAt), archivedSuppliers: allSuppliers.filter((supplier) => Boolean(supplier.archivedAt)), purchases: purchases.map((purchase) => detail(purchase, lines)) };
}

export async function createSupplier(values: SupplierFormValues, database: TallybookDB = db) {
  const input = supplierFormSchema.parse(values); const normalizedName = normalizeName(input.name);
  const activeId = getActiveBusinessProfileId();
  const existing = await database.suppliers.where("normalizedName").equals(normalizedName).and((supplier) => supplier.businessProfileId === activeId && !supplier.archivedAt).first();
  if (existing) throw new Error("An active supplier with this name already exists.");
  const now = new Date().toISOString();
  const supplier: Supplier = { id: nanoid(12), businessProfileId: getActiveBusinessProfileId(), name: input.name.trim(), normalizedName, phone: clean(input.phone), email: clean(input.email), address: clean(input.address), notes: clean(input.notes), createdAt: now, updatedAt: now };
  await database.suppliers.add(supplier); return supplier;
}

export async function updateSupplier(supplierId: string, values: SupplierFormValues, database: TallybookDB = db) {
  const input = supplierFormSchema.parse(values); const supplier = await database.suppliers.get(supplierId);
  if (!supplier || supplier.businessProfileId !== getActiveBusinessProfileId() || supplier.archivedAt) throw new Error("This supplier is no longer active.");
  const activeId = getActiveBusinessProfileId();
  const normalizedName = normalizeName(input.name); const duplicate = await database.suppliers.where("normalizedName").equals(normalizedName).and((item) => item.businessProfileId === activeId && item.id !== supplierId && !item.archivedAt).first();
  if (duplicate) throw new Error("An active supplier with this name already exists.");
  const updated: Supplier = { ...supplier, name: input.name.trim(), normalizedName, phone: clean(input.phone), email: clean(input.email), address: clean(input.address), notes: clean(input.notes), updatedAt: new Date().toISOString() };
  await database.suppliers.put(updated); return updated;
}

export async function archiveSupplier(supplierId: string, database: TallybookDB = db) {
  const supplier = await database.suppliers.get(supplierId);
  if (!supplier || supplier.businessProfileId !== getActiveBusinessProfileId() || supplier.archivedAt) throw new Error("This supplier is already archived or unavailable.");
  const archived = { ...supplier, archivedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await database.suppliers.put(archived); return archived;
}

export async function completePurchase(values: PurchaseFormValues, currency: string, database: TallybookDB = db) {
  const input = purchaseFormSchema.parse(values); const now = new Date().toISOString(); const submissionKey = input.submissionKey ?? nanoid(18);
  if (new Set(input.lines.map((line) => line.productId)).size !== input.lines.length) throw new Error("Add each product only once to a purchase.");
  return database.transaction("rw", [database.suppliers, database.products, database.purchases, database.purchaseLines, database.inventoryMovements], async () => {
    const activeId = getActiveBusinessProfileId();
    const existing = await database.purchases.where("submissionKey").equals(submissionKey).and((purchase) => purchase.businessProfileId === activeId).first();
    if (existing) return existing;
    const supplier = await database.suppliers.get(input.supplierId);
    if (!supplier || supplier.businessProfileId !== activeId || supplier.archivedAt) throw new Error("Choose an active supplier before completing a purchase.");
    const products = await Promise.all(input.lines.map((line) => database.products.get(line.productId)));
    if (products.some((product) => !product || product.businessProfileId !== activeId || product.archivedAt)) throw new Error("Every purchased product must still be active.");
    const resolvedProducts = products as Product[];
    const purchaseId = nanoid(14);
    const lines = input.lines.map((line, index) => { const unitCostMinor = parseAmountToMinor(line.unitCost, currency); const quantity = Number(line.quantity); return { id: nanoid(14), purchaseId, productId: line.productId, businessProfileId: activeId, productName: resolvedProducts[index].name, quantity, unitCostMinor, lineTotalMinor: unitCostMinor * quantity } satisfies PurchaseLine; });
    const purchase: Purchase = { id: purchaseId, businessProfileId: getActiveBusinessProfileId(), supplierId: supplier.id, supplierName: supplier.name, purchaseDate: input.purchaseDate, totalCostMinor: lines.reduce((total, line) => total + line.lineTotalMinor, 0), note: clean(input.note), submissionKey, createdAt: now };
    const movements: InventoryMovement[] = lines.map((line, index) => { const product = resolvedProducts[index]; const resultingQuantity = product.stockQuantity + line.quantity; return { id: nanoid(14), businessProfileId: getActiveBusinessProfileId(), productId: product.id, purchaseId, movementType: "purchase", quantityDelta: line.quantity, previousQuantity: product.stockQuantity, resultingQuantity, note: `Purchase from ${supplier.name}`, createdAt: now }; });
    await database.purchases.add(purchase); await database.purchaseLines.bulkAdd(lines);
    await Promise.all(resolvedProducts.map((product, index) => database.products.put({ ...product, stockQuantity: movements[index].resultingQuantity, updatedAt: now })));
    await database.inventoryMovements.bulkAdd(movements);
    return purchase;
  });
}
