import { describe, expect, it } from "vitest";
import { calculateDisplayCart } from "./customerCartSummary";
describe("Stage 7 customer view is read-only and arithmetic-safe", () => {
  it("calculates display totals without changing line inputs", () => {
    const lines = [{ name: "Rice", quantity: 3, unitPriceMinor: 1250 }];
    expect(calculateDisplayCart(lines, 250)).toEqual({ subtotalMinor: 3750, discountMinor: 250, totalMinor: 3500 });
    expect(lines[0].quantity).toBe(3);
  });
  it("rejects invalid quantities, discounts and unsafe totals", () => {
    expect(() => calculateDisplayCart([{ name: "Rice", quantity: -1, unitPriceMinor: 100 }], 0)).toThrow();
    expect(() => calculateDisplayCart([{ name: "Rice", quantity: 1, unitPriceMinor: 100 }], 101)).toThrow();
    expect(() => calculateDisplayCart([{ name: "Rice", quantity: Number.MAX_SAFE_INTEGER, unitPriceMinor: 3 }], 0)).toThrow();
  });
});
