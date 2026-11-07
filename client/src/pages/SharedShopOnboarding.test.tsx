import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShopOverview } from "@/cloud/shopClient";

const shop = vi.hoisted(() => ({ overview: vi.fn(), readiness: vi.fn(), setup: vi.fn(), store: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: true,
  getSupabaseClient: () => ({ auth: {
    getSession: async () => ({ data: { session: { user: { id: "own-1" } } } }),
    getUser: async () => ({ data: { user: { id: "own-1", email: "owner@demo.test" } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  } }),
}));
vi.mock("@/cloud/cloudMembership", () => ({ listVerifiedCloudBusinesses: async () => [{ id: "biz", name: "Kwaku Provisions", role: "owner", owner_id: "own-1", created_at: "", updated_at: "" }] }));
vi.mock("@/cloud/shopClient", async (orig) => ({
  ...(await orig<object>()),
  getShopOverview: shop.overview,
  getShopReadiness: shop.readiness,
  setupShopLedger: (...a: unknown[]) => shop.setup(...a),
  saveShopStore: (...a: unknown[]) => shop.store(...a),
}));

import SharedShopPage from "./SharedShopPage";

const fresh = (over: Partial<ShopOverview> = {}): ShopOverview => ({
  companyId: "biz", role: "owner", currency: "GHS", stores: [], products: [], stock: [], members: [], pendingInvites: [], ...over,
});

describe("owner first run", () => {
  beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); shop.readiness.mockResolvedValue({companyId:"biz",saleCount:0}); });

  it("shows the checklist with the store step first and does not claim the shop can sell", async () => {
    shop.overview.mockResolvedValue(fresh());
    render(<SharedShopPage />);
    expect(await screen.findByText(/Finish the first three steps/)).toBeTruthy();
    expect(screen.getByText("Add your store")).toBeTruthy();
    expect(screen.queryByText(/can sell now/)).toBeNull();
  });

  it("does not mark the sale step done while the sale count is unknown", async () => {
    shop.overview.mockResolvedValue(fresh({
      stores: [{ id: "st", name: "Main", status: "active" }],
      products: [{ id: "p", name: "Eggs", unitPriceMinor: 100, active: true }],
      stock: [{ storeId: "st", productId: "p", quantity: 4 }],
    }));
    shop.readiness.mockRejectedValue(new Error("offline"));
    render(<SharedShopPage />);
    expect(await screen.findByText(/can sell now/)).toBeTruthy();
    expect(screen.getByText(/3 of 4 done/)).toBeTruthy();
  });

  it("hides the checklist once a first sale is confirmed", async () => {
    shop.overview.mockResolvedValue(fresh({
      stores: [{ id: "st", name: "Main", status: "active" }],
      products: [{ id: "p", name: "Eggs", unitPriceMinor: 100, active: true }],
      stock: [{ storeId: "st", productId: "p", quantity: 4 }],
    }));
    shop.readiness.mockResolvedValue({companyId:"biz",saleCount:1});
    render(<SharedShopPage />);
    await screen.findByRole("button", { name: "Sell" });
    await waitFor(() => expect(screen.queryByText(/Get started/)).toBeNull());
  });

  it("sets up currency then store in two steps, and a retry reuses the same store id", async () => {
    shop.overview.mockResolvedValue(fresh({ currency: null }));
    shop.setup.mockResolvedValue({});
    shop.store.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce({});
    render(<SharedShopPage />);
    expect(await screen.findByText("Step 1 of 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Step 2 of 2")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Store name"), { target: { value: "Main shop" } });
    fireEvent.click(screen.getByRole("button", { name: "Open shop" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Open shop" }));
    await waitFor(() => expect(shop.store).toHaveBeenCalledTimes(2));
    expect(shop.store.mock.calls[0]![1]).toBe(shop.store.mock.calls[1]![1]);
  });
});
