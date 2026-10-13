import { describe, expect, it } from "vitest";
import { classifyJournalReceipt, validateJournalReceipt } from "./outboxAcknowledgements";
import type { SyncOutboxEvent } from "./syncFoundation";
const event: SyncOutboxEvent = { id: "event1", businessProfileId: "business1", deviceId: "device1", operationId: "op1", entityType: "sale", entityId: "sale1", payloadDigest: "a".repeat(64), status: "pending", createdAt: "2026-10-09T12:00:00.000Z" };
const receipt = { organizationId: "business1", eventId: "event1", operationId: "op1", status: "stored" as const, reason: null, financialReplicationEnabled: false as const };
describe("metadata journal receipt reconciliation", () => {
  it("accepts exact stored receipt", () => expect(classifyJournalReceipt(event,receipt)).toBe("acknowledge"));
  it("accepts exact duplicate without reapplying business data", () => expect(classifyJournalReceipt(event,{...receipt,status:"duplicate",reason:"same-event"})).toBe("acknowledge"));
  it("keeps conflicts pending", () => expect(classifyJournalReceipt(event,{...receipt,status:"conflict",reason:"event-id-reuse"})).toBe("conflict"));
  it("rejects different organization", () => expect(() => classifyJournalReceipt(event,{...receipt,organizationId:"other"})).toThrow());
  it("rejects different operation", () => expect(() => classifyJournalReceipt(event,{...receipt,operationId:"another"})).toThrow());
  it("rejects a claimed financial replication", () => expect(() => validateJournalReceipt({...receipt,financialReplicationEnabled:true} as never)).toThrow());
  it("rejects extra receipt fields", () => expect(() => validateJournalReceipt({...receipt, token:"injected"} as never)).toThrow());
  it("rejects contradictory duplicate outcome", () => expect(() => validateJournalReceipt({...receipt,status:"duplicate",reason:null})).toThrow());
});
