/** Stage 8 foundation: local opt-in and a durable, non-networked synchronization outbox.
 * Nothing in this module uploads data. An explicitly authorized remote adapter is required later.
 */
import type { TallybookDB } from "@/db/TallybookDB";
import { requirePermission } from "@/features/staff/staff";

export type SyncConsent = {
  businessProfileId: string;
  enabled: boolean;
  updatedAt: string;
};
export type SyncOutboxEvent = {
  id: string;
  businessProfileId: string;
  deviceId: string;
  operationId: string;
  entityType: string;
  entityId: string;
  payloadDigest: string;
  createdAt: string;
  status: "pending" | "acknowledged";
  acknowledgedAt?: string;
};

const SAFE_KIND = /^[a-z][a-z0-9-]{0,63}$/;
const SAFE_ID = /^[A-Za-z0-9:_-]{1,128}$/;
function requireId(id: string, name: string): void {
  if (typeof id !== "string" || !SAFE_ID.test(id)) throw new Error(`Invalid ${name}.`);
}
export function validateOutboxEvent(event: SyncOutboxEvent): void {
  requireId(event.id, "event ID");
  requireId(event.businessProfileId, "business ID");
  requireId(event.deviceId, "device ID");
  requireId(event.operationId, "operation ID");
  requireId(event.entityId, "entity ID");
  if (!SAFE_KIND.test(event.entityType)) throw new Error("Invalid entity type.");
  if (!/^[a-f0-9]{64}$/i.test(event.payloadDigest)) throw new Error("Invalid payload digest.");
  if (!Number.isFinite(Date.parse(event.createdAt))) throw new Error("Invalid timestamp.");
  if (event.status !== "pending" && event.status !== "acknowledged") throw new Error("Invalid status.");
  if (event.status === "acknowledged" && !Number.isFinite(Date.parse(event.acknowledgedAt ?? ""))) throw new Error("Acknowledged event needs an acknowledgement timestamp.");
}

/** Consent is scoped per company. Disabling leaves existing queued records untouched. */
export async function setSyncConsent(database: TallybookDB, businessProfileId: string, enabled: boolean): Promise<SyncConsent> {
  requireId(businessProfileId, "business ID");
  if (typeof enabled !== "boolean") throw new Error("Invalid consent flag.");
  return database.transaction("rw", [database.businessProfiles, database.syncConsents, database.staffMembers], async () => {
    await requirePermission("staff", database, businessProfileId);
    if (!(await database.businessProfiles.get(businessProfileId))) throw new Error("Business not found.");
    const consent = { businessProfileId, enabled, updatedAt: new Date().toISOString() };
    await database.syncConsents.put(consent);
    return consent;
  });
}

export async function enqueueSyncEvent(database: TallybookDB, event: SyncOutboxEvent): Promise<void> {
  validateOutboxEvent(event);
  if (event.status !== "pending" || event.acknowledgedAt) throw new Error("New events must be pending.");
  await database.transaction("rw", [database.businessProfiles, database.syncConsents, database.syncDevices, database.syncOutbox, database.staffMembers], async () => {
    await requirePermission("staff", database, event.businessProfileId);
    const consent = await database.syncConsents.get(event.businessProfileId);
    if (!(await database.businessProfiles.get(event.businessProfileId)) || consent?.enabled !== true) throw new Error("Connected synchronization is not enabled for this business.");
    const device = await database.syncDevices.get(event.deviceId);
    if (!device || device.businessProfileId !== event.businessProfileId || device.status !== "active") throw new Error("An active registered device is required to queue sync events.");
    const previous = await database.syncOutbox.get(event.id);
    if (previous) {
      if (JSON.stringify(previous) !== JSON.stringify(event)) throw new Error("Event ID already used with different details.");
      return;
    }
    const matching = await database.syncOutbox.where("[businessProfileId+operationId]").equals([event.businessProfileId, event.operationId]).first();
    if (matching) throw new Error("Operation already queued with a different event ID.");
    await database.syncOutbox.add(event);
  });
}

export async function listPendingSyncEvents(database: TallybookDB, businessProfileId: string): Promise<SyncOutboxEvent[]> {
  requireId(businessProfileId, "business ID");
  await requirePermission("staff", database, businessProfileId);
  return database.syncOutbox.where("[businessProfileId+status]").equals([businessProfileId, "pending"]).sortBy("createdAt");
}

