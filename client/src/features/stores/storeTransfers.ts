import { withCoordinatedRetailWrite } from "@/features/backup/coordinatedRetailWrite";
/** Stage 9 transfer requests. These are proposals, NEVER stock or accounting postings. */
import { nanoid } from "nanoid";
import { db, type TallybookDB } from "@/db/TallybookDB";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import { requirePermission, currentStaffId } from "@/features/staff/staff";

export interface StoreTransferRequest {
  id: string; businessProfileId: string; sourceStoreId: string; destinationStoreId: string;
  productId: string; quantity: number; status: "requested" | "cancelled";
  requestedByStaffId: string; createdAt: string; cancelledAt?: string;
}
export function validateTransferRequest(source: string, destination: string, product: string, quantity: number) {
  if (!source || !destination || source === destination) throw new Error("Select two different stores.");
  if (!product || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 9_999_999) throw new Error("Transfer quantity must be a positive whole number.");
}
export async function requestStoreTransfer(sourceStoreId: string, destinationStoreId: string, productId: string, quantity: number, database: TallybookDB = db) {
  return withCoordinatedRetailWrite(async () => {
    validateTransferRequest(sourceStoreId, destinationStoreId, productId, quantity);
    const company = getActiveBusinessProfileId();
    return database.transaction("rw", [database.storeTransferRequests, database.storeLocations, database.products, database.staffMembers, database.staffAudits], async () => {
      const member = await requirePermission("staff", database, company);
      const staffId = member?.id ?? currentStaffId(company);
      if (!staffId) throw new Error("Active staff identity required.");
      if (getActiveBusinessProfileId() !== company) throw new Error("Company changed.");
      const [source, destination, product, actor] = await Promise.all([database.storeLocations.get(sourceStoreId), database.storeLocations.get(destinationStoreId), database.products.get(productId), database.staffMembers.get(staffId)]);
      if ([source,destination].some(s => !s || s.businessProfileId !== company || s.status !== "active")) throw new Error("Both stores must be active in the same company.");
      if (!product || product.businessProfileId !== company || product.archivedAt || product.itemKind === "service") throw new Error("Valid stock product required.");
      if (!actor || actor.businessProfileId !== company || actor.disabledAt) throw new Error("Staff identity invalid.");
      const entry: StoreTransferRequest = { id: nanoid(), businessProfileId: company, sourceStoreId, destinationStoreId, productId, quantity, status: "requested", requestedByStaffId: staffId, createdAt: new Date().toISOString() };
      await database.storeTransferRequests.add(entry);
      await database.staffAudits.add({id:nanoid(), businessProfileId:company, staffId, action:"store.transfer.requested", createdAt:entry.createdAt, details:entry.id});
      return entry;
    });
  });
}
export async function cancelStoreTransfer(requestId: string, database: TallybookDB = db) {
  return withCoordinatedRetailWrite(async () => {
    const company = getActiveBusinessProfileId();
    return database.transaction("rw", [database.storeTransferRequests, database.staffMembers, database.staffAudits], async () => {
      const actor = await requirePermission("staff", database, company);
      const record = await database.storeTransferRequests.get(requestId);
      if (!record || record.businessProfileId !== company || getActiveBusinessProfileId() !== company) throw new Error("Request not found in company.");
      if (record.status === "cancelled") return record;
      const updated: StoreTransferRequest = { ...record, status: "cancelled", cancelledAt: new Date().toISOString() };
      await database.storeTransferRequests.put(updated);
      if (actor) await database.staffAudits.add({id:nanoid(), businessProfileId:company, staffId:actor.id, action:"store.transfer.cancelled", createdAt:updated.cancelledAt!, details:requestId});
      return updated;
    });
  });
}
export async function listStoreTransferRequests(database: TallybookDB = db) {
  const company = getActiveBusinessProfileId();
  const records = await database.storeTransferRequests.where("businessProfileId").equals(company).toArray();
  if (getActiveBusinessProfileId() !== company || records.some(r => r.businessProfileId !== company)) throw new Error("Company changed while loading transfers.");
  return records.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
}
