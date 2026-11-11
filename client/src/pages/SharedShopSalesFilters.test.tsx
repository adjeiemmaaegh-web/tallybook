import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SalesPage, ShopOverview, ShopReceipt } from "@/cloud/shopClient";
import { sampleReceipt } from "@/cloud/testReceipt";

const shop = vi.hoisted(() => ({ overview: vi.fn(), search: vi.fn() }));
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
  searchShopSales: shop.search,
  getShopReadiness: async () => ({ companyId: "biz", saleCount: 2 }),
}));

import SharedShopPage from "./SharedShopPage";

const overview: ShopOverview = {
  companyId: "biz", role: "owner", currency: "GHS",
  stores: [{ id: "st-a", name: "Madina", status: "active" }, { id: "st-b", name: "Tema", status: "active" }],
  products: [{ id: "eggs", name: "Eggs", unitPriceMinor: 4500, active: true }],
  stock: [{ storeId: "st-a", productId: "eggs", quantity: 3 }],
  members: [], pendingInvites: [],
};
const sale = (n: number, over: Partial<ShopReceipt> = {}) => sampleReceipt({ saleId: `sale-${n}`, receiptNumber: n, ...over });
const page = (sales: ShopReceipt[], over: Partial<SalesPage> = {}): SalesPage => ({
  sales, hasMore: false, next: null, matchCount: sales.length, limited: false,
  grossMinor: sales.reduce((n, r) => n + r.totalMinor, 0), refundedMinor: 0, ...over,
});
const lastQuery = () => shop.search.mock.calls.at(-1)![1] as Record<string, unknown>;

async function openSales() {
  render(<SharedShopPage />);
  fireEvent.click(await screen.findByRole("button", { name: "Sales" }));
  await waitFor(() => expect(shop.search).toHaveBeenCalled());
}

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  shop.overview.mockReset().mockResolvedValue(overview);
  shop.search.mockReset().mockResolvedValue(page([sale(2), sale(1)]));
});

describe("shared shop sales filters", () => {
  it("starts unfiltered and shows the match count and net total", async () => {
    await openSales();
    expect(lastQuery()).toMatchObject({ payment: "all", q: "", limit: 25 });
    expect(lastQuery().from).toBeUndefined();
    expect(await screen.findByText(/2 sales, after refunds/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /#2/ })).toBeInTheDocument();
  });

  it("sends the local day range for Today and the payment kind for each chip", async () => {
    await openSales();
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    await waitFor(() => expect(lastQuery().from).toBeDefined());
    const from = Date.parse(String(lastQuery().from)), to = Date.parse(String(lastQuery().to));
    expect(from).toBeLessThanOrEqual(Date.now());
    expect(to).toBeGreaterThan(Date.now());
    expect(to - from).toBeGreaterThanOrEqual(23 * 3600_000);
    expect(to - from).toBeLessThanOrEqual(25 * 3600_000);

    for (const [label, payment] of [["Paid in full", "paid"], ["Part on credit", "partial"], ["All on credit", "credit"], ["Refunded", "refunded"]] as const) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      await waitFor(() => expect(lastQuery().payment).toBe(payment));
    }
    fireEvent.click(within(screen.getByRole("group", { name: "How it was paid" })).getByRole("button", { name: "All" }));
    await waitFor(() => expect(lastQuery().payment).toBe("all"));
  });

  it("waits for a pause in typing, then searches once with the final text", async () => {
    await openSales();
    const before = shop.search.mock.calls.length;
    const box = screen.getByLabelText("Search sales");
    for (const text of ["a", "am", "ama"]) fireEvent.change(box, { target: { value: text } });
    await waitFor(() => expect(lastQuery().q).toBe("ama"));
    const queries = shop.search.mock.calls.slice(before).map(call => (call[1] as { q: string }).q);
    expect(queries).toEqual(["ama"]);
  });

  it("loads older sales with the server's cursor and appends them", async () => {
    shop.search.mockResolvedValueOnce(page([sale(3), sale(2)], { hasMore: true, matchCount: 3, next: { recordedAt: "2026-11-10T09:00:00.000Z", receiptNumber: 2 } }));
    shop.search.mockResolvedValueOnce(page([sale(1)], { matchCount: 3 }));
    await openSales();
    fireEvent.click(await screen.findByRole("button", { name: "Show older sales" }));
    await waitFor(() => expect(lastQuery().before).toEqual({ recordedAt: "2026-11-10T09:00:00.000Z", receiptNumber: 2 }));
    expect(await screen.findByRole("button", { name: /#1/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /#3/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show older sales" })).toBeNull();
  });

  it("explains an empty result and clears every filter", async () => {
    await openSales();
    shop.search.mockResolvedValue(page([]));
    fireEvent.click(screen.getByRole("button", { name: "Refunded" }));
    expect(await screen.findByText(/No sales match these filters/)).toBeInTheDocument();
    shop.search.mockResolvedValue(page([sale(1)]));
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(lastQuery().payment).toBe("all"));
    expect(await screen.findByRole("button", { name: /#1/ })).toBeInTheDocument();
  });

  it("says so when the server cannot search yet", async () => {
    shop.search.mockResolvedValue(page([sale(1)], { limited: true }));
    await openSales();
    expect(await screen.findByRole("note")).toHaveTextContent("latest sales only");
  });

  it("ignores a slow answer for filters that are no longer selected", async () => {
    let releaseOld!: (value: SalesPage) => void;
    shop.search.mockReset();
    shop.search.mockImplementationOnce(() => new Promise<SalesPage>(resolve => { releaseOld = resolve; }));
    shop.search.mockResolvedValue(page([sale(8)]));
    render(<SharedShopPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Sales" }));
    await waitFor(() => expect(shop.search).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Refunded" }));
    expect(await screen.findByRole("button", { name: /#8/ })).toBeInTheDocument();
    releaseOld(page([sale(1)]));
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(screen.queryByRole("button", { name: /#1\b/ })).toBeNull();
    expect(screen.getByRole("button", { name: /#8/ })).toBeInTheDocument();
  });
});
