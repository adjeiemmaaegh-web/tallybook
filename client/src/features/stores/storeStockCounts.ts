import { withCoordinatedRetailWrite } from "@/features/backup/coordinatedRetailWrite";
/** Store-specific physical count observations; NEVER authoritative inventory or transfer postings. */
import { nanoid } from "nanoid";
import { db, type TallybookDB } from "@/db/TallybookDB";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import { requirePermission, currentStaffId } from "@/features/staff/staff";

export interface StoreStockObservation {
  id: string;
  businessProfileId: string;
  storeId: string;
  productId: string;
  observedQuantity: number;
  recordedByStaffId: string;
  observedAt: string;
  note?: string;
}

export function validateStoreStockCount(quantity: number, note = "") {
  if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 9_999_999) {
    throw new Error("Count must be a whole number between 0 and 9,999,999.");
  }
  const cleanNote = note.trim();
  if (cleanNote.length > 240 || /[\u0000-\u001f\u007f]/.test(cleanNote)) throw new Error("Note must be 240 printable characters or fewer.");
  return { quantity, note: cleanNote };
}

export async function recordStoreStockObservation(storeId: string, productId: string, quantity: number, note = "", database: TallybookDB = db) {
  return withCoordinatedRetailWrite(async () => {
    const company = getActiveBusinessProfileId();
    const validated = validateStoreStockCount(quantity, note);
    return database.transaction("rw", [database.storeStockObservations, database.storeLocations, database.products, database.staffMembers, database.staffAudits], async () => {
      const member = await requirePermission("staff", database, company);
      const staffId = member?.id ?? currentStaffId(company);
      if (!staffId) throw new Error("An active staff identity is required to record store counts.");
      if (getActiveBusinessProfileId() !== company) throw new Error("Company changed while recording count.");
      const [store, product, staff] = await Promise.all([database.storeLocations.get(storeId), database.products.get(productId), database.staffMembers.get(staffId)]);
      if (!store || store.businessProfileId !== company || store.status !== "active") throw new Error("Store is not active in this company.");
      if (!product || product.businessProfileId !== company || product.archivedAt || product.itemKind === "service") throw new Error("Product is not active stock in this company.");
      if (!staff || staff.businessProfileId !== company || staff.disabledAt) throw new Error("Staff identity is not active in this company.");
      const entry: StoreStockObservation = { id: nanoid(), businessProfileId: company, storeId, productId, observedQuantity: validated.quantity, recordedByStaffId: staffId, observedAt: new Date().toISOString(), ...(validated.note ? { note: validated.note } : {}) };
      await database.storeStockObservations.add(entry);
      await database.staffAudits.add({id:nanoid(), businessProfileId:company, staffId, action:"store.stock.observed", createdAt:entry.observedAt, details:entry.id});
      return entry;
    });
  });
}

/** A separate observed-count view. Never subtract from or replace company stockQuantity. */
export async function listStoreStockObservations(storeId: string, database: TallybookDB = db) {
  const company = getActiveBusinessProfileId();
  return database.transaction("r", database.storeLocations, database.storeStockObservations, async () => {
    const store = await database.storeLocations.get(storeId);
    if (!store || store.businessProfileId !== company) throw new Error("Store not found in active company.");
    const entries = await database.storeStockObservations.where("[businessProfileId+storeId]").equals([company, storeId]).toArray();
    if (getActiveBusinessProfileId() !== company || entries.some(e => e.businessProfileId !== company || e.storeId !== storeId)) throw new Error("Count scope changed or invalid record detected.");
    return entries.sort((a,b) => b.observedAt.localeCompare(a.observedAt) || b.id.localeCompare(a.id));
  });
}
