import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShopOverview } from "@/cloud/shopClient";

const shop = vi.hoisted(() => ({ overview: vi.fn(), access: vi.fn(), setAccess: vi.fn(), role: { value: "owner" as "owner" | "attendant" } }));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: true,
  getSupabaseClient: () => ({ auth: {
    getSession: async () => ({ data: { session: { user: { id: "u1" } } } }),
    getUser: async () => ({ data: { user: { id: "u1", email: "kwaku@demo.test" } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  } }),
}));
vi.mock("@/cloud/cloudMembership", () => ({ listVerifiedCloudBusinesses: async () => [{ id: "biz", name: "Kwaku Provisions", role: shop.role.value, owner_id: "u1", created_at: "", updated_at: "" }] }));
vi.mock("@/cloud/shopClient", async (orig) => ({
  ...(await orig<object>()),
  getShopOverview: shop.overview,
  getProductCatalog: async () => [],
  getShopReadiness: async () => ({ companyId: "biz", saleCount: 3 }),
}));
vi.mock("@/cloud/shopPurchasing", async (orig) => ({
  ...(await orig<object>()),
  getShopStockAccess: shop.access,
  setShopStockAccess: shop.setAccess,
  getShopStockCounts: async () => ({ counts: [] }),
  getShopReceivableOrders: async () => ({ orders: [] }),
}));

import SharedShopPage from "./SharedShopPage";

const overview = (role: "owner" | "attendant"): ShopOverview => ({
  companyId: "biz", role, currency: "GHS",
  stores: [{ id: "st-a", name: "Madina", status: "active" }],
  products: [{ id: "eggs", name: "Eggs", unitPriceMinor: 4500, active: true }], stock: [],
  members: [{ userId: "u1", role: "owner", email: "kwaku@demo.test", storeIds: [] }, { userId: "u2", role: "attendant", email: "ama@demo.test", storeIds: ["st-a"] }], pendingInvites: [],
});

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  shop.role.value = "attendant";
  shop.overview.mockReset().mockImplementation(async () => overview(shop.role.value));
  shop.access.mockReset().mockResolvedValue({ canManageStock: false });
  shop.setAccess.mockReset().mockResolvedValue({ userId: "u2", canManageStock: true });
});

describe("attendant stock access", () => {
  it("an ordinary attendant sees no stock tabs", async () => {
    render(<SharedShopPage />);
    await screen.findByRole("button", { name: "My sales" });
    expect(screen.queryByRole("button", { name: "Stock counts" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Receive goods" })).toBeNull();
  });

  it("a trusted attendant gets Stock counts and Receive goods, and never owner-only tabs", async () => {
    shop.access.mockResolvedValue({ canManageStock: true });
    render(<SharedShopPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Receive goods" }));
    expect(await screen.findByText("Nothing is waiting to be received.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stock counts" }));
    expect(await screen.findByText("Physical stock counts")).toBeInTheDocument();
    for (const owner of ["Purchasing", "Team", "Stock", "Dashboard"]) expect(screen.queryByRole("button", { name: owner })).toBeNull();
  });

  it("an older server without stock access leaves the attendant exactly as before", async () => {
    shop.access.mockRejectedValue(new Error("Unknown shop operations action"));
    render(<SharedShopPage />);
    await screen.findByRole("button", { name: "My sales" });
    expect(screen.queryByRole("button", { name: "Receive goods" })).toBeNull();
  });

  it("the owner switches it on per attendant under Team", async () => {
    shop.role.value = "owner";
    shop.access.mockResolvedValue({ canManageStock: true, members: [{ userId: "u2", canManageStock: false }] });
    render(<SharedShopPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Team" }));
    const box = await screen.findByRole("checkbox", { name: /Can count stock and receive goods/ });
    expect(box).not.toBeChecked();
    fireEvent.click(box);
    await waitFor(() => expect(shop.setAccess).toHaveBeenCalledWith("biz", "u2", true));
  });
});
