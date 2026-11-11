import { describe, expect, it } from "vitest";
import { formatCustomerStatementText } from "./customerStatementText";
import type { CustomerStatement } from "./shopClient";

const entry = (over: Partial<CustomerStatement["entries"][number]>) => ({ kind: "credit_sale" as const, amountMinor: 4500, balanceAfterMinor: 4500,
  receiptNumber: 12, method: null, reference: null, recordedAt: "2026-11-02T10:00:00Z", ...over });
const statement = (entries: CustomerStatement["entries"], balanceMinor: number): CustomerStatement =>
  ({ id: "c", name: "Ama Boateng", phone: "0240000001", creditLimitMinor: 100000, balanceMinor, entries });

describe("customer statement text", () => {
  it("restates every entry and the server's balance", () => {
    const text = formatCustomerStatementText("Kwaku Provisions", statement([
      entry({}), entry({ kind: "repayment", amountMinor: -1500, balanceAfterMinor: 3000, receiptNumber: null, method: "mobile" }),
    ], 3000), "GHS", "en-GB");
    expect(text).toContain("Kwaku Provisions");
    expect(text).toContain("Statement for Ama Boateng");
    expect(text).toMatch(/Bought on credit · receipt #12: \+.*45\.00 \(owes .*45\.00\)/);
    expect(text).toMatch(/Paid · mobile money: −.*15\.00 \(owes .*30\.00\)/);
    expect(text).toMatch(/Balance owed: .*30\.00/);
    expect(text.endsWith("Thank you.")).toBe(true);
  });
  it("says nothing is owed, and that there is no activity, when that is true", () => {
    expect(formatCustomerStatementText("Shop", statement([], 0), "GHS")).toMatch(/No activity yet\.\n\nBalance owed: nothing/);
  });
  it("keeps the newest entries of a long history and says so", () => {
    const many = Array.from({ length: 50 }, (_, i) => entry({ receiptNumber: i + 1 }));
    const text = formatCustomerStatementText("Shop", statement(many, 4500), "GHS", "en-GB", 10);
    expect(text).toContain("(latest 10 of 50 entries)");
    expect(text).toContain("receipt #50");
    expect(text).not.toContain("receipt #40:");
    expect(text).toContain("receipt #41");
  });
});
