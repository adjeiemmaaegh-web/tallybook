// S6-03: independently derived expected drawer cash (pure function), exact rules + seeded oracle.
import {describe, expect, it} from "vitest";
import {calculateTrackedShiftCash} from "./staff";

const shift = {id: "sh1", businessProfileId: "co", staffId: "st", openingFloatMinor: 1000} as never;
type Rows = Parameters<typeof calculateTrackedShiftCash>[1];
const rows = (over: Partial<Rows> = {}): Rows => ({sales: [], payments: [], repayments: [], transfers: [], reversals: [], cashReturns: [], ...over});
const sale = (id: string, paymentMethod = "cash", shiftId = "sh1", businessProfileId = "co") => ({id, businessProfileId, shiftId, paymentMethod});

describe("calculateTrackedShiftCash rules", () => {
  it("opening float alone when nothing happened", () => {
    expect(calculateTrackedShiftCash(shift, rows())).toMatchObject({movementMinor: 0, expectedCashMinor: 1000});
  });
  it("counts only cash tenders of sales belonging to THIS shift", () => {
    const r = rows({
      sales: [sale("a"), sale("b", "mobile"), sale("c", "cash", "other-shift")] as never,
      payments: [{saleId: "a", method: "cash", amountMinor: 700}, {saleId: "b", method: "mobile", amountMinor: 900}, {saleId: "c", method: "cash", amountMinor: 5000}, {saleId: "a", method: "card", amountMinor: 50}],
    });
    expect(calculateTrackedShiftCash(shift, r)).toMatchObject({cashSalesMinor: 700, expectedCashMinor: 1700});
  });
  it("ignores another company's sale that reuses the shift id", () => {
    const r = rows({sales: [sale("a", "cash", "sh1", "OTHER")] as never, payments: [{saleId: "a", method: "cash", amountMinor: 999}]});
    expect(calculateTrackedShiftCash(shift, r).cashSalesMinor).toBe(0);
  });
  it("adds cash repayments and prepaid deposits, subtracts prepaid cash refunds, ignores non-cash and other shifts", () => {
    const r = rows({
      repayments: [{shiftId: "sh1", method: "cash", amountMinor: 300}, {shiftId: "sh1", method: "mobile", amountMinor: 400}, {shiftId: "x", method: "cash", amountMinor: 800}],
      transfers: [{shiftId: "sh1", method: "cash", kind: "deposit", amountMinor: 500}, {shiftId: "sh1", method: "cash", kind: "refund", amountMinor: 200}, {shiftId: "sh1", method: "mobile", kind: "deposit", amountMinor: 999}],
    });
    expect(calculateTrackedShiftCash(shift, r)).toMatchObject({cashRepaymentsMinor: 300, prepaidCashMinor: 300, expectedCashMinor: 1600});
  });
  it("reversals of cash sales reduce the drawer; reversals of mobile sales do not", () => {
    const r = rows({sales: [sale("a"), sale("b", "mobile")] as never,
      reversals: [{shiftId: "sh1", originalSaleId: "a", reversedReceivedMinor: -400}, {shiftId: "sh1", originalSaleId: "b", reversedReceivedMinor: -900}]});
    expect(calculateTrackedShiftCash(shift, r)).toMatchObject({cashReversalsMinor: -400, expectedCashMinor: 600});
  });
  it("cash partial returns reduce the drawer; mobile/card/credit returns never do", () => {
    const r = rows({sales: [sale("a"), sale("b", "mobile"), sale("c", "credit")] as never,
      cashReturns: [{shiftId: "sh1", originalSaleId: "a", refundedMinor: 250, refundMethod: "cash"}, {shiftId: "sh1", originalSaleId: "b", refundedMinor: 600, refundMethod: "mobile"}, {shiftId: "sh1", originalSaleId: "c", refundedMinor: 0, refundMethod: "credit"}]});
    expect(calculateTrackedShiftCash(shift, r)).toMatchObject({cashPartialRefundsMinor: -250, expectedCashMinor: 750});
  });
  it("refuses corrupt or hidden-by-aggregation records", () => {
    const bad = (r: Partial<Rows>, re: RegExp) => expect(() => calculateTrackedShiftCash(shift, rows(r))).toThrow(re);
    bad({sales: [sale("a")] as never, payments: [{saleId: "a", method: "cash", amountMinor: -1}, {saleId: "a", method: "cash", amountMinor: 500}]}, /Invalid recorded cash movement/);
    bad({repayments: [{shiftId: "sh1", method: "cash", amountMinor: 1.5}]}, /Invalid recorded cash movement/);
    bad({transfers: [{shiftId: "sh1", method: "cash", kind: "adjustment", amountMinor: 5}]}, /Invalid recorded cash movement/);
    bad({sales: [sale("a")] as never, reversals: [{shiftId: "sh1", originalSaleId: "a", reversedReceivedMinor: 5}]}, /Invalid recorded cash movement/);
    bad({sales: [sale("a")] as never, cashReturns: [{shiftId: "sh1", originalSaleId: "a", refundedMinor: 0, refundMethod: "cash"}]}, /Invalid recorded cash movement/);
    bad({sales: [sale("a"), sale("a")] as never}, /Duplicate sale records/);
    bad({cashReturns: [{shiftId: "sh1", originalSaleId: "ghost", refundedMinor: 5, refundMethod: "cash"}]}, /missing original sale or a different original tender/);
    bad({sales: [sale("a", "mobile")] as never, cashReturns: [{shiftId: "sh1", originalSaleId: "a", refundedMinor: 5, refundMethod: "cash"}]}, /different original tender/);
    expect(() => calculateTrackedShiftCash({...shift, openingFloatMinor: -1} as never, rows())).toThrow(/opening float/);
    expect(() => calculateTrackedShiftCash(shift, rows({sales: [sale("a")] as never, payments: [{saleId: "a", method: "cash", amountMinor: Number.MAX_SAFE_INTEGER}]}))).toThrow(/need reconciliation/);
    // refunds larger than the drawer would drive expected cash negative: refuse, never clamp
    expect(() => calculateTrackedShiftCash(shift, rows({sales: [sale("a")] as never, cashReturns: [{shiftId: "sh1", originalSaleId: "a", refundedMinor: 2000, refundMethod: "cash"}]}))).toThrow(/need reconciliation/);
  });
});

describe("calculateTrackedShiftCash against an independent oracle", () => {
  it("matches a naive per-event ledger over seeded random shifts", () => {
    let seed = 20261122;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
    for (let round = 0; round < 200; round++) {
      const opening = Math.floor(rnd() * 5000), sh = {...(shift as object), openingFloatMinor: opening} as never;
      const sales: ReturnType<typeof sale>[] = [], payments: Rows["payments"] = [], repayments: Rows["repayments"] = [], transfers: Rows["transfers"] = [], reversals: Rows["reversals"] = [], cashReturns: NonNullable<Rows["cashReturns"]> = [];
      let drawer = opening; // oracle: replay events one by one in a plain number
      const cashSaleIds: string[] = [];
      for (let i = 0; i < 12; i++) {
        const kind = pick(["sale", "repay", "dep", "refund", "reverse", "return"]);
        const mine = rnd() < 0.7, shiftId = mine ? "sh1" : "other";
        const amt = 1 + Math.floor(rnd() * 400);
        if (kind === "sale") {
          const method = pick(["cash", "mobile", "card"]), id = "s" + round + "_" + i;
          sales.push(sale(id, method, shiftId)); payments.push({saleId: id, method, amountMinor: amt});
          if (method === "cash" && mine) { drawer += amt; cashSaleIds.push(id); }
        } else if (kind === "repay") {
          const method = pick(["cash", "mobile"]); repayments.push({shiftId, method, amountMinor: amt}); if (method === "cash" && mine) drawer += amt;
        } else if (kind === "dep" || kind === "refund") {
          const method = pick(["cash", "mobile"]); transfers.push({shiftId, method, kind: kind === "dep" ? "deposit" : "refund", amountMinor: amt});
          if (method === "cash" && mine) drawer += kind === "dep" ? amt : -amt;
        } else if (kind === "reverse" && sales.length) {
          const s = pick(sales); reversals.push({shiftId, originalSaleId: s.id, reversedReceivedMinor: -amt});
          if (s.paymentMethod === "cash" && mine) drawer -= amt;
        } else if (kind === "return" && sales.length) {
          const s = pick(sales); const method = s.paymentMethod; cashReturns.push({shiftId, originalSaleId: s.id, refundedMinor: amt, refundMethod: method});
          if (method === "cash" && mine) drawer -= amt;
        }
      }
      const input = {sales: sales as never, payments, repayments, transfers, reversals, cashReturns};
      if (drawer < 0) { expect(() => calculateTrackedShiftCash(sh, input)).toThrow(/need reconciliation/); continue; }
      const got = calculateTrackedShiftCash(sh, input);
      expect(got.expectedCashMinor, `round ${round}`).toBe(drawer);
      expect(got.expectedCashMinor).toBe(opening + got.movementMinor);
    }
  });
});
