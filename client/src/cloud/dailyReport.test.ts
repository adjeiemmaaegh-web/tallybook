import { describe, expect, it } from "vitest";
import { formatReportText, parseDailyReport } from "./dailyReport";

const raw = (over: Record<string, unknown> = {}) => ({
  companyId: "biz", role: "owner", from: "2026-11-10T00:00:00Z", to: "2026-11-11T00:00:00Z", storeId: null,
  sales: { count: 7, grossMinor: "29300", discountMinor: "400" },
  byMethod: { cash: "13700", mobile: "4500", card: "3600", credit: "7500" },
  refunds: { count: 3, totalMinor: "13500", cash: "7500", mobile: "0", card: "0", creditReducedMinor: "6000" },
  repayments: { count: 2, totalMinor: "1500", cash: "1000", mobile: "500", card: "0" },
  supplierPayments: { cash: "5000", mobile: "0", card: "0", bank: "2000" },
  topProducts: [{ name: "Eggs", quantity: 5, revenueMinor: "22500" }, { name: "Bread", quantity: 6, revenueMinor: "6800" }],
  byCashier: [{ cashierId: "u1", count: 5, grossMinor: "23600" }, { cashierId: "u2", count: 2, grossMinor: "5700" }],
  cashTakenMinor: "14700", cashPaidOutMinor: "12500", cashExpectedMinor: "2200", customerCreditOutstandingMinor: "1500", ...over,
});

describe("parseDailyReport: expenses", () => {
  const spent = { count: 3, totalMinor: "7200", cash: "2500", mobile: "4000", card: "0", bank: "700" };
  it("reads the expenses block", () => {
    expect(parseDailyReport(raw({ expenses: spent })).expenses).toEqual({ count: 3, totalMinor: 7200, cash: 2500, mobile: 4000, card: 0, bank: 700 });
  });
  it("an older server with no expenses block reads as none", () => {
    expect(parseDailyReport(raw()).expenses).toEqual({ count: 0, totalMinor: 0, cash: 0, mobile: 0, card: 0, bank: 0 });
  });
  it("refuses an expense amount that cannot be shown exactly", () => {
    expect(() => parseDailyReport(raw({ expenses: { ...spent, totalMinor: "9007199254740993" } }))).toThrow(/cannot be shown exactly/);
  });
  it("the shared text mentions expenses only when there are some", () => {
    const opts = { shopName: "Shop", storeName: null, periodLabel: "Today", currency: "GHS" };
    expect(formatReportText(parseDailyReport(raw({ expenses: spent })), opts)).toMatch(/Expenses: 3 · .*72\.00/);
    expect(formatReportText(parseDailyReport(raw()), opts)).not.toMatch(/Expenses/);
  });
});

describe("parseDailyReport", () => {
  it("reads text amounts into numbers and works out net sales", () => {
    const r = parseDailyReport(raw());
    expect(r.sales).toEqual({ count: 7, grossMinor: 29300, discountMinor: 400 });
    expect(r.netSalesMinor).toBe(29300 - 13500);
    expect(r.cashExpectedMinor).toBe(2200);
    expect(r.topProducts[0]).toEqual({ name: "Eggs", quantity: 5, revenueMinor: 22500 });
    expect(r.customerCreditOutstandingMinor).toBe(1500);
  });
  it("keeps 'not shown to attendants' as null and tolerates empty lists", () => {
    const r = parseDailyReport(raw({ role: "attendant", customerCreditOutstandingMinor: null, topProducts: [], byCashier: [] }));
    expect(r.role).toBe("attendant");
    expect(r.customerCreditOutstandingMinor).toBeNull();
    expect(r.topProducts).toEqual([]);
  });
  it("refuses an amount it cannot show exactly instead of rounding it", () => {
    expect(() => parseDailyReport(raw({ cashExpectedMinor: "99999999999999999999" }))).toThrow(/cannot be shown exactly/);
    expect(() => parseDailyReport(raw({ sales: { count: 1, grossMinor: "12.5", discountMinor: "0" } }))).toThrow(/cannot be shown exactly/);
  });
  it("refuses an incomplete report", () => {
    expect(() => parseDailyReport(null)).toThrow(/incomplete/);
    expect(() => parseDailyReport({ ...raw(), refunds: undefined })).toThrow(/incomplete/);
  });
});

describe("formatReportText", () => {
  const opts = { shopName: "Kwaku Provisions", storeName: "Madina", periodLabel: "Today", currency: "GHS", cashierName: (id: string) => (id === "u1" ? "Kwaku" : "Ama") };
  it("writes the whole day for the owner: figures only, in order", () => {
    const text = formatReportText(parseDailyReport(raw()), opts);
    expect(text).toContain("Kwaku Provisions · Madina");
    expect(text).toContain("Sales report · Today");
    expect(text).toMatch(/Sales: 7 · .*293\.00/);
    expect(text).toMatch(/Discounts given: .*4\.00/);
    expect(text).toMatch(/Refunds: 3 · −.*135\.00/);
    expect(text).toMatch(/Net sales: .*158\.00/);
    expect(text).toMatch(/Cash: .*137\.00/);
    expect(text).toMatch(/On credit: .*75\.00/);
    expect(text).toMatch(/Customer repayments: .*15\.00/);
    expect(text).toMatch(/Cash expected in the till: .*22\.00/);
    expect(text).toMatch(/taken .*147\.00, paid out .*125\.00/);
    expect(text).toMatch(/1\. Eggs × 5 · .*225\.00/);
    expect(text).toMatch(/Kwaku: 5 · .*236\.00/);
    expect(text).toMatch(/Customers still owe: .*15\.00/);
  });
  it("shows what customers still owe, and leaves out lines that are zero", () => {
    const text = formatReportText(parseDailyReport(raw({ refunds: { count: 0, totalMinor: "0", cash: "0", mobile: "0", card: "0", creditReducedMinor: "0" },
      repayments: { count: 0, totalMinor: "0", cash: "0", mobile: "0", card: "0" }, byMethod: { cash: "100", mobile: "0", card: "0", credit: "0" },
      sales: { count: 1, grossMinor: "100", discountMinor: "0" } })), { ...opts, storeName: null });
    expect(text).toMatch(/Customers still owe: .*15\.00/);
    expect(text).not.toMatch(/Refunds:|Discounts given|Customer repayments|Mobile money|Card:/);
    expect(text.split("\n")[0]).toBe("Kwaku Provisions");
  });
  it("calls it 'My sales' for an attendant and never prints a cashier table", () => {
    const text = formatReportText(parseDailyReport(raw({ role: "attendant", byCashier: [], customerCreditOutstandingMinor: null })), opts);
    expect(text).toContain("My sales · Today");
    expect(text).not.toMatch(/By cashier|Customers still owe/);
  });
});
