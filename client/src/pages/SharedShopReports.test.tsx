import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShopOverview } from "@/cloud/shopClient";

const shop = vi.hoisted(() => ({ overview: vi.fn(), report: vi.fn(), profit: vi.fn(), role: { value: "owner" as "owner" | "attendant" } }));
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
  getDailyReport: (_c: string, query: unknown) => shop.report(query),
  getProfitReport: (_c: string, query: unknown) => shop.profit(query),
  getShopReadiness: async () => ({ companyId: "biz", saleCount: 3 }),
}));

import SharedShopPage from "./SharedShopPage";
import { parseDailyReport } from "@/cloud/dailyReport";
import { parseProfitReport } from "@/cloud/profitReport";
import { ShopRejectedError } from "@/cloud/shopClient";

const overview = (role: "owner" | "attendant"): ShopOverview => ({
  companyId: "biz", role, currency: "GHS",
  stores: [{ id: "st-a", name: "Madina", status: "active" }, { id: "st-b", name: "Tema", status: "active" }],
  products: [{ id: "eggs", name: "Eggs", unitPriceMinor: 4500, active: true }], stock: [],
  members: [{ userId: "u1", role: "owner", email: "kwaku@demo.test", storeIds: [] }, { userId: "u2", role: "attendant", email: "ama@demo.test", storeIds: ["st-a"] }], pendingInvites: [],
});
const ownerReport = () => parseDailyReport({
  role: "owner", from: "2026-11-10T00:00:00Z", to: "2026-11-11T00:00:00Z", storeId: null,
  sales: { count: 7, grossMinor: "29300", discountMinor: "400" },
  byMethod: { cash: "13700", mobile: "4500", card: "3600", credit: "7500" },
  refunds: { count: 3, totalMinor: "13500", cash: "7500", mobile: "0", card: "0", creditReducedMinor: "6000" },
  repayments: { count: 2, totalMinor: "1500", cash: "1000", mobile: "500", card: "0" },
  supplierPayments: { cash: "5000", mobile: "0", card: "0", bank: "2000" },
  topProducts: [{ name: "Eggs", quantity: 5, revenueMinor: "22500" }],
  byCashier: [{ cashierId: "u1", count: 5, grossMinor: "23600" }, { cashierId: "u2", count: 2, grossMinor: "5700" }],
  cashTakenMinor: "14700", cashPaidOutMinor: "12500", cashExpectedMinor: "2200", customerCreditOutstandingMinor: "1500",
});
const attendantReport = () => parseDailyReport({
  role: "attendant", from: "2026-11-10T00:00:00Z", to: "2026-11-11T00:00:00Z", storeId: null,
  sales: { count: 2, grossMinor: "5700", discountMinor: "0" },
  byMethod: { cash: "1200", mobile: "4500", card: "0", credit: "0" },
  refunds: { count: 0, totalMinor: "0", cash: "0", mobile: "0", card: "0", creditReducedMinor: "0" },
  repayments: { count: 0, totalMinor: "0", cash: "0", mobile: "0", card: "0" },
  supplierPayments: { cash: "0", mobile: "0", card: "0", bank: "0" },
  topProducts: [], byCashier: [], cashTakenMinor: "1200", cashPaidOutMinor: "0", cashExpectedMinor: "1200", customerCreditOutstandingMinor: null,
});

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  shop.role.value = "owner";
  shop.overview.mockReset().mockImplementation(async () => overview(shop.role.value));
  shop.report.mockReset().mockResolvedValue(ownerReport());
  shop.profit.mockReset().mockRejectedValue(new Error("Unknown shop operations action"));
});

async function openReports(tabName = "Reports") {
  render(<SharedShopPage />);
  fireEvent.click(await screen.findByRole("button", { name: tabName }));
  await waitFor(() => expect(shop.report).toHaveBeenCalled());
}
const stat = (label: string) => screen.getByText(label, { selector: "span" }).closest("div") as HTMLElement;
const lastQuery = () => shop.report.mock.calls.at(-1)![0] as { from: string; to: string; storeId?: string };

describe("shared shop reports", () => {
  it("shows the owner the day's figures, taken from the server's totals", async () => {
    await openReports();
    expect(await screen.findByText("Cash expected in the till")).toBeInTheDocument();
    expect(stat("Sales")).toHaveTextContent("GHS 293.00");
    expect(stat("Sales")).toHaveTextContent("7 sales");
    expect(stat("Refunds")).toHaveTextContent("−GHS 135.00");
    expect(stat("Net sales")).toHaveTextContent("GHS 158.00");
    expect(stat("Cash expected in the till")).toHaveTextContent("GHS 22.00");
    expect(stat("Cash expected in the till")).toHaveTextContent("taken GHS 147.00 · paid out GHS 125.00");
    const till = within(screen.getByLabelText("Taken at the till"));
    expect(till.getByText("Mobile money").parentElement).toHaveTextContent("GHS 45.00");
    expect(within(screen.getByLabelText("Paid to suppliers")).getByText("Bank").parentElement).toHaveTextContent("GHS 20.00");
    expect(within(screen.getByLabelText("By cashier")).getByText(/ama@demo.test · 2 sales/)).toBeInTheDocument();
    expect(screen.getByText(/Customers still owe/).parentElement).toHaveTextContent("GHS 15.00");
  });

  it("asks for today by default and for the right day range when a period is chosen", async () => {
    await openReports();
    const today = lastQuery();
    expect(Date.parse(today.to) - Date.parse(today.from)).toBeGreaterThanOrEqual(23 * 3600_000);
    expect(Date.parse(today.to) - Date.parse(today.from)).toBeLessThanOrEqual(25 * 3600_000);
    fireEvent.click(screen.getByRole("button", { name: "Last 7 days" }));
    await waitFor(() => expect(Date.parse(lastQuery().to) - Date.parse(lastQuery().from)).toBeGreaterThan(6 * 24 * 3600_000));
    fireEvent.change(screen.getByLabelText("Store"), { target: { value: "st-b" } });
    await waitFor(() => expect(lastQuery().storeId).toBe("st-b"));
  });

  it("shares the written summary, with the shop and period in it", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    await openReports();
    fireEvent.click(await screen.findByRole("button", { name: "Share" }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    const text = share.mock.calls[0][0].text as string;
    expect(text).toContain("Kwaku Provisions");
    expect(text).toContain("Sales report · Today");
    expect(text).toMatch(/Cash expected in the till: .*22\.00/);
    expect(text).toContain("ama@demo.test");
    Reflect.deleteProperty(navigator, "share");
  });

  it("gives an attendant 'My day' with no supplier, cashier or customer-debt sections", async () => {
    shop.role.value = "attendant";
    shop.report.mockResolvedValue(attendantReport());
    await openReports("My day");
    expect(await screen.findByText("Cash expected in the till")).toBeInTheDocument();
    expect(stat("Sales")).toHaveTextContent("GHS 57.00");
    expect(screen.queryByLabelText("Paid to suppliers")).toBeNull();
    expect(screen.queryByLabelText("By cashier")).toBeNull();
    expect(screen.queryByText(/Customers still owe/)).toBeNull();
  });

  it("says plainly when nothing was sold, and when the shop has not been updated", async () => {
    shop.report.mockResolvedValue(parseDailyReport({ ...JSON.parse(JSON.stringify({
      role: "owner", from: "a", to: "b", storeId: null, sales: { count: 0, grossMinor: "0", discountMinor: "0" },
      byMethod: { cash: "0", mobile: "0", card: "0", credit: "0" }, refunds: { count: 0, totalMinor: "0", cash: "0", mobile: "0", card: "0", creditReducedMinor: "0" },
      repayments: { count: 0, totalMinor: "0", cash: "0", mobile: "0", card: "0" }, supplierPayments: { cash: "0", mobile: "0", card: "0", bank: "0" },
      topProducts: [], byCashier: [], cashTakenMinor: "0", cashPaidOutMinor: "0", cashExpectedMinor: "0", customerCreditOutstandingMinor: "0" })) }));
    await openReports();
    expect(await screen.findByText("Nothing was sold in this period.")).toBeInTheDocument();
    shop.report.mockRejectedValue(new ShopRejectedError("Unknown shop operations action"));
    fireEvent.click(screen.getByRole("button", { name: "Yesterday" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Reports need the shop to be updated first");
    expect(screen.queryByText("Cash expected in the till")).toBeNull();
  });

  it("ignores a slow answer for a period that is no longer selected", async () => {
    let releaseOld!: (r: ReturnType<typeof ownerReport>) => void;
    shop.report.mockReset();
    shop.report.mockImplementationOnce(() => new Promise(resolve => { releaseOld = resolve; }));
    shop.report.mockResolvedValue(attendantReport());
    render(<SharedShopPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Reports" }));
    await waitFor(() => expect(shop.report).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Yesterday" }));
    await waitFor(() => expect(stat("Sales")).toHaveTextContent("GHS 57.00"));
    releaseOld(ownerReport());
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(stat("Sales")).toHaveTextContent("GHS 57.00");
  });
});

describe("shared shop profit section", () => {
  const profitOf = (over: Record<string, unknown> = {}) => parseProfitReport({
    from: "2026-11-10T00:00:00Z", to: "2026-11-11T00:00:00Z", storeId: null, netRevenueMinor: "14200", coveredRevenueMinor: "13000", uncoveredRevenueMinor: "1200",
    costOfGoodsMinor: "9000", grossProfitMinor: "4000", marginBps: 3077, expenses: { count: 2, totalMinor: "1000" }, netProfitMinor: "3000",
    saleLines: { total: 3, withCost: 2 }, topByProfit: [{ name: "Eggs", quantity: 3, revenueMinor: "13000", profitMinor: "4000" }], ...over });

  it("the owner sees profit, margin, expenses, net profit and a warning about sales with no cost", async () => {
    shop.profit.mockResolvedValue(profitOf());
    await openReports();
    const section = await screen.findByLabelText("Profit");
    expect(within(section).getByText("Gross profit").closest("div")).toHaveTextContent("40.00");
    expect(within(section).getByText("Gross profit").closest("div")).toHaveTextContent("margin 30.8%");
    expect(within(section).getByText("Net profit").closest("div")).toHaveTextContent("30.00");
    expect(within(section).getByRole("note")).toHaveTextContent(/12\.00 of sales .*no cost recorded/);
    expect(within(section).getByLabelText("Best earners")).toHaveTextContent("Eggs × 3");
    await waitFor(() => expect(shop.profit).toHaveBeenCalled());
  });
  it("no warning when every sale has a cost", async () => {
    shop.profit.mockResolvedValue(profitOf({ uncoveredRevenueMinor: "0", saleLines: { total: 3, withCost: 3 } }));
    await openReports();
    const section = await screen.findByLabelText("Profit");
    expect(within(section).queryByRole("note")).toBeNull();
  });
  it("downloads a spreadsheet of the profit and loss", async () => {
    shop.profit.mockResolvedValue(profitOf());
    const blobs: Blob[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = b => { blobs.push(b); return "blob:x"; };
    (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {};
    await openReports();
    fireEvent.click(await screen.findByRole("button", { name: "Download spreadsheet" }));
    expect(blobs).toHaveLength(1);
    expect(await blobs[0].text()).toContain("Net profit");
    expect(await screen.findByText("Spreadsheet downloaded.")).toBeInTheDocument();
  });
  it("an older server has no profit section, and the rest of the report is unaffected", async () => {
    await openReports();
    expect(await screen.findByText("Cash expected in the till")).toBeInTheDocument();
    expect(screen.queryByLabelText("Profit")).toBeNull();
  });
  it("an attendant never asks for profit or sees it", async () => {
    shop.role.value = "attendant"; shop.report.mockResolvedValue(attendantReport());
    await openReports("My day");
    await screen.findByText("Cash expected in the till");
    expect(shop.profit).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Profit")).toBeNull();
  });
});
