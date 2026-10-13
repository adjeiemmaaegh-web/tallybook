/** Read-only local synchronization diagnostics. Never treats queued events as server-delivered. */
import type { TallybookDB } from "@/db/TallybookDB";
import type { SyncConsent, SyncOutboxEvent } from "./syncFoundation";
import { validateOutboxEvent } from "./syncFoundation";
import type { LocalSyncDevice } from "./deviceRegistry";
import { validateLocalSyncDevice } from "./deviceRegistry";
import type { SyncConflict } from "./reconciliation";

export type SyncStatusSnapshot = {
  businessProfileId: string;
  consentEnabled: boolean;
  pendingEvents: number;
  acknowledgedLocally: number;
  activeDevices: number;
  revokedDevices: number;
  unresolvedConflicts: number;
  reviewedConflicts: number;
  newestPendingAt: string | null;
  connectionState: "not-configured";
};
const ID = /^[A-Za-z0-9:_-]{1,128}$/;
export function summarizeSyncStatus(businessProfileId: string, consent: SyncConsent | undefined, events: SyncOutboxEvent[], devices: LocalSyncDevice[], conflicts: SyncConflict[]): SyncStatusSnapshot {
  if (!ID.test(businessProfileId)) throw new Error("Invalid business ID.");
  if (consent && (consent.businessProfileId !== businessProfileId || typeof consent.enabled !== "boolean")) throw new Error("Invalid company synchronization preferences.");
  for (const event of events) {
    validateOutboxEvent(event);
    if (event.businessProfileId !== businessProfileId) throw new Error("Cross-company sync event found.");
  }
  for (const device of devices) {
    validateLocalSyncDevice(device);
    if (device.businessProfileId !== businessProfileId) throw new Error("Cross-company registered device found.");
  }
  for (const conflict of conflicts) {
    if (conflict.businessProfileId !== businessProfileId || !ID.test(conflict.id.replaceAll(":", "_")) || !["unresolved", "reviewed"].includes(conflict.status) || !["payload-mismatch", "operation-collision", "unknown-event"].includes(conflict.reason) || !Number.isFinite(Date.parse(conflict.detectedAt))) throw new Error("Invalid synchronization conflict record.");
  }
  const pending = events.filter(item => item.status === "pending");
  return {
    businessProfileId,
    consentEnabled: consent?.enabled === true,
    pendingEvents: pending.length,
    acknowledgedLocally: events.length - pending.length,
    activeDevices: devices.filter(item => item.status === "active").length,
    revokedDevices: devices.filter(item => item.status === "revoked").length,
    unresolvedConflicts: conflicts.filter(item => item.status === "unresolved").length,
    reviewedConflicts: conflicts.filter(item => item.status === "reviewed").length,
    newestPendingAt: pending.map(item => item.createdAt).sort().at(-1) ?? null,
    connectionState: "not-configured",
  };
}
export async function getLocalSyncStatus(db: TallybookDB, businessProfileId: string): Promise<SyncStatusSnapshot> {
  if (!ID.test(businessProfileId)) throw new Error("Invalid business ID.");
  return db.transaction("r", db.businessProfiles, db.syncConsents, db.syncOutbox, db.syncDevices, db.syncConflicts, async () => {
    if (!(await db.businessProfiles.get(businessProfileId))) throw new Error("Business not found.");
    const [consent, events, devices, conflicts] = await Promise.all([
      db.syncConsents.get(businessProfileId),
      db.syncOutbox.where("businessProfileId").equals(businessProfileId).toArray(),
      db.syncDevices.where("businessProfileId").equals(businessProfileId).toArray(),
      db.syncConflicts.where("businessProfileId").equals(businessProfileId).toArray(),
    ]);
    return summarizeSyncStatus(businessProfileId, consent, events, devices, conflicts);
  });
}
