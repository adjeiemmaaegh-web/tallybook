import { describe, expect, it } from "vitest";
import { validateLocalSyncDevice, type LocalSyncDevice } from "./deviceRegistry";
const base: LocalSyncDevice = { id: "device_1", businessProfileId: "business_1", label: "Shop tablet", registeredAt: "2026-10-09T12:00:00Z", updatedAt: "2026-10-09T12:00:00Z", status: "active" };
describe("local device registry preflight", () => {
  it("allows a valid local registration", () => expect(() => validateLocalSyncDevice(base)).not.toThrow());
  it("rejects foreign or malformed identifiers", () => expect(() => validateLocalSyncDevice({ ...base, id: "../device" })).toThrow());
  it("requires revocation timestamp", () => expect(() => validateLocalSyncDevice({ ...base, status: "revoked" })).toThrow());
  it("rejects active devices with revocation timestamp", () => expect(() => validateLocalSyncDevice({ ...base, revokedAt: base.updatedAt })).toThrow());
  it("rejects control characters in labels", () => expect(() => validateLocalSyncDevice({ ...base, label: "bad\nlabel" })).toThrow());
});
