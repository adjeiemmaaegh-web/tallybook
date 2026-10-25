import { withCoordinatedRetailWrite } from "@/features/backup/coordinatedRetailWrite";
/** Stage 9 local store directory. This is not cross-device synchronization or a second sales ledger. */
import { nanoid } from "nanoid";
import type { TallybookDB } from "@/db/TallybookDB";
import { db } from "@/db/TallybookDB";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import { assertCompanyScope } from "@/features/business/companyScope.mjs";
import { requirePermission, currentStaffId } from "@/features/staff/staff";

export interface StoreLocation { id: string; businessProfileId: string; name: string; normalizedName: string; status: "active" | "closed"; createdAt: string; updatedAt: string; }
export interface StoreAssignment { id: string; businessProfileId: string; storeId: string; staffId: string; assignedAt: string; }
export function normalizeStoreName(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed || trimmed.length > 80 || /[\u0000-\u001f\u007f]/.test(trimmed)) throw new Error("Store name must contain 1–80 printable characters.");
  return trimmed.toLocaleLowerCase();
}
export async function listStores(database: TallybookDB = db) {
  const company = getActiveBusinessProfileId();
  const rows = await database.storeLocations.where("businessProfileId").equals(company).toArray();
  if (getActiveBusinessProfileId() !== company || rows.some(row => row.businessProfileId !== company))
    throw new Error("Company changed while loading stores.");
  return rows;
}
export async function createStore(name: string, database: TallybookDB = db): Promise<StoreLocation> {
  return withCoordinatedRetailWrite(async () => {
    const normalizedName = normalizeStoreName(name);
    const company = getActiveBusinessProfileId();
    const now = new Date().toISOString();
    const record: StoreLocation = { id: nanoid(), businessProfileId: company, name: name.trim().replace(/\s+/g, " "), normalizedName, status: "active", createdAt: now, updatedAt: now };
    await database.transaction("rw", [database.storeLocations, database.businessProfiles, database.staffMembers, database.staffAudits], async () => {
      assertCompanyScope(company, getActiveBusinessProfileId());
      const actor = await requirePermission("staff", database, company);
      if (getActiveBusinessProfileId() !== company || !(await database.businessProfiles.get(company))) throw new Error("Company changed during store creation.");
      if (await database.storeLocations.where("[businessProfileId+normalizedName]").equals([company, normalizedName]).first()) throw new Error("A store with this name already exists.");
      assertCompanyScope(company, getActiveBusinessProfileId());
      await database.storeLocations.add(record);
      if (actor) await database.staffAudits.add({id:nanoid(), businessProfileId:company, staffId:actor.id, action:"store.created", createdAt:now, details:record.id});
      assertCompanyScope(company, getActiveBusinessProfileId());
    });
    assertCompanyScope(company, getActiveBusinessProfileId());
    return record;
  });
}
export async function assignStore(storeId: string, staffId: string, database: TallybookDB = db): Promise<StoreAssignment> {
  return withCoordinatedRetailWrite(async () => {
    const company = getActiveBusinessProfileId();
    return database.transaction("rw", [database.storeAssignments, database.storeLocations, database.staffMembers, database.staffAudits], async () => {
      assertCompanyScope(company, getActiveBusinessProfileId());
      const actor = await requirePermission("staff", database, company);
      if (getActiveBusinessProfileId() !== company) throw new Error("Company changed during assignment.");
      const [store, member] = await Promise.all([database.storeLocations.get(storeId), database.staffMembers.get(staffId)]);
      if (!store || store.businessProfileId !== company || store.status !== "active") throw new Error("Select an active store in this company.");
      if (!member || member.businessProfileId !== company || member.disabledAt) throw new Error("Select an active staff member in this company.");
      const existing = await database.storeAssignments.where("[businessProfileId+staffId+storeId]").equals([company, staffId, storeId]).first();
      if (existing) { assertCompanyScope(company, getActiveBusinessProfileId()); return existing; }
      const entry: StoreAssignment = { id: nanoid(), businessProfileId: company, staffId, storeId, assignedAt: new Date().toISOString() };
      assertCompanyScope(company, getActiveBusinessProfileId());
      await database.storeAssignments.add(entry);
      if (actor) await database.staffAudits.add({id:nanoid(), businessProfileId:company, staffId:actor.id, action:"store.staff.assigned", createdAt:entry.assignedAt, details:`${storeId}:${staffId}`});
      assertCompanyScope(company, getActiveBusinessProfileId());
      return entry;
    });
  });
}
export async function listStoreAssignments(database: TallybookDB = db) {
  const company = getActiveBusinessProfileId();
  const rows = await database.storeAssignments.where("businessProfileId").equals(company).toArray();
  if (getActiveBusinessProfileId() !== company || rows.some(row => row.businessProfileId !== company))
    throw new Error("Company changed while loading store assignments.");
  return rows;
}
/** Revalidation belongs at every attendant action; selecting a location in UI is not authorization. */
export async function requireAttendantStore(storeId: string, database: TallybookDB = db) {
  const company = getActiveBusinessProfileId();
  return database.transaction("r", [database.storeAssignments, database.storeLocations, database.staffMembers], async () => {
    const member = await requirePermission("sell", database, company);
    const staffId = member?.id ?? currentStaffId(company);
    if (!staffId) throw new Error("Unlock a staff account to use attendant mode.");
    const store = await database.storeLocations.get(storeId);
    const actor = await database.staffMembers.get(staffId);
    if (getActiveBusinessProfileId() !== company || !store || store.businessProfileId !== company || store.status !== "active" || !actor || actor.businessProfileId !== company || actor.disabledAt) throw new Error("Store or staff authorization is no longer valid.");
    const assignment = await database.storeAssignments.where("[businessProfileId+staffId+storeId]").equals([company, staffId, storeId]).first();
    if (!assignment) throw new Error("This staff member is not assigned to this store.");
    return { store, staffId };
  });
}
