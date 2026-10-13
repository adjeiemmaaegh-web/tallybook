import { describe, expect, it } from "vitest";
import { validateOutboxEvent, type SyncOutboxEvent } from "./syncFoundation";
const valid: SyncOutboxEvent = { id: "event_1", businessProfileId: "business_1", deviceId: "device_1", operationId: "sale_1", entityType: "sale", entityId: "sale_1", payloadDigest: "a".repeat(64), createdAt: "2026-10-09T12:00:00.000Z", status: "pending" };
describe("stage 8 outbox preflight", () => {
  it("accepts deterministic scoped event metadata", () => expect(() => validateOutboxEvent(valid)).not.toThrow());
  it("rejects malformed entity types", () => expect(() => validateOutboxEvent({ ...valid, entityType: "../../sale" })).toThrow());
  it("rejects invalid digest", () => expect(() => validateOutboxEvent({ ...valid, payloadDigest: "raw customer data" })).toThrow());
  it("rejects a false acknowledgement", () => expect(() => validateOutboxEvent({ ...valid, status: "acknowledged" })).toThrow());
});
