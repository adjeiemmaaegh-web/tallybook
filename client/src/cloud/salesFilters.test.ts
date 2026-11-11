import { describe, expect, it } from "vitest";
import { dayRange, filterSalesLocally, paymentKind } from "./salesFilters";
import { sampleReceipt } from "./testReceipt";

describe("dayRange", () => {
  const noon = new Date(2026, 10, 10, 12, 30); // 10 Nov 2026, local time
  const local = (iso?: string) => (iso ? new Date(iso) : null);
  it("has no bounds for All", () => expect(dayRange("all", noon)).toEqual({}));
  it("covers exactly the local day for Today and Yesterday", () => {
    const today = dayRange("today", noon);
    expect(local(today.from)).toEqual(new Date(2026, 10, 10));
    expect(local(today.to)).toEqual(new Date(2026, 10, 11));
    const yesterday = dayRange("yesterday", noon);
    expect(local(yesterday.from)).toEqual(new Date(2026, 10, 9));
    expect(local(yesterday.to)).toEqual(new Date(2026, 10, 10));
  });
  it("covers seven local days including today, and the month so far", () => {
    expect(local(dayRange("week", noon).from)).toEqual(new Date(2026, 10, 4));
    expect(local(dayRange("week", noon).to)).toEqual(new Date(2026, 10, 11));
    expect(local(dayRange("month", noon).from)).toEqual(new Date(2026, 10, 1));
  });
  it("crosses month and year boundaries correctly", () => {
    expect(local(dayRange("week", new Date(2026, 0, 3, 8)).from)).toEqual(new Date(2025, 11, 28));
    expect(local(dayRange("yesterday", new Date(2026, 2, 1, 8)).from)).toEqual(new Date(2026, 1, 28));
  });
});

describe("paymentKind and filterSalesLocally", () => {
  const cash = sampleReceipt({ receiptNumber: 1, totalMinor: 1000, discountMinor: 0, customer: null,
    tenders: [{ method: "cash", amountMinor: 1000, tenderedMinor: 1000, reference: null }] });
  const part = sampleReceipt({ receiptNumber: 2, totalMinor: 4500, recordedAt: "2026-11-09T10:00:00.000Z" }); // 1500 of 4500 on credit
  const allCredit = sampleReceipt({ receiptNumber: 3, totalMinor: 1500,
    tenders: [{ method: "credit", amountMinor: 1500, tenderedMinor: 1500, reference: null }], recordedAt: "2026-11-08T10:00:00.000Z" });
  const refunded = { ...cash, receiptNumber: 4, saleId: "s4", storeId: "other",
    refunds: [{ refundId: "r", refundNo: 1, amountMinor: 1000, method: "cash" as const, returnedToStock: true, reason: "x", actorId: "u", recordedAt: "", lines: [] }] };
  const all = [cash, part, allCredit, refunded];

  it("classifies how a sale was paid", () => {
    expect([cash, part, allCredit].map(paymentKind)).toEqual(["paid", "partial", "credit"]);
  });
  it("filters like the server: payment, store, receipt number, customer, cashier, dates", () => {
    const nums = (list: typeof all) => list.map(s => s.receiptNumber);
    expect(nums(filterSalesLocally(all, { payment: "paid" }))).toEqual([1, 4]);
    expect(nums(filterSalesLocally(all, { payment: "partial" }))).toEqual([2]);
    expect(nums(filterSalesLocally(all, { payment: "credit" }))).toEqual([3]);
    expect(nums(filterSalesLocally(all, { payment: "refunded" }))).toEqual([4]);
    expect(nums(filterSalesLocally(all, { storeId: "other" }))).toEqual([4]);
    expect(nums(filterSalesLocally(all, { q: "#3" }))).toEqual([3]);
    expect(nums(filterSalesLocally(all, { q: "kofi" }))).toEqual([2, 3]);
    expect(nums(filterSalesLocally(all, { q: "owner@" }, () => "Owner@demo.test"))).toEqual([1, 2, 3, 4]);
    expect(nums(filterSalesLocally(all, { from: "2026-11-09T00:00:00Z", to: "2026-11-10T00:00:00Z" }))).toEqual([2]);
    expect(nums(filterSalesLocally(all, { payment: "all", q: "  " }))).toEqual([1, 2, 3, 4]);
  });
});
