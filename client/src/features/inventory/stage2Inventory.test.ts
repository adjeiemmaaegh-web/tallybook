import { describe, expect, it } from "vitest";
import { selectUnitPrice, unitsFromPacks } from "./stage2Inventory";
import type { Product } from "./inventory";

describe("stage 2 integer-unit semantics", () => {
  it("converts packs without floating stock", () => {
    expect(unitsFromPacks(3, 12)).toBe(36);
    expect(() => unitsFromPacks(0.5, 12)).toThrow();
    expect(() => unitsFromPacks(1, 0)).toThrow();
    expect(() => unitsFromPacks(9_999_999, 100)).toThrow();
  });
  it("chooses wholesale threshold exactly", () => {
    const product = { sellingPriceMinor: 900, wholesalePriceMinor: 750, wholesaleMinimumQuantity: 5 } as Product;
    expect(selectUnitPrice(product, 4)).toBe(900);
    expect(selectUnitPrice(product, 5)).toBe(750);
    expect(() => selectUnitPrice(product, 0)).toThrow();
  });
});
