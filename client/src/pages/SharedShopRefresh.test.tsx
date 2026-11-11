import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShopOverview } from "@/cloud/shopClient";

const shop = vi.hoisted(() => ({ overview: vi.fn(), catalog: vi.fn(), archived: vi.fn(), access: vi.fn(), refunds: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: true,
  getSupabaseClient: () => ({ auth: {
    getSession: async () => ({ data: { session: { user: { id: "u1" } } } }),
    getUser: async () => ({ data: { user: { id: "u1", email: "kwaku@demo.test" } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  } }),
}));
vi.mock("@/cloud/cloudMembership", () => ({ listVerifiedCloudBusinesses: async () => [{ id: "biz", name: "Kwaku Provisions", role: "owner", owner_id: "u1", created_at: "", updated_at: "" }] }));
vi.mock("@/cloud/shopClient", async (orig) => ({ ...(await orig<object>()), getShopOverview: shop.overview, getProductCatalog: shop.catalog,
  getArchivedCustomerIds: shop.archived, getShopReadiness: async () => ({ companyId: "biz", saleCount: 1 }) }));
vi.mock("@/cloud/shopPurchasing", async (orig) => ({ ...(await orig<object>()), getShopStockAccess: shop.access }));
vi.mock("@/cloud/refundRequestData", async (orig) => ({ ...(await orig<object>()), getRefundRequests: shop.refunds }));

import SharedShopPage from "./SharedShopPage";

const overview: ShopOverview = { companyId: "biz", role: "owner", currency: "GHS", stores: [{ id: "s", name: "Madina", status: "active" }],
  products: [{ id: "eggs", name: "Eggs", unitPriceMinor: 4500, active: true }], stock: [], members: [], pendingInvites: [], customers: [] };

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  shop.overview.mockReset().mockResolvedValue(overview);
});

describe("shop refresh", () => {
  it("asks for the optional extras together, not one after another", async () => {
    // None of the four answers until all four have been asked: a sequential refresh would hang here.
    const asked = new Set<string>(); let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    const ask = (name: string, value: unknown) => vi.fn(async () => { asked.add(name); if (asked.size === 4) release(); await gate; return value; });
    shop.catalog.mockImplementation(ask("catalog", []));
    shop.archived.mockImplementation(ask("archived", { customerIds: [] }));
    shop.access.mockImplementation(ask("access", { canManageStock: true, members: [] }));
    shop.refunds.mockImplementation(ask("refunds", { requests: [{}, {}] }));
    render(<SharedShopPage />);
    expect(await screen.findByRole("button", { name: "Refund requests (2)" })).toBeInTheDocument();
    expect([...asked].sort()).toEqual(["access", "archived", "catalog", "refunds"]);
  });
  it("any one extra failing leaves the rest working (an older server lacks some)", async () => {
    shop.catalog.mockRejectedValue(new Error("Unknown shop operations action"));
    shop.archived.mockRejectedValue(new Error("Unknown shop operations action"));
    shop.access.mockResolvedValue({ canManageStock: true, members: [] });
    shop.refunds.mockRejectedValue(new Error("Unknown shop operations action"));
    render(<SharedShopPage />);
    expect(await screen.findByRole("button", { name: "Refund requests" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stock counts" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});
