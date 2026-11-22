/** Offline-only reconciliation preflight. This never performs network I/O or applies remote writes. */
import type { TallybookDB } from "@/db/TallybookDB";
import { currentStaffId,currentStaffSessionGeneration,requirePermission } from "@/features/staff/staff";
import {getActiveBusinessProfileId} from "@/features/business/activeCompany";
import {withCoordinatedRetailWrite} from "@/features/backup/coordinatedRetailWrite";
import {assertRun7RetailWriteReady} from "@/features/backup/run7RetailWriteBarrier.mjs";
import type { SyncOutboxEvent } from "./syncFoundation";

export type SyncConflict = {
  id: string;
  businessProfileId: string;
  eventId: string;
  operationId: string;
  reason: "payload-mismatch" | "operation-collision" | "unknown-event";
  detectedAt: string;
  status: "unresolved" | "reviewed";
};
export type RemoteEventClaim = Pick<SyncOutboxEvent, "id" | "businessProfileId" | "deviceId" | "operationId" | "entityType" | "entityId" | "payloadDigest">;

const ID = /^[A-Za-z0-9:_-]{1,128}$/;
const DIGEST = /^[a-f0-9]{64}$/i;
const checkId = (value: string, name: string) => { if (typeof value !== "string" || !ID.test(value)) throw new Error(`Invalid ${name}.`); };
export function validateRemoteClaim(claim: RemoteEventClaim): void {
  for (const field of ["id", "businessProfileId", "deviceId", "operationId", "entityId"] as const) checkId(claim[field], field);
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(claim.entityType) || !DIGEST.test(claim.payloadDigest)) throw new Error("Invalid remote event metadata.");
}
export function classifyClaim(local: SyncOutboxEvent | undefined, sameOperation: SyncOutboxEvent | undefined, claim: RemoteEventClaim): "identical" | SyncConflict["reason"] {
  validateRemoteClaim(claim);
  if (!local && !sameOperation) return "unknown-event";
  if (!local && sameOperation) return "operation-collision";
  if (!local) return "unknown-event";
  if (local.businessProfileId !== claim.businessProfileId || local.operationId !== claim.operationId || local.deviceId !== claim.deviceId || local.entityType !== claim.entityType || local.entityId !== claim.entityId || local.payloadDigest.toLowerCase() !== claim.payloadDigest.toLowerCase()) return "payload-mismatch";
  return "identical";
}
function privateScope(company:string){
 const actor=currentStaffId(company),generation=currentStaffSessionGeneration(company);
 const check=()=>{
  if(company!==getActiveBusinessProfileId()||!actor||currentStaffId(company)!==actor||currentStaffSessionGeneration(company)!==generation)
   throw Error("Company or unlocked staff session changed during conflict inspection.");
 };
 check();return check;
}
/** Records detected mismatches without overwriting the local ledger or trusting a remote claim. */
export async function inspectRemoteClaim(database: TallybookDB, claim: RemoteEventClaim): Promise<"identical" | SyncConflict["reason"]> {
  claim=structuredClone(claim);validateRemoteClaim(claim);
  const check=privateScope(claim.businessProfileId);
  return withCoordinatedRetailWrite(()=>database.transaction("rw", [database.appMeta,database.businessProfiles, database.syncOutbox, database.syncConflicts, database.staffMembers], async () => {
    check();await assertRun7RetailWriteReady(database.appMeta);
    await requirePermission("staff", database, claim.businessProfileId);
    if (!(await database.businessProfiles.get(claim.businessProfileId))) throw new Error("Business not found.");
    const existing = await database.syncOutbox.get(claim.id);
    if (existing && existing.businessProfileId !== claim.businessProfileId) throw new Error("Cross-company event ID collision.");
    const byOperation = await database.syncOutbox.where("[businessProfileId+operationId]").equals([claim.businessProfileId, claim.operationId]).first();
    const result = classifyClaim(existing, byOperation, claim);
    if (result === "identical") {check();return result;}
    const conflictId = claim.businessProfileId+":"+claim.id;
    const prior = await database.syncConflicts.get(conflictId);
    if (prior && (prior.operationId !== claim.operationId || prior.reason !== result)) throw new Error("Conflicting claim details for an existing conflict record.");
    check();
    if (!prior) await database.syncConflicts.add({ id: conflictId, businessProfileId: claim.businessProfileId, eventId: claim.id, operationId: claim.operationId, reason: result, detectedAt: new Date().toISOString(), status: "unresolved" });
    check();return result;
  }));
}
export async function listUnresolvedSyncConflicts(database: TallybookDB, businessProfileId: string): Promise<SyncConflict[]> {
  checkId(businessProfileId, "businessProfileId");
  const check=privateScope(businessProfileId);
  return database.transaction("r",[database.appMeta,database.staffMembers,database.businessProfiles,database.syncConflicts],async()=>{
   await assertRun7RetailWriteReady(database.appMeta);
   await requirePermission("staff", database, businessProfileId);
   const conflicts=await database.syncConflicts.where("[businessProfileId+status]").equals([businessProfileId, "unresolved"]).toArray();
   check();return conflicts;
  });
}
