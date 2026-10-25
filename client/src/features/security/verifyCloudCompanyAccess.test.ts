import { describe, expect, it, vi, beforeEach } from "vitest";

const { getUser, getSession, from } = vi.hoisted(() => ({
  getUser: vi.fn(), getSession: vi.fn(), from: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: true,
  getSupabaseClient: () => ({ auth: { getUser, getSession }, from }),
}));
import { verifyCloudCompanyAccess } from "./verifyCloudCompanyAccess";

const expires_at = Math.floor(Date.now() / 1000) + 3600;
const access_token = "verified-test-access-token-1234567890";
function membership(rows: unknown[], error: unknown = null, businesses: unknown[] = [{ id: "company-1", owner_id: "user-1" }]) {
  from.mockImplementation((table: string) => {
    const result = table === "business_members"
      ? { data: rows, error }
      : table === "businesses"
      ? { data: businesses, error: null }
      : { data: null, error: new Error("unknown table") };
    const limit = vi.fn().mockResolvedValue(result);
    const secondEq = vi.fn().mockReturnValue({ limit });
    const firstEq = vi.fn().mockReturnValue({ eq: secondEq, limit });
    return { select: vi.fn().mockReturnValue({ eq: firstEq }) };
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  getSession.mockResolvedValue({ data: { session: { user: { id: "user-1" }, expires_at, access_token } }, error: null });
  membership([{ user_id: "user-1", business_id: "company-1", role: "owner" }]);
});
describe("verified cloud company access (inactive preview service)", () => {
  it("returns an authorized member only after verifying the account", async () => {
    await expect(verifyCloudCompanyAccess("company-1", "manage_members")).resolves.toMatchObject({ userId: "user-1", companyId: "company-1", role: "owner" });
  });
  it("rejects a different company", async () => {
    await expect(verifyCloudCompanyAccess("company-2", "read")).rejects.toThrow("Company access is not authorized");
  });
  it("rejects revoked membership", async () => {
    membership([{ user_id: "user-1", business_id: "company-1", role: "revoked" }]);
    await expect(verifyCloudCompanyAccess("company-1", "read")).rejects.toThrow();
  });
  it("rejects a mismatch between server user and cached session", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: "user-2" }, expires_at, access_token } }, error: null });
    await expect(verifyCloudCompanyAccess("company-1", "read")).rejects.toThrow();
  });
  it("rejects a sign-out or account switch during the membership request", async () => {
    getSession.mockResolvedValueOnce({ data: { session: { user: { id: "user-1" }, expires_at, access_token } }, error: null })
      .mockResolvedValueOnce({ data: { session: null }, error: null });
    await expect(verifyCloudCompanyAccess("company-1", "read")).rejects.toThrow();
    getSession.mockResolvedValueOnce({ data: { session: { user: { id: "user-1" }, expires_at, access_token } }, error: null })
      .mockResolvedValueOnce({ data: { session: { user: { id: "user-2" }, expires_at, access_token } }, error: null });
    await expect(verifyCloudCompanyAccess("company-1", "read")).rejects.toThrow();
  });
  it("rejects an invalid final session after membership verification", async () => {
    getSession.mockResolvedValueOnce({ data: { session: { user: { id: "user-1" }, expires_at, access_token } }, error: null })
      .mockResolvedValueOnce({ data: { session: { user: { id: "user-1" }, expires_at: Number.MAX_SAFE_INTEGER, access_token } }, error: null });
    await expect(verifyCloudCompanyAccess("company-1", "read")).rejects.toThrow();
  });
  it("rejects missing or ambiguous membership rows", async () => {
    membership([]);
    await expect(verifyCloudCompanyAccess("company-1", "read")).rejects.toThrow();
    membership([{}, {}]);
    await expect(verifyCloudCompanyAccess("company-1", "read")).rejects.toThrow();
  });
  it("rejects insufficient privileges and failed membership queries", async () => {
    membership([{ user_id: "user-1", business_id: "company-1", role: "attendant" }]);
    await expect(verifyCloudCompanyAccess("company-1", "delete_company")).rejects.toThrow();
    membership([], new Error("request failed"));
    await expect(verifyCloudCompanyAccess("company-1", "read")).rejects.toThrow();
  });
  it("rejects unsafe session timestamps", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: "user-1" }, expires_at: Number.MAX_SAFE_INTEGER, access_token } }, error: null });
    await expect(verifyCloudCompanyAccess("company-1", "read")).rejects.toThrow();
  });
  it("rejects absent or unverified account identity", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(verifyCloudCompanyAccess("company-1", "read")).rejects.toThrow();
    getUser.mockRejectedValue(new Error("network failure"));
    await expect(verifyCloudCompanyAccess("company-1", "read")).rejects.toThrow();
  });
  it("rejects pending memberships, malformed rows and duplicate results", async () => {
    membership([{ user_id: "user-1", business_id: "company-1", role: "pending" }]);
    await expect(verifyCloudCompanyAccess("company-1", "read")).rejects.toThrow();
    membership([{ user_id: "user-1", business_id: "company-1", role: "unknown" }]);
    await expect(verifyCloudCompanyAccess("company-1", "read")).rejects.toThrow();
    membership([{ user_id: "user-1", business_id: "company-1", role: "owner" }, { user_id: "user-1", business_id: "company-1", role: "owner" }]);
    await expect(verifyCloudCompanyAccess("company-1", "read")).rejects.toThrow();
  });
  it("rejects unsafe or out-of-range session timestamps", async () => {
    for (const invalid of [0, -1, Number.MAX_SAFE_INTEGER, Number.NaN, 1.5]) {
      getSession.mockResolvedValue({ data: { session: { user: { id: "user-1" }, expires_at: invalid, access_token } }, error: null });
      await expect(verifyCloudCompanyAccess("company-1", "read")).rejects.toThrow();
    }
  });
  it("rejects inconsistent business owner and absent business records", async () => {
    membership([{ user_id: "user-1", business_id: "company-1", role: "owner" }], null,
      [{ id: "company-1", owner_id: "other" }]);
    await expect(verifyCloudCompanyAccess("company-1", "read")).rejects.toThrow();
    membership([{ user_id: "user-1", business_id: "company-1", role: "owner" }], null, []);
    await expect(verifyCloudCompanyAccess("company-1", "read")).rejects.toThrow();
  });
  it("rejects expired sessions", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: "user-1" }, expires_at: 1, access_token } }, error: null });
    await expect(verifyCloudCompanyAccess("company-1", "read")).rejects.toThrow();
  });
});
