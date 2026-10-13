import { describe, expect, it } from "vitest";
import { recoverSavedCheckout } from "./recoverSavedCheckout";
import type { SaleSnapshot } from "./sales";
const sale = { id: "sale1", businessProfileId: "a", submissionKey: "key1", amountPaidMinor: 500, subtotalMinor: 900, discountMinor: 100, totalMinor: 800, outstandingMinor: 300, paymentMethod: "cash", receiptNumber: "R-1" };
const receipt = { id: "receipt1", saleId: "sale1", businessProfileId: "a", receiptNumber: "R-1" };
const payment = { id: "payment1", saleId: "sale1", businessProfileId: "a", amountMinor: 500, method: "cash" };
const line = { id: "line1", saleId: "sale1", businessProfileId: "a", productId: "rice", quantity: 3, unitPriceMinor: 300, lineTotalMinor: 900 };
const snapshot = (changes: Partial<SaleSnapshot> = {}): SaleSnapshot => ({ sales: [sale], receipts: [receipt], payments: [payment], lines: [line], ...changes } as SaleSnapshot);
describe("read-only checkout recovery", () => {
  it("resolves a reconciled partial payment without writes", () => {
    expect(recoverSavedCheckout(snapshot(), "a", "key1")).toEqual({ sale, receipt, payment });
  });
  it("keeps businesses and uncommitted submissions isolated", () => {
    expect(recoverSavedCheckout(snapshot(), "b", "key1")).toBeNull();
    expect(recoverSavedCheckout(snapshot(), "a", "uncommitted")).toBeNull();
  });
  it("blocks missing, duplicate and mismatched receipts", () => {
    expect(() => recoverSavedCheckout(snapshot({ receipts: [] }), "a", "key1")).toThrow(/receipt/);
    expect(() => recoverSavedCheckout(snapshot({ receipts: [receipt, receipt] as SaleSnapshot["receipts"] }), "a", "key1")).toThrow(/receipt/);
    expect(() => recoverSavedCheckout(snapshot({ receipts: [{ ...receipt, receiptNumber: "different" }] as SaleSnapshot["receipts"] }), "a", "key1")).toThrow(/receipt/);
  });
  it("blocks missing, malformed and mismatched sale lines", () => {
    expect(() => recoverSavedCheckout(snapshot({ lines: [] }), "a", "key1")).toThrow(/lines/);
    expect(() => recoverSavedCheckout(snapshot({ lines: [{ ...line, lineTotalMinor: 800 }] as SaleSnapshot["lines"] }), "a", "key1")).toThrow(/lines/);
    expect(() => recoverSavedCheckout(snapshot({ sales: [{ ...sale, subtotalMinor: 800 }] as SaleSnapshot["sales"] }), "a", "key1")).toThrow(/totals/);
  });
  it("requires exact payment reconciliation, including zero-payment credit sales", () => {
    expect(() => recoverSavedCheckout(snapshot({ payments: [] }), "a", "key1")).toThrow(/payment/);
    expect(() => recoverSavedCheckout(snapshot({ payments: [{ ...payment, amountMinor: 600 }] as SaleSnapshot["payments"] }), "a", "key1")).toThrow(/payment/);
    expect(() => recoverSavedCheckout(snapshot({ payments: [payment, payment] as SaleSnapshot["payments"] }), "a", "key1")).toThrow(/payment/);
    const credit = { ...sale, amountPaidMinor: 0, outstandingMinor: 800, paymentMethod: "credit" };
    expect(recoverSavedCheckout(snapshot({ sales: [credit] as SaleSnapshot["sales"], payments: [] }), "a", "key1")?.payment).toBeUndefined();
  });
  it("blocks duplicate sales sharing a submission key", () => {
    expect(() => recoverSavedCheckout(snapshot({ sales: [sale, { ...sale, id: "sale2" }] as SaleSnapshot["sales"] }), "a", "key1")).toThrow(/More than one/);
  });
});
