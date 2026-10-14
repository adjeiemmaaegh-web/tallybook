import { describe, expect, it } from "vitest";
import { canAccessCompany, requireCompanyAccess } from "./companyAccessPolicy";

const now = 1760000000000;
const principal = { userId: "user-a", expiresAtEpochMs: now + 60000 };
const membership = { userId: "user-a", companyId: "company-a", role: "owner" as const, status: "active" as const };

describe("verified company access policy (pure guard; not wired into legacy local app)", () => {
  it("allows a valid owner to perform owner-only operations", () => {
    expect(canAccessCompany(principal, membership, "company-a", "delete_company", now)).toBe(true);
  });
  it("rejects missing identity, missing membership, foreign company, and impersonation", () => {
    expect(canAccessCompany(null, membership, "company-a", "read", now)).toBe(false);
    expect(canAccessCompany(principal, null, "company-a", "read", now)).toBe(false);
    expect(canAccessCompany(principal, membership, "company-b", "read", now)).toBe(false);
    expect(canAccessCompany({ ...principal, userId: "user-b" }, membership, "company-a", "read", now)).toBe(false);
  });
  it("rejects expired sessions, nonactive memberships and invalid expiry", () => {
    expect(canAccessCompany({ ...principal, expiresAtEpochMs: now }, membership, "company-a", "read", now)).toBe(false);
    expect(canAccessCompany({ ...principal, expiresAtEpochMs: Number.NaN }, membership, "company-a", "read", now)).toBe(false);
    expect(canAccessCompany(principal, { ...membership, status: "revoked" }, "company-a", "read", now)).toBe(false);
    expect(canAccessCompany(principal, { ...membership, status: "pending" }, "company-a", "read", now)).toBe(false);
  });
  it("enforces role privileges and rejects invalid runtime role values", () => {
    expect(canAccessCompany(principal, { ...membership, role: "staff" }, "company-a", "write", now)).toBe(true);
    expect(canAccessCompany(principal, { ...membership, role: "staff" }, "company-a", "manage_members", now)).toBe(false);
    expect(canAccessCompany(principal, { ...membership, role: "admin" }, "company-a", "delete_company", now)).toBe(false);
    expect(canAccessCompany(principal, { ...membership, role: "superuser" as "owner" }, "company-a", "read", now)).toBe(false);
    expect(() => requireCompanyAccess(principal, membership, "company-b", "read", now)).toThrow("Company access is not authorized");
  });
});
