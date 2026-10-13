import { describe, expect, it } from "vitest";
import { summarizeSyncStatus } from "./syncStatus";
import type { SyncOutboxEvent } from "./syncFoundation";
import type { LocalSyncDevice } from "./deviceRegistry";
const event: SyncOutboxEvent = { id:"e1", businessProfileId:"b1", deviceId:"d1", operationId:"o1", entityType:"sale", entityId:"s1", payloadDigest:"a".repeat(64), createdAt:"2026-10-09T12:00:00.000Z", status:"pending" };
const device: LocalSyncDevice = { id:"d1", businessProfileId:"b1", label:"Shop tablet", registeredAt:"2026-10-09T12:00:00.000Z", updatedAt:"2026-10-09T12:00:00.000Z", status:"active" };
describe("local sync diagnostics", () => {
  it("reports only scoped local metadata and never claims a server connection", () => {
    expect(summarizeSyncStatus("b1", { businessProfileId:"b1",enabled:true,updatedAt:"2026-10-09" }, [event], [device], [])).toMatchObject({ pendingEvents:1, activeDevices:1, consentEnabled:true, connectionState:"not-configured" });
  });
  it("rejects cross-company event leakage", () => { expect(() => summarizeSyncStatus("b2",undefined,[event],[],[])).toThrow(/Cross-company/); });
  it("rejects malformed device records", () => { expect(() => summarizeSyncStatus("b1",undefined,[],[{...device,status:"revoked"}],[])).toThrow(/timestamp/); });
  it("does not count local acknowledgements as pending", () => { const result = summarizeSyncStatus("b1",undefined,[{...event,status:"acknowledged",acknowledgedAt:"2026-10-09T13:00:00.000Z"}],[],[]); expect(result.pendingEvents).toBe(0); expect(result.acknowledgedLocally).toBe(1); });
});
