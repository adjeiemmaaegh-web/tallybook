import { withCoordinatedRetailWrite } from "@/features/backup/coordinatedRetailWrite";
import { withCrossTabDataLock } from "@/features/backup/crossTabDataLock.mjs";
import { activeStaffShift, requirePermission } from "@/features/staff/staff";
/** Tallybook Africa Stage 7: supplier and purchase records are local, immutable after completion, and atomically linked to positive stock movements. */
import { nanoid } from "nanoid";
import { z } from "zod";
import { db, type TallybookDB } from "@/db/TallybookDB";
import { INVENTORY_BUSINESS_ID, normalizeName, parseAmountToMinor, type InventoryMovement, type Product } from "@/features/inventory/inventory";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import { assertCompanyScope } from "@/features/business/companyScope.mjs";
import { checkedMinorSum } from "@/features/sales/creditLedger.mjs";
import { appendInventoryCostChange } from "@/features/inventory/costLedger";

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
  /** Present only on new receipts: historical records have no reliable currency evidence. */
  currency?: string;
  note?: string;
  submissionKey: string;
  createdAt: string;
  staffId?: string;
  shiftId?: string;
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
  const [allSupplierRecords, allPurchases, allLines] = await database.transaction("r", [database.suppliers, database.purchases, database.purchaseLines, database.staffMembers], async () => {
    await requirePermission("inventory",database,activeId);
    return Promise.all([database.suppliers.toArray(), database.purchases.orderBy("createdAt").reverse().toArray(), database.purchaseLines.toArray()]);
  });
  assertCompanyScope(activeId, getActiveBusinessProfileId());
  await requirePermission("inventory",database,activeId);
  const allSuppliers = allSupplierRecords.filter((supplier) => supplier.businessProfileId === activeId).sort((left, right) => left.name.localeCompare(right.name));
  const purchases = allPurchases.filter((purchase) => purchase.businessProfileId === activeId);
  const lines = allLines.filter((line) => line.businessProfileId === activeId);
  return { suppliers: allSuppliers.filter((supplier) => !supplier.archivedAt), archivedSuppliers: allSuppliers.filter((supplier) => Boolean(supplier.archivedAt)), purchases: purchases.map((purchase) => detail(purchase, lines)) };
}

/** Supplier writes are serialized with permissions and name uniqueness inside IndexedDB. */
export async function createSupplier(values: SupplierFormValues, database: TallybookDB = db) {
  return withCoordinatedRetailWrite(async () => {
    const input = supplierFormSchema.parse(values);
    const normalizedName = normalizeName(input.name);
    const activeId = getActiveBusinessProfileId();
    return database.transaction("rw", [database.suppliers, database.staffMembers, database.staffAudits], async () => {
      const staff = await requirePermission("inventory", database, activeId);
      const existing = await database.suppliers.where("normalizedName").equals(normalizedName)
        .and((supplier) => supplier.businessProfileId === activeId && !supplier.archivedAt).first();
      if (existing) throw new Error("An active supplier with this name already exists.");
      const now = new Date().toISOString();
      const supplier: Supplier = { id: nanoid(12), businessProfileId: activeId, name: input.name.trim(), normalizedName, phone: clean(input.phone), email: clean(input.email), address: clean(input.address), notes: clean(input.notes), createdAt: now, updatedAt: now };
      await database.suppliers.add(supplier);
      if (staff) await database.staffAudits.add({ id: nanoid(14), businessProfileId: activeId, staffId: staff.id, action: "supplier.created", createdAt: now, details: supplier.id });
      return supplier;
    });
  });
}

export async function updateSupplier(supplierId: string, values: SupplierFormValues, database: TallybookDB = db) {
  return withCoordinatedRetailWrite(async () => {
    const input = supplierFormSchema.parse(values);
    const activeId = getActiveBusinessProfileId();
    return database.transaction("rw", [database.suppliers, database.staffMembers, database.staffAudits], async () => {
      const staff = await requirePermission("inventory", database, activeId);
      const supplier = await database.suppliers.get(supplierId);
      if (!supplier || supplier.businessProfileId !== activeId || supplier.archivedAt) throw new Error("This supplier is no longer active.");
      const normalizedName = normalizeName(input.name);
      const duplicate = await database.suppliers.where("normalizedName").equals(normalizedName)
        .and((item) => item.businessProfileId === activeId && item.id !== supplierId && !item.archivedAt).first();
      if (duplicate) throw new Error("An active supplier with this name already exists.");
      const now = new Date().toISOString();
      const updated: Supplier = { ...supplier, name: input.name.trim(), normalizedName, phone: clean(input.phone), email: clean(input.email), address: clean(input.address), notes: clean(input.notes), updatedAt: now };
      await database.suppliers.put(updated);
      if (staff) await database.staffAudits.add({ id: nanoid(14), businessProfileId: activeId, staffId: staff.id, action: "supplier.updated", createdAt: now, details: supplier.id });
      return updated;
    });
  });
}

export async function archiveSupplier(supplierId: string, database: TallybookDB = db) {
  return withCoordinatedRetailWrite(async () => {
    const activeId = getActiveBusinessProfileId();
    return database.transaction("rw", [database.suppliers, database.staffMembers, database.staffAudits], async () => {
      const staff = await requirePermission("inventory", database, activeId);
      const supplier = await database.suppliers.get(supplierId);
      if (!supplier || supplier.businessProfileId !== activeId || supplier.archivedAt) throw new Error("This supplier is already archived or unavailable.");
      const now = new Date().toISOString();
      const archived = { ...supplier, archivedAt: now, updatedAt: now };
      await database.suppliers.put(archived);
      if (staff) await database.staffAudits.add({ id: nanoid(14), businessProfileId: activeId, staffId: staff.id, action: "supplier.archived", createdAt: now, details: supplier.id });
      return archived;
    });
  });
}

export async function completePurchase(values: PurchaseFormValues, currency: string, database: TallybookDB = db) {
  // Acquire the cross-tab shared lock before opening the IndexedDB write transaction.
  return withCrossTabDataLock("shared", () => completePurchaseWhileLocked(values, currency, database));
}

async function completePurchaseWhileLocked(values: PurchaseFormValues, currency: string, database: TallybookDB = db) {
  const activeId = getActiveBusinessProfileId();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Choose a supported business currency before saving a purchase.");
  const input = purchaseFormSchema.parse(values); const submissionKey = input.submissionKey ?? nanoid(18);
  if (new Set(input.lines.map((line) => line.productId)).size !== input.lines.length) throw new Error("Add each product only once to a purchase.");
  if (new Date(input.purchaseDate + "T00:00:00Z").toISOString().slice(0, 10) !== input.purchaseDate) throw new Error("Choose a valid purchase date.");
  return database.transaction("rw", [database.suppliers, database.products, database.purchases, database.purchaseLines, database.inventoryMovements, database.inventoryCostEvents, database.inventoryBatches, database.staffMembers, database.staffShifts, database.staffAudits], async () => {
    const now = new Date().toISOString();
    const staff=await requirePermission("inventory", database, activeId);
    const shift=await activeStaffShift(staff,database);
    const existing = await database.purchases.where("submissionKey").equals(submissionKey).and((purchase) => purchase.businessProfileId === activeId).first();
    if (existing) {
      const savedLines = await database.purchaseLines.where("purchaseId").equals(existing.id).toArray();
      const submitted = input.lines.map(line => ({productId:line.productId,quantity:Number(line.quantity),unitCostMinor:parseAmountToMinor(line.unitCost,currency)}))
        .sort((a,b)=>a.productId.localeCompare(b.productId));
      const stored = savedLines.map(line => ({productId:line.productId,quantity:line.quantity,unitCostMinor:line.unitCostMinor}))
        .sort((a,b)=>a.productId.localeCompare(b.productId));
      if (existing.currency !== undefined && existing.currency !== currency) throw new Error("Purchase submission key has a different currency snapshot.");
      if (existing.supplierId!==input.supplierId || existing.purchaseDate!==input.purchaseDate || (existing.note??'')!==(clean(input.note)??'') ||
        JSON.stringify(submitted)!==JSON.stringify(stored)) throw new Error("Purchase submission key was reused for different details.");
      return existing;
    }
    const supplier = await database.suppliers.get(input.supplierId);
    if (!supplier || supplier.businessProfileId !== activeId || supplier.archivedAt) throw new Error("Choose an active supplier before completing a purchase.");
    const products = await Promise.all(input.lines.map((line) => database.products.get(line.productId)));
    if (products.some((product) => !product || product.businessProfileId !== activeId || product.archivedAt)) throw new Error("Every purchased product must still be active.");
    const resolvedProducts = products as Product[];
    for (const product of resolvedProducts) {
      if (product.itemKind === "service") throw new Error(`Services such as ${product.name} cannot be received as physical stock.`);
      const tracked = await database.inventoryBatches.where("productId").equals(product.id).toArray();
      if (tracked.some(batch => batch.businessProfileId === activeId)) throw new Error(`Receive ${product.name} through batch-aware receiving before increasing tracked stock.`);
    }
    const purchaseId = nanoid(14);
    const lines = input.lines.map((line, index) => { const unitCostMinor = parseAmountToMinor(line.unitCost, currency); const quantity = Number(line.quantity); return { id: nanoid(14), purchaseId, productId: line.productId, businessProfileId: activeId, productName: resolvedProducts[index].name, quantity, unitCostMinor, lineTotalMinor: unitCostMinor * quantity } satisfies PurchaseLine; });
    const totalCostMinor = checkedMinorSum(lines, "lineTotalMinor");
    const purchase: Purchase = { id: purchaseId, businessProfileId: activeId, supplierId: supplier.id, supplierName: supplier.name, purchaseDate: input.purchaseDate, totalCostMinor, currency, note: clean(input.note), submissionKey, createdAt: now, ...(staff ? {staffId:staff.id} : {}), ...(shift ? {shiftId:shift.id} : {}) };
    const movements: InventoryMovement[] = lines.map((line, index) => { const product = resolvedProducts[index]; const resultingQuantity = product.stockQuantity + line.quantity; return { id: nanoid(14), businessProfileId: activeId, productId: product.id, purchaseId, movementType: "purchase", quantityDelta: line.quantity, previousQuantity: product.stockQuantity, resultingQuantity, note: `Purchase from ${supplier.name}`, createdAt: now }; });
    if (movements.some(m => !Number.isSafeInteger(m.previousQuantity) || m.previousQuantity < 0 || !Number.isSafeInteger(m.resultingQuantity) || m.resultingQuantity > 9_999_999)) throw new Error("Purchase stock quantity exceeds supported limits or needs reconciliation.");
    await database.purchases.add(purchase); await database.purchaseLines.bulkAdd(lines);
    for (const [index, line] of lines.entries()) await appendInventoryCostChange(database, resolvedProducts[index], line.quantity, { sourceId: movements[index].id, createdAt: now, purchaseId }, { unitCostMinor: line.unitCostMinor });
    await Promise.all(resolvedProducts.map((product, index) => database.products.put({ ...product, stockQuantity: movements[index].resultingQuantity, updatedAt: now })));
    await database.inventoryMovements.bulkAdd(movements);
    if(staff)await database.staffAudits.add({id:nanoid(14),businessProfileId:activeId,staffId:staff.id,action:'purchase.completed',createdAt:now,details:purchase.id});
    return purchase;
  });
}
