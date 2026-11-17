/** Stage 8: reconcile a *previously authenticated* server journal receipt.
 * This is not a network client and does not validate transport credentials.
 * A caller must establish TLS, session, device and capability authorization first.
 * Journal receipts prove metadata staging only, never financial replication.
 */
import type { TallybookDB } from "@/db/TallybookDB";
import { validateOutboxEvent, type SyncOutboxEvent } from "./syncFoundation";
import {getActiveBusinessProfileId} from "@/features/business/activeCompany";
import {currentStaffId,requirePermission} from "@/features/staff/staff";
import {withCoordinatedRetailWrite} from "@/features/backup/coordinatedRetailWrite";
import {assertRun7RetailWriteReady} from "@/features/backup/run7RetailWriteBarrier.mjs";

export type JournalReceipt = {
  organizationId: string;
  eventId: string;
  operationId: string;
  status: "stored" | "duplicate" | "conflict";
  reason: string | null;
  financialReplicationEnabled: false;
};
const KEY = /^[A-Za-z0-9:_-]{1,128}$/;
export function validateJournalReceipt(receipt: JournalReceipt): void {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt) ||
      Object.keys(receipt).sort().join(",") !== "eventId,financialReplicationEnabled,operationId,organizationId,reason,status")
    throw new Error("Invalid journal receipt structure.");
  for (const value of [receipt.organizationId, receipt.eventId, receipt.operationId])
    if (typeof value !== "string" || !KEY.test(value)) throw new Error("Invalid journal receipt identifier.");
  if (receipt.financialReplicationEnabled !== false) throw new Error("Financial replication cannot be acknowledged.");
  if (receipt.status === "stored" && receipt.reason === null) return;
  if (receipt.status === "duplicate" && receipt.reason === "same-event") return;
  if (receipt.status === "conflict" && ["event-id-reuse", "operation-id-reuse"].includes(receipt.reason ?? "")) return;
  throw new Error("Invalid journal receipt outcome.");
}
export function classifyJournalReceipt(event: SyncOutboxEvent, receipt: JournalReceipt): "acknowledge" | "conflict" {
  validateOutboxEvent(event);
  validateJournalReceipt(receipt);
  if (event.businessProfileId !== receipt.organizationId || event.id !== receipt.eventId ||
      event.operationId !== receipt.operationId) throw new Error("Receipt does not match this local event.");
  return receipt.status === "conflict" ? "conflict" : "acknowledge";
}
/** Record metadata-only acknowledgement transactionally; never mutate ledgers. */
export async function acknowledgeStagedEvent(
  database: TallybookDB, businessProfileId: string, eventId: string, receipt: JournalReceipt,
  expectedEvent?:SyncOutboxEvent,
): Promise<"acknowledged" | "already-acknowledged" | "conflict"> {
  if (!KEY.test(businessProfileId) || !KEY.test(eventId) ||
      receipt?.organizationId !== businessProfileId || receipt?.eventId !== eventId)
    throw new Error("Invalid acknowledgement scope.");
  const actor=currentStaffId(businessProfileId);
  const scope=()=>{
    if(!actor||getActiveBusinessProfileId()!==businessProfileId||currentStaffId(businessProfileId)!==actor)
      throw new Error("Company or staff session changed before acknowledgement.");
  };
  scope();
  return withCoordinatedRetailWrite(()=>database.transaction("rw", [database.appMeta,database.staffMembers,database.businessProfiles, database.syncConsents, database.syncDevices, database.syncOutbox], async () => {
    await assertRun7RetailWriteReady(database.appMeta);
    const staff=await requirePermission('staff',database,businessProfileId);
    if(staff?.id!==actor)throw new Error("Acknowledgement actor changed.");
    if (!(await database.businessProfiles.get(businessProfileId))) throw new Error("Unknown business.");
    if ((await database.syncConsents.get(businessProfileId))?.enabled !== true) throw new Error("Synchronization consent is disabled.");
    const event = await database.syncOutbox.get(eventId);
    if (!event || event.businessProfileId !== businessProfileId) throw new Error("Unknown scoped event.");
    if(expectedEvent && !(['id','businessProfileId','deviceId','operationId','entityType','entityId','payloadDigest','createdAt'] as const)
        .every(key=>event[key]===expectedEvent[key]))
      throw new Error("Outbox changed after metadata delivery; preserve the pending event.");
    const device = await database.syncDevices.get(event.deviceId);
    if (!device || device.businessProfileId !== businessProfileId || device.status !== "active") throw new Error("Device not active.");
    const outcome = classifyJournalReceipt(event, receipt);
    scope();
    if (outcome === "conflict") return "conflict";
    if (event.status === "acknowledged") return "already-acknowledged";
    if (event.status !== "pending") throw new Error("Unexpected outbox status.");
    await database.syncOutbox.put({ ...event, status: "acknowledged", acknowledgedAt: new Date().toISOString() });
    return "acknowledged";
  }));
}
