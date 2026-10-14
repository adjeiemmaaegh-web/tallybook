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
function membership(rows: unknown[], error: unknown = null) {
  const limit = vi.fn().mockResolvedValue({ data: rows, error });
  const eq = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ limit }) });
  from.mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) });
}
beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  getSession.mockResolvedValue({ data: { session: { user: { id: "user-1" }, expires_at } }, error: null });
  membership([{ user_id: "user-1", company_id: "company-1", role: "owner", status: "active" }]);
});
describe("verified cloud company access (inactive preview service)", () => {
  it("returns an authorized member only after verifying the account", async () => {
    await expect(verifyCloudCompanyAccess("company-1", "manage_members")).resolves.toMatchObject({ userId: "user-1", companyId: "company-1", role: "owner" });
  });
  it("rejects a different company", async () => {
    await expect(verifyCloudCompanyAccess("company-2", "read")).rejects.toThrow("Company access is not authorized");
  });
  it("rejects revoked membership", async () => {
    membership([{ user_id: "user-1", company_id: "company-1", role: "owner", status: "revoked" }]);
    await expect(verifyCloudCompanyAccess("company-1", "read")).rejects.toThrow();
  });
  it("rejects a mismatch between server user and cached session", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: "user-2" }, expires_at } }, error: null });
    await expect(verifyCloudCompanyAccess("company-1", "read")).rejects.toThrow();
  });
  it("rejects missing or ambiguous membership rows", async () => {
    membership([]);
    await expect(verifyCloudCompanyAccess("company-1", "read")).rejects.toThrow();
    membership([{}, {}]);
    await expect(verifyCloudCompanyAccess("company-1", "read")).rejects.toThrow();
  });
  it("rejects insufficient privileges and failed membership queries", async () => {
    membership([{ user_id: "user-1", company_id: "company-1", role: "staff", status: "active" }]);
    await expect(verifyCloudCompanyAccess("company-1", "delete_company")).rejects.toThrow();
    membership([], new Error("request failed"));
    await expect(verifyCloudCompanyAccess("company-1", "read")).rejects.toThrow();
  });
  it("rejects unsafe session timestamps", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: "user-1" }, expires_at: Number.MAX_SAFE_INTEGER } }, error: null });
    await expect(verifyCloudCompanyAccess("company-1", "read")).rejects.toThrow();
  });
  it("rejects expired sessions", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: "user-1" }, expires_at: 1 } }, error: null });
    await expect(verifyCloudCompanyAccess("company-1", "read")).rejects.toThrow();
  });
});
