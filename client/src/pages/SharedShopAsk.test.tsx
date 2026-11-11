import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShopOverview } from "@/cloud/shopClient";
import { parseDailyReport } from "@/cloud/dailyReport";

const shop = vi.hoisted(() => ({ overview: vi.fn(), report: vi.fn(), profit: vi.fn(), role: { value: "owner" as "owner" | "attendant" }, perms: { canCredit: false } }));
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
  getShopOverview: shop.overview, getProductCatalog: async () => [], getShopReadiness: async () => ({ companyId: "biz", saleCount: 3 }),
  getDailyReport: (_c: string, q: unknown) => shop.report(q), getProfitReport: (_c: string, q: unknown) => shop.profit(q),
}));
vi.mock("@/cloud/shopPurchasing", async (orig) => ({ ...(await orig<object>()), getShopStockAccess: async () => ({ canManageStock: false, members: [] }),
  getShopSupplierBalances: async () => ({ suppliers: [{ supplierId: "s1", name: "Wholesale", archived: false, receivedMinor: "0", settledMinor: "0", outstandingMinor: "0" }] }),
  listShopPurchaseOrders: async () => ({ orders: [] }) }));

import SharedShopPage from "./SharedShopPage";

const overview = (role: "owner" | "attendant"): ShopOverview => ({
  companyId: "biz", role, currency: "GHS",
  stores: [{ id: "n", name: "North", status: "active" }],
  products: [
    { id: "eggs", name: "Eggs", unitPriceMinor: 4500, active: true, lowStockThreshold: 10, costMinor: 3000 } as ShopOverview["products"][number],
    { id: "bread", name: "Bread", unitPriceMinor: 1200, active: true, lowStockThreshold: 20 } as ShopOverview["products"][number]],
  stock: [{ storeId: "n", productId: "eggs", quantity: 4 }, { storeId: "n", productId: "bread", quantity: 50 }],
  members: [{ userId: "u1", role: "owner", email: "kwaku@demo.test", storeIds: [] }], pendingInvites: [],
  customers: [{ id: "c1", name: "Ama", phone: null, creditLimitMinor: 1000, balanceMinor: 4500 }],
  myPermissions: { canDiscount: false, maxDiscountBps: 0, canCredit: shop.perms.canCredit },
});
const salesReport = () => parseDailyReport({ role: "owner", from: "a", to: "b", storeId: null, sales: { count: 2, grossMinor: "9000", discountMinor: "0" },
  byMethod: { cash: "9000", mobile: "0", card: "0", credit: "0" }, refunds: { count: 0, totalMinor: "0", cash: "0", mobile: "0", card: "0", creditReducedMinor: "0" },
  repayments: { count: 0, totalMinor: "0", cash: "0", mobile: "0", card: "0" }, supplierPayments: { cash: "0", mobile: "0", card: "0", bank: "0" },
  topProducts: [], byCashier: [], cashTakenMinor: "0", cashPaidOutMinor: "0", cashExpectedMinor: "0", customerCreditOutstandingMinor: null });

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  shop.role.value = "owner"; shop.perms.canCredit = false;
  shop.overview.mockReset().mockImplementation(async () => overview(shop.role.value));
  shop.report.mockReset().mockResolvedValue(salesReport());
  shop.profit.mockReset().mockRejectedValue(new Error("Unknown shop operations action"));
});

const openAsk = async () => { render(<SharedShopPage />); fireEvent.click(await screen.findByRole("button", { name: "Ask" })); };
const ask = async (q: string) => { const box = screen.getByLabelText("Your question"); fireEvent.change(box, { target: { value: q } }); fireEvent.submit(box.closest("form")!); };

describe("Ask tab", () => {
  it("answers stock questions from the shop's own numbers", async () => {
    await openAsk();
    await ask("what is low on stock?");
    expect(await screen.findByText("1 item running low:")).toBeInTheDocument();
    expect(screen.getByText("Eggs: 4 left (level 10)")).toBeInTheDocument();
  });
  it("sales questions use the server's report for the right day", async () => {
    await openAsk();
    await ask("what did I sell yesterday");
    expect(await screen.findByText(/The shop sold .*90\.00 yesterday\./)).toBeInTheDocument();
    expect(shop.report).toHaveBeenCalledTimes(1);
    expect(new Date((shop.report.mock.calls[0][0] as { to: string }).to).getTime()).toBeLessThan(Date.now());
  });
  it("example chips ask for you, and a stranger's question gets the list of things I can answer", async () => {
    await openAsk();
    fireEvent.click(screen.getByRole("button", { name: "Who owes me?" }));
    expect(await screen.findByText("1 customer owes GHS 45.00 in total:", { exact: false })).toBeInTheDocument();
    await ask("tell me a joke");
    expect(await screen.findByText("I can answer questions about your shop. Try one of these:")).toBeInTheDocument();
  });
  it("a draft order opens on Purchasing, pre-filled, with nothing ordered", async () => {
    await openAsk();
    await ask("draft an order for what is low");
    fireEvent.click(await screen.findByRole("button", { name: "Open this draft on Purchasing" }));
    expect(await screen.findByText(/Draft from Ask for North/)).toBeInTheDocument();
    const qty = screen.getAllByDisplayValue("16");
    expect(qty.length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue("30.00")).toBeInTheDocument();                // Eggs cost, known to the owner
    expect(screen.queryByText(/Purchase order saved/)).toBeNull();
  });
  it("an attendant gets Ask without owner questions: no profit, no draft, no balances unless allowed", async () => {
    shop.role.value = "attendant";
    await openAsk();
    expect(screen.queryByRole("button", { name: "Who owes me?" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Draft an order for what is low" })).toBeNull();
    await ask("profit today");
    expect(await screen.findByText("Only the owner can see profit.")).toBeInTheDocument();
    expect(shop.profit).not.toHaveBeenCalled();
    await ask("who owes me");
    expect(await screen.findByText(/can't see customers' balances/)).toBeInTheDocument();
    await ask("draft an order");
    expect(await screen.findByText(/Only the owner can draft purchase orders/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open this draft on Purchasing" })).toBeNull();
  });
  it("an attendant who may handle credit can see who owes", async () => {
    shop.role.value = "attendant"; shop.perms.canCredit = true;
    await openAsk();
    await ask("who owes me");
    expect(await screen.findByText("1 customer owes GHS 45.00 in total:", { exact: false })).toBeInTheDocument();
  });
  it("when the report cannot load it says so instead of failing", async () => {
    shop.report.mockRejectedValue(new Error("network"));
    await openAsk();
    await ask("what did I sell today");
    expect(await screen.findByText(/couldn't get that just now|internet connection/)).toBeInTheDocument();
  });
});
