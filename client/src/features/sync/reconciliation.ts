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
  status: "unresolved" | "reviewed" | "resolved";
  /** Set once, by an owner, when the conflict is resolved. Never edited afterwards. */
  resolution?: { decision: SyncConflictDecision; note: string; staffId: string; resolvedAt: string };
};
/** keep-local: the local ledger stays authoritative and the remote claim is not adopted (always allowed).
 *  duplicate-delivery: the same operation arrived again under another event id (operation collisions only).
 *  escalate: needs server-side reconciliation; the conflict stays visible as escalated evidence.
 *  None of these applies a remote financial or stock change: financial replication is not approved. */
export type SyncConflictDecision = "keep-local" | "duplicate-delivery" | "escalate";
export const SYNC_CONFLICT_DECISIONS: Readonly<Record<SyncConflict["reason"], readonly SyncConflictDecision[]>> = Object.freeze({
  "payload-mismatch": ["keep-local", "escalate"],
  "operation-collision": ["keep-local", "duplicate-delivery", "escalate"],
  "unknown-event": ["keep-local", "escalate"],
});
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

/** Owner-only, audited, write-once resolution of a recorded conflict. Touches only the conflict and the staff audit log:
 *  the ledger tables are not even in the transaction scope, so no resolution can change money or stock. */
export async function resolveSyncConflict(database: TallybookDB, conflictId: string,
  input: { decision: SyncConflictDecision; note: string }): Promise<SyncConflict> {
  if (typeof conflictId !== "string" || conflictId.length > 300 || !/^[A-Za-z0-9:_-]+$/.test(conflictId)) throw new Error("Invalid conflict.");
  const note = typeof input?.note === "string" ? input.note.trim() : "";
  if (note.length < 3 || note.length > 280) throw new Error("Write a short reason (3 to 280 characters) for the record.");
  const company = conflictId.split(":")[0]; checkId(company, "businessProfileId");
  const check = privateScope(company);
  return withCoordinatedRetailWrite(() => database.transaction("rw", [database.appMeta, database.businessProfiles, database.syncConflicts, database.staffMembers, database.staffAudits], async () => {
    check(); await assertRun7RetailWriteReady(database.appMeta);
    const owner = await requirePermission("staff", database, company);
    const conflict = await database.syncConflicts.get(conflictId);
    if (!conflict || conflict.businessProfileId !== company) throw new Error("Conflict not found.");
    if (conflict.status === "resolved" || conflict.resolution) throw new Error("This conflict was already resolved; resolutions are permanent.");
    if (!SYNC_CONFLICT_DECISIONS[conflict.reason]?.includes(input.decision)) throw new Error("That decision is not allowed for this kind of conflict.");
    const staffId = owner?.id ?? currentStaffId(company);
    if (!staffId) throw new Error("Owner sign-in required.");
    const resolved: SyncConflict = { ...conflict, status: "resolved", resolution: { decision: input.decision, note, staffId, resolvedAt: new Date().toISOString() } };
    await database.syncConflicts.put(resolved);
    await database.staffAudits.add({ id: `sync-conflict-${conflictId}`, businessProfileId: company, staffId, action: "sync.conflict.resolved",
      createdAt: resolved.resolution!.resolvedAt, details: JSON.stringify({ conflictId, reason: conflict.reason, decision: input.decision }) });
    check(); return resolved;
  }));
}
/** Every resolved conflict must carry its resolution and exactly one matching owner audit row (and vice versa). */
export function verifySyncConflictResolutions(conflicts: SyncConflict[], audits: Array<{ id: string; businessProfileId: string; staffId: string; action: string; details: string }>): string[] {
  const problems: string[] = [];
  const auditRows = audits.filter(a => a.action === "sync.conflict.resolved");
  for (const c of conflicts) {
    const mine = auditRows.filter(a => a.id === `sync-conflict-${c.id}`);
    if (c.status === "resolved") {
      let d: { conflictId?: string; decision?: string } = {};
      try { d = JSON.parse(mine[0]?.details ?? "{}"); } catch { /* reported below */ }
      if (!c.resolution || mine.length !== 1 || mine[0].businessProfileId !== c.businessProfileId || mine[0].staffId !== c.resolution.staffId ||
          d.conflictId !== c.id || d.decision !== c.resolution.decision || !SYNC_CONFLICT_DECISIONS[c.reason]?.includes(c.resolution.decision)) problems.push(c.id);
    } else if (c.resolution || mine.length) problems.push(c.id);
  }
  for (const a of auditRows) if (!conflicts.some(c => a.id === `sync-conflict-${c.id}`)) problems.push(a.id);
  return problems;
}
