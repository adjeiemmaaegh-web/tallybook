import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShopOverview } from "@/cloud/shopClient";

const shop = vi.hoisted(() => ({ overview: vi.fn(), create: vi.fn(), list: vi.fn(), revoke: vi.fn(), join: vi.fn(), accept: vi.fn(), businesses: vi.fn(), role: { value: "owner" as "owner" | "attendant" } }));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: true,
  getSupabaseClient: () => ({ auth: {
    getSession: async () => ({ data: { session: { user: { id: "u1" } } } }),
    getUser: async () => ({ data: { user: { id: "u1", email: "kwaku@demo.test" } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  } }),
}));
vi.mock("@/cloud/cloudMembership", () => ({ listVerifiedCloudBusinesses: shop.businesses }));
vi.mock("@/cloud/run3MembershipClient", async (orig) => ({ ...(await orig<object>()), acceptCloudInvitation: shop.accept }));
vi.mock("@/cloud/shopClient", async (orig) => ({
  ...(await orig<object>()),
  getShopOverview: shop.overview, getProductCatalog: async () => [], getShopReadiness: async () => ({ companyId: "biz", saleCount: 3 }),
  createJoinCode: shop.create, listJoinCodes: shop.list, revokeJoinCode: () => shop.revoke, joinWithShortCode: shop.join,
}));
vi.mock("@/cloud/shopPurchasing", async (orig) => ({ ...(await orig<object>()), getShopStockAccess: async () => ({ canManageStock: true, members: [] }) }));

import SharedShopPage from "./SharedShopPage";

const overview = (): ShopOverview => ({
  companyId: "biz", role: "owner", currency: "GHS", stores: [], products: [], stock: [],
  members: [{ userId: "u1", role: "owner", email: "kwaku@demo.test", storeIds: [] }, { userId: "u9", role: "attendant", email: "yaw@demo.test", storeIds: [] }], pendingInvites: [],
});
beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  shop.businesses.mockReset().mockResolvedValue([{ id: "biz", name: "Kwaku Provisions", role: "owner", owner_id: "u1", created_at: "", updated_at: "" }]);
  shop.overview.mockReset().mockImplementation(async () => overview());
  shop.list.mockReset().mockResolvedValue({ codes: [] });
  shop.create.mockReset().mockResolvedValue({ codeId: "k1", code: "K7QM2XPD", expiresAt: "2026-11-12T10:00:00Z" });
  shop.revoke.mockReset().mockResolvedValue({ codeId: "k1", revoked: true });
  shop.join.mockReset(); shop.accept.mockReset();
});

describe("join code: owner side", () => {
  it("makes a code, shows it once in a readable form, and can send it on WhatsApp", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue({} as Window);
    render(<SharedShopPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Team" }));
    fireEvent.click(await screen.findByRole("button", { name: "Make a join code" }));
    expect(await screen.findByLabelText("Join code")).toHaveTextContent("K7QM-2XPD");
    fireEvent.click(screen.getByRole("button", { name: "Send on WhatsApp" }));
    expect(decodeURIComponent(String(open.mock.calls[0][0]))).toContain("K7QM-2XPD");
    expect(decodeURIComponent(String(open.mock.calls[0][0]))).toContain("Kwaku Provisions");
  });
  it("lists open codes without showing them, lets the owner cancel, and says who used one", async () => {
    shop.list.mockResolvedValue({ codes: [
      { codeId: "k1", status: "pending", createdAt: "2026-11-11T10:00:00Z", expiresAt: "2026-11-12T10:00:00Z", usedBy: null, usedAt: null },
      { codeId: "k0", status: "used", createdAt: "2026-11-10T10:00:00Z", expiresAt: "2026-11-11T10:00:00Z", usedBy: "u9", usedAt: "2026-11-10T11:00:00Z" }] });
    render(<SharedShopPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Team" }));
    expect(await screen.findByText("Open code")).toBeInTheDocument();
    expect(screen.getByText(/Used: yaw@demo.test/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(shop.revoke).toHaveBeenCalledWith("k1"));
  });
  it("shows the server's reason when a code cannot be made", async () => {
    shop.create.mockRejectedValue(new Error("There are already 5 open join codes. Cancel one first."));
    render(<SharedShopPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Team" }));
    fireEvent.click(await screen.findByRole("button", { name: "Make a join code" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already 5 open join codes");
  });
});

describe("join code: employee side", () => {
  beforeEach(() => { shop.businesses.mockResolvedValue([]); });
  const enter = async (value: string) => {
    render(<SharedShopPage />);
    fireEvent.change(await screen.findByLabelText("Invitation code"), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Join shop" }));
  };
  it("a short code goes to the join-code action, not the email invitation", async () => {
    shop.join.mockResolvedValue({ joined: true, companyId: "biz", userId: "u1" });
    const assign = vi.fn(); Object.defineProperty(window, "location", { value: { ...window.location, assign }, configurable: true });
    await enter("k7qm-2xpd");
    await waitFor(() => expect(shop.join).toHaveBeenCalledWith("k7qm-2xpd"));
    expect(shop.accept).not.toHaveBeenCalled();
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/shop?view=home"));
  });
  it("the long invitation code still goes through the email invitation path", async () => {
    shop.accept.mockResolvedValue({ companyId: "biz", userId: "u1" });
    Object.defineProperty(window, "location", { value: { ...window.location, assign: vi.fn() }, configurable: true });
    await enter("v1." + "A".repeat(43));
    await waitFor(() => expect(shop.accept).toHaveBeenCalled());
    expect(shop.join).not.toHaveBeenCalled();
  });
  for (const [reason, text] of [["invalid", /isn't valid/], ["locked", /Wait 15 minutes/], ["already-member", /already part of/]] as const) {
    it(`explains a refusal: ${reason}`, async () => {
      shop.join.mockResolvedValue({ joined: false, reason });
      await enter("ABCD2345");
      expect(await screen.findByRole("alert")).toHaveTextContent(text);
    });
  }
});
