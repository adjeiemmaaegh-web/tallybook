/** Stage 8: opt-in LOCAL registry, not remote authentication or a cloud identity. */
import type { TallybookDB } from "@/db/TallybookDB";
import { currentStaffId, currentStaffSessionGeneration, requirePermission } from "@/features/staff/staff";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import { withCoordinatedRetailWrite } from "@/features/backup/coordinatedRetailWrite";
import { assertRun7RetailWriteReady } from "@/features/backup/run7RetailWriteBarrier.mjs";

export type LocalSyncDevice = {
  id: string;
  businessProfileId: string;
  label: string;
  registeredAt: string;
  updatedAt: string;
  status: "active" | "revoked";
  revokedAt?: string;
};
const ID = /^[A-Za-z0-9:_-]{1,128}$/;
function activeRegistryScope(company:string,actor:string|null,generation:number){
  if(!actor||company!==getActiveBusinessProfileId()||currentStaffId(company)!==actor||currentStaffSessionGeneration(company)!==generation)
    throw new Error("Company or staff session changed in device registry.");
}
export function validateLocalSyncDevice(record: LocalSyncDevice): void {
  if (!ID.test(record.id) || !ID.test(record.businessProfileId)) throw new Error("Invalid device or business ID.");
  if (typeof record.label !== "string" || !record.label.trim() || record.label.length > 80 || /[\x00-\x1f]/.test(record.label)) throw new Error("Invalid device label.");
  if (!Number.isFinite(Date.parse(record.registeredAt)) || !Number.isFinite(Date.parse(record.updatedAt))) throw new Error("Invalid device timestamps.");
  if (record.status !== "active" && record.status !== "revoked") throw new Error("Invalid device status.");
  if (record.status === "revoked" && !Number.isFinite(Date.parse(record.revokedAt ?? ""))) throw new Error("Revoked device needs a timestamp.");
  if (record.status === "active" && record.revokedAt !== undefined) throw new Error("Active device cannot retain a revocation timestamp.");
}

/** Registry is not a source of authorization; future remote APIs must authenticate every request. */
export async function registerLocalSyncDevice(db: TallybookDB, businessProfileId: string, deviceId: string, label: string): Promise<LocalSyncDevice> {
  const timestamp = new Date().toISOString();
  const record: LocalSyncDevice = { id: deviceId, businessProfileId, label: label.trim(), registeredAt: timestamp, updatedAt: timestamp, status: "active" };
  validateLocalSyncDevice(record);
  const actor=currentStaffId(businessProfileId),generation=currentStaffSessionGeneration(businessProfileId);activeRegistryScope(businessProfileId,actor,generation);
  return withCoordinatedRetailWrite(()=>db.transaction("rw", [db.appMeta,db.businessProfiles, db.syncConsents, db.syncDevices, db.staffMembers], async () => {
    await assertRun7RetailWriteReady(db.appMeta);
    const staff=await requirePermission("staff", db, businessProfileId);
    if(staff?.id!==actor)throw new Error("Device registry actor changed.");
    if (!(await db.businessProfiles.get(businessProfileId))) throw new Error("Business not found.");
    if ((await db.syncConsents.get(businessProfileId))?.enabled !== true) throw new Error("Synchronization is not enabled for this business.");
    const existing = await db.syncDevices.get(deviceId);
    if (existing) {
      if (existing.businessProfileId !== businessProfileId) throw new Error("Device ID belongs to another business.");
      if (existing.status === "revoked") throw new Error("Revoked device cannot be reactivated automatically.");
      activeRegistryScope(businessProfileId,actor,generation);
      return existing;
    }
    activeRegistryScope(businessProfileId,actor,generation);
    await db.syncDevices.add(record);
    activeRegistryScope(businessProfileId,actor,generation);
    return record;
  }));
}

export async function listLocalSyncDevices(db: TallybookDB, businessProfileId: string): Promise<LocalSyncDevice[]> {
  if (!ID.test(businessProfileId)) throw new Error("Invalid business ID.");
  const actor=currentStaffId(businessProfileId),generation=currentStaffSessionGeneration(businessProfileId);
  await requirePermission("staff", db, businessProfileId);
  const devices=await db.syncDevices.where("businessProfileId").equals(businessProfileId).sortBy("registeredAt");
  if(getActiveBusinessProfileId()!==businessProfileId||currentStaffId(businessProfileId)!==actor||currentStaffSessionGeneration(businessProfileId)!==generation)
    throw new Error("Company or staff session changed while reading device registry.");
  return devices;
}

/** Local revocation blocks queueing by this device; it cannot revoke a remote session. */
export async function revokeLocalSyncDevice(db: TallybookDB, businessProfileId: string, deviceId: string): Promise<void> {
  if (!ID.test(businessProfileId) || !ID.test(deviceId)) throw new Error("Invalid identifier.");
  const actor=currentStaffId(businessProfileId),generation=currentStaffSessionGeneration(businessProfileId);activeRegistryScope(businessProfileId,actor,generation);
  await withCoordinatedRetailWrite(()=>db.transaction("rw", [db.appMeta,db.syncDevices, db.staffMembers], async () => {
    await assertRun7RetailWriteReady(db.appMeta);
    const staff=await requirePermission("staff", db, businessProfileId);
    if(staff?.id!==actor)throw new Error("Device registry actor changed.");
    const current = await db.syncDevices.get(deviceId);
    if (!current || current.businessProfileId !== businessProfileId) throw new Error("Device not found in this business.");
    activeRegistryScope(businessProfileId,actor,generation);
    if (current.status === "revoked") return;
    const now = new Date().toISOString();
    await db.syncDevices.put({ ...current, status: "revoked", revokedAt: now, updatedAt: now });
    activeRegistryScope(businessProfileId,actor,generation);
  }));
}
