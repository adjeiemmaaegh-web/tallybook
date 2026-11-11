import { describe, expect, it } from "vitest";
import { accountsCsv, describeDifference, parseAccountsOverview, parseReconciliations, parseTransfers } from "./accounts";

const comp = (over: Record<string, string> = {}) => ({ sales: "9000", repayments: "1000", transfersIn: "0", refunds: "4500", suppliers: "5000", expenses: "700", transfersOut: "3000", ...over });
const acct = (over: Record<string, unknown> = {}) => ({ components: comp(), inMinor: "10000", outMinor: "13200", netMinor: "-3200", lastReconciliation: null, expectedNowMinor: null, ...over });
const raw = (over: Record<string, unknown> = {}) => ({ from: "a", to: "b", accounts: { cash: acct(), mobile: acct({ components: comp({ sales: "1200", repayments: "0", refunds: "0", suppliers: "0", expenses: "300", transfersOut: "0" }), inMinor: "1200", outMinor: "300", netMinor: "900" }),
  card: acct({ inMinor: "3600", outMinor: "0", netMinor: "3600" }), bank: acct({ inMinor: "3000", outMinor: "2000", netMinor: "1000" }) },
  position: { customersOweMinor: "3500", oweSuppliersMinor: "23000", stockAtCostMinor: "624000", stockLinesWithoutCost: 2 }, ...over });
const opts = { shopName: "Kwaku Provisions", periodLabel: "Today", currency: "GHS" };

describe("accounts client", () => {
  it("reads every account, count and position figure into numbers (including negatives)", () => {
    const o = parseAccountsOverview(raw());
    expect(o.accounts.cash.netMinor).toBe(-3200); expect(o.accounts.cash.components.suppliers).toBe(5000);
    expect(o.position).toEqual({ customersOweMinor: 3500, oweSuppliersMinor: 23000, stockAtCostMinor: 624000, stockLinesWithoutCost: 2 });
    expect(o.accounts.bank.lastReconciliation).toBeNull(); expect(o.accounts.bank.expectedNowMinor).toBeNull();
  });
  it("reads a last count and the expected balance now", () => {
    const o = parseAccountsOverview(raw({ accounts: { ...raw().accounts, cash: acct({ lastReconciliation: { reconciliationId: "r1", asOf: "2026-11-16T10:00:00Z", actualMinor: "53800", differenceMinor: "-200" }, expectedNowMinor: "53800" }) } }));
    expect(o.accounts.cash.lastReconciliation).toEqual({ reconciliationId: "r1", asOf: "2026-11-16T10:00:00Z", actualMinor: 53800, differenceMinor: -200 });
    expect(o.accounts.cash.expectedNowMinor).toBe(53800);
  });
  it("refuses an amount that cannot be shown exactly, and an incomplete response", () => {
    expect(() => parseAccountsOverview(raw({ position: { customersOweMinor: "9007199254740993", oweSuppliersMinor: "0", stockAtCostMinor: "0", stockLinesWithoutCost: 0 } }))).toThrow(/cannot be shown exactly/);
    expect(() => parseAccountsOverview({ ...raw(), accounts: { cash: acct() } })).toThrow(/incomplete/);
    expect(() => parseReconciliations({})).toThrow(/incomplete|Unexpected/);
  });
  it("reads counts and transfers", () => {
    const counts = parseReconciliations({ reconciliations: [{ reconciliationId: "r", account: "cash", asOf: "t", actualMinor: "100", expectedMinor: null, differenceMinor: null, note: "Opening" }] });
    expect(counts[0]).toMatchObject({ actualMinor: 100, expectedMinor: null, differenceMinor: null, note: "Opening" });
    const t = parseTransfers({ transfers: [{ transferId: "x", from: "cash", to: "bank", amountMinor: "3000", note: null, recordedAt: "t", voided: true, voidReason: "Twice" }] });
    expect(t[0]).toMatchObject({ amountMinor: 3000, voided: true, voidReason: "Twice" });
  });
  it("says over, short, matching and opening in words", () => {
    expect(describeDifference(null, "GHS")).toBe("Opening balance set");
    expect(describeDifference(0, "GHS")).toBe("Matches the records");
    expect(describeDifference(-200, "GHS").replaceAll(" ", " ")).toBe("GHS 2.00 short");
    expect(describeDifference(500, "GHS").replaceAll(" ", " ")).toBe("GHS 5.00 over");
  });
  it("the spreadsheet has a row per account and the position, with the missing-cost note", () => {
    const csv = accountsCsv(parseAccountsOverview(raw()), opts);
    expect(csv).toContain('"Cash","90.00","10.00","0.00","45.00","50.00","7.00","30.00","100.00","132.00","-32.00","",""');
    expect(csv).toContain('"Customers owe","35.00"'); expect(csv).toContain('"Owed to suppliers","230.00"'); expect(csv).toContain('"Stock at cost","6240.00"');
    expect(csv).toContain("2 stock line(s) have no cost recorded");
    expect(accountsCsv(parseAccountsOverview(raw({ position: { customersOweMinor: "0", oweSuppliersMinor: "0", stockAtCostMinor: "0", stockLinesWithoutCost: 0 } })), opts)).not.toContain("Note");
  });
});
