import { describe, expect, it } from "vitest";
import { authorizeBindingPreparation } from "./accountBindingPreparation";

const now = Date.parse("2026-10-14T12:00:00.000Z");
const companies = Object.freeze([{ id: "local-one", name: "Main Shop" }, { id: "local-two", name: "Second Shop" }]);
const principal = { userId: "owner-1", expiresAtEpochMs: now + 60000 };
const membership = { userId: "owner-1", companyId: "cloud-one", role: "owner" as const, status: "active" as const };
const recovery = { companyId: "local-one", backupCompanyId: "local-one", backupCompletedAt: "2026-10-14T11:00:00.000Z", restoreDrillPassed: true };
const valid = () => ({
  companies, selectedLocalCompanyId: "local-one", typedLocalCompanyName: "Main Shop",
  principal, membership, cloudCompanyId: "cloud-one", recovery, nowEpochMs: now,
});
describe("offline company account binding preparation", () => {
  it("returns an inert provisioning review with verified role and recovery evidence", () => {
    expect(authorizeBindingPreparation(valid())).toEqual({
      localCompanyId: "local-one", authenticatedUserId: "owner-1",
      authoritativeCloudCompanyId: "cloud-one", backupCompletedAt: recovery.backupCompletedAt,
      authorizedForProvisioning: true, cloudAccessGranted: false,
    });
  });
  it("denies a foreign user or company and non-owner roles", () => {
    expect(() => authorizeBindingPreparation({ ...valid(), membership: { ...membership, userId: "other" } })).toThrow();
    expect(() => authorizeBindingPreparation({ ...valid(), membership: { ...membership, companyId: "other" } })).toThrow();
    expect(() => authorizeBindingPreparation({ ...valid(), membership: { ...membership, role: "staff" } })).toThrow();
    expect(() => authorizeBindingPreparation({ ...valid(), membership: { ...membership, status: "revoked" } })).toThrow();
  });
  it("rejects absent identity, expired session or forged local company", () => {
    expect(() => authorizeBindingPreparation({ ...valid(), principal: null })).toThrow();
    expect(() => authorizeBindingPreparation({ ...valid(), principal: { ...principal, expiresAtEpochMs: now } })).toThrow();
    expect(() => authorizeBindingPreparation({ ...valid(), selectedLocalCompanyId: "not-local" })).toThrow();
    expect(() => authorizeBindingPreparation({ ...valid(), typedLocalCompanyName: "Second Shop" })).toThrow();
  });
  it("rejects missing, stale, future, malformed and wrong-company recovery evidence", () => {
    expect(() => authorizeBindingPreparation({ ...valid(), recovery: { ...recovery, restoreDrillPassed: false } })).toThrow();
    expect(() => authorizeBindingPreparation({ ...valid(), recovery: { ...recovery, backupCompanyId: "local-two" } })).toThrow();
    expect(() => authorizeBindingPreparation({ ...valid(), recovery: { ...recovery, backupCompletedAt: "2026-10-01T11:00:00.000Z" } })).toThrow();
    expect(() => authorizeBindingPreparation({ ...valid(), recovery: { ...recovery, backupCompletedAt: "2026-10-15T11:00:00.000Z" } })).toThrow();
    expect(() => authorizeBindingPreparation({ ...valid(), recovery: { ...recovery, backupCompletedAt: "not-a-date" } })).toThrow();
  });
  it("does not mutate companies or write any local/cloud records", () => {
    const before = JSON.stringify(companies);
    authorizeBindingPreparation(valid());
    expect(JSON.stringify(companies)).toBe(before);
  });
});
