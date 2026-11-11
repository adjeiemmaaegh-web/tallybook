import { describe, expect, it } from "vitest";
import { formatQuotationText, isLive, parseQuotations, type Quotation } from "./quotations";

const raw = (over: Record<string, unknown> = {}) => ({ quotations: [{ quotationId: "q1", quoteNo: 7, storeId: "n", customerId: null, customerName: "Mr Mensah", validUntil: "2026-11-30",
  note: "Delivery extra", totalMinor: "12600", status: "open", createdBy: "u1", createdAt: "2026-11-16T10:00:00Z", saleId: null,
  lines: [{ productId: "eggs", name: "Eggs", quantity: 2, unitPriceMinor: 4500, lineTotalMinor: 9000 }, { productId: "bread", name: "Bread", quantity: 3, unitPriceMinor: 1200, lineTotalMinor: 3600 }], ...over }] });
const quote = (over: Record<string, unknown> = {}): Quotation => parseQuotations(raw(over))[0];

describe("quotations client", () => {
  it("reads amounts and lines", () => {
    const q = quote();
    expect(q.totalMinor).toBe(12600); expect(q.lines[1]).toEqual({ productId: "bread", name: "Bread", quantity: 3, unitPriceMinor: 1200, lineTotalMinor: 3600 });
    expect(q.saleId).toBeNull(); expect(q.customerId).toBeNull();
  });
  it("refuses an amount that cannot be shown exactly, and a response that is not a list", () => {
    expect(() => quote({ totalMinor: "9007199254740993" })).toThrow(/cannot be shown exactly/);
    expect(() => parseQuotations({})).toThrow(/Unexpected response/);
  });
  it("knows which quotations can still become a sale", () => {
    expect(isLive(quote())).toBe(true); expect(isLive(quote({ status: "accepted" }))).toBe(true);
    for (const status of ["declined", "cancelled", "converted", "expired"]) expect(isLive(quote({ status }))).toBe(false);
  });
  it("the shared message restates the saved quotation: lines, total, validity, note", () => {
    const text = formatQuotationText("Kwaku Provisions", quote(), "GHS", "en-GB").replaceAll(" ", " ");
    expect(text).toContain("Quotation #7 for Mr Mensah");
    expect(text).toContain("2 × Eggs @ GHS 45.00 = GHS 90.00");
    expect(text).toContain("3 × Bread @ GHS 12.00 = GHS 36.00");
    expect(text).toContain("Total: GHS 126.00");
    expect(text).toContain("Valid until 30/11/2026");
    expect(text).toContain("Note: Delivery extra");
    expect(formatQuotationText("S", quote({ note: null }), "GHS")).not.toContain("Note:");
  });
});
