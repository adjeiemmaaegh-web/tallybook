import { describe, expect, it } from "vitest";
import { formatMargin, formatProfitText, hasPartialCost, parseProfitReport, profitReportCsv } from "./profitReport";

const raw = (over: Record<string, unknown> = {}) => ({
  companyId: "biz", from: "2026-11-10T00:00:00Z", to: "2026-11-11T00:00:00Z", storeId: null,
  netRevenueMinor: "14200", coveredRevenueMinor: "13000", uncoveredRevenueMinor: "1200", costOfGoodsMinor: "9000",
  grossProfitMinor: "4000", marginBps: 3077, expenses: { count: 2, totalMinor: "1000" }, netProfitMinor: "3000",
  saleLines: { total: 3, withCost: 2 }, topByProfit: [{ name: "Eggs", quantity: 3, revenueMinor: "13000", profitMinor: "4000" }], ...over,
});
const opts = { shopName: "Kwaku Provisions", storeName: null, periodLabel: "Today", currency: "GHS" };

describe("profit report client", () => {
  it("reads text amounts into numbers, including a loss", () => {
    const r = parseProfitReport(raw({ grossProfitMinor: "-1500", marginBps: -3333, netProfitMinor: "-2500" }));
    expect(r.grossProfitMinor).toBe(-1500); expect(r.marginBps).toBe(-3333); expect(r.netProfitMinor).toBe(-2500);
    expect(r.topByProfit[0]).toEqual({ name: "Eggs", quantity: 3, revenueMinor: 13000, profitMinor: 4000 });
  });
  it("refuses an amount that cannot be shown exactly, and an incomplete report", () => {
    expect(() => parseProfitReport(raw({ grossProfitMinor: "9007199254740993" }))).toThrow(/cannot be shown exactly/);
    expect(() => parseProfitReport({ ...raw(), expenses: undefined })).toThrow(/incomplete/);
  });
  it("margin: one decimal, and a dash when nothing has a known cost", () => {
    expect(formatMargin(3077)).toBe("30.8%"); expect(formatMargin(-3333)).toBe("-33.3%"); expect(formatMargin(null)).toBe("—");
  });
  it("knows when only part of the sales have a cost", () => {
    expect(hasPartialCost(parseProfitReport(raw()))).toBe(true);
    expect(hasPartialCost(parseProfitReport(raw({ uncoveredRevenueMinor: "0", saleLines: { total: 2, withCost: 2 } })))).toBe(false);
  });
  it("the spreadsheet restates every figure, with the coverage note", () => {
    const csv = profitReportCsv(parseProfitReport(raw()), opts);
    expect(csv).toContain('"Net sales (after refunds)","142.00"');
    expect(csv).toContain('"Cost of goods sold","90.00"');
    expect(csv).toContain('"Gross margin","30.8%"');
    expect(csv).toContain('"Expenses (2)","10.00"');
    expect(csv).toContain('"Net profit","30.00"');
    expect(csv).toContain('"Eggs","3","130.00","40.00"');
    expect(csv).toContain("no cost recorded");
    expect(csv.split("\r\n").length).toBeGreaterThan(10);
  });
  it("a product name that looks like a formula cannot run in a spreadsheet", () => {
    const csv = profitReportCsv(parseProfitReport(raw({ topByProfit: [{ name: '=HYPERLINK("http://x")', quantity: 1, revenueMinor: "100", profitMinor: "50" }] })), opts);
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(csv).not.toMatch(/(^|,)"=HYPERLINK/m);
  });
  it("the shared text carries the headline and the coverage warning", () => {
    const text = formatProfitText(parseProfitReport(raw()), opts);
    expect(text).toMatch(/Gross profit: .*40\.00 \(30\.8%\)/);
    expect(text).toMatch(/Net profit: .*30\.00/);
    expect(text).toMatch(/12\.00 of sales have no cost recorded/);
    expect(formatProfitText(parseProfitReport(raw({ uncoveredRevenueMinor: "0", saleLines: { total: 3, withCost: 3 }, expenses: { count: 0, totalMinor: "0" } })), opts)).not.toMatch(/Note:|Expenses/);
  });
});
