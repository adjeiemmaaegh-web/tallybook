/** Local-store administrative report. Observations and proposals are not financial balances. */
import { db, type TallybookDB } from "@/db/TallybookDB";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import { requirePermission } from "@/features/staff/staff";
export async function getLocalStoreReport(database: TallybookDB = db) {
  const company = getActiveBusinessProfileId();
  await requirePermission("reports", database);
  return database.transaction("r", database.storeLocations, database.storeAssignments, database.storeStockObservations, database.storeTransferRequests, async () => {
    const [stores, assignments, counts, requests] = await Promise.all([
      database.storeLocations.where("businessProfileId").equals(company).toArray(),
      database.storeAssignments.where("businessProfileId").equals(company).toArray(),
      database.storeStockObservations.where("businessProfileId").equals(company).toArray(),
      database.storeTransferRequests.where("businessProfileId").equals(company).toArray(),
    ]);
    if (getActiveBusinessProfileId() !== company || [...stores, ...assignments, ...counts, ...requests].some(row => row.businessProfileId !== company)) throw new Error("Company context changed or invalid data.");
    return stores.map(store => ({
      storeId: store.id, name: store.name, status: store.status,
      assignedStaff: assignments.filter(a => a.storeId === store.id).length,
      physicalObservations: counts.filter(a => a.storeId === store.id).length,
      openTransferRequests: requests.filter(a => a.status === "requested" && (a.sourceStoreId === store.id || a.destinationStoreId === store.id)).length,
    }));
  });
}
