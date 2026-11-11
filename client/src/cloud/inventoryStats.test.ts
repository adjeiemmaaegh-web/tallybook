import { describe, expect, it } from "vitest";
import { computeStockStats, matchesFilter, stockStatus, type StatProduct } from "./inventoryStats";

const products: StatProduct[] = [
  { id: "rice", active: true, lowStockThreshold: 5, costMinor: 7000 },   // 10 in stock
  { id: "eggs", active: true, lowStockThreshold: 5, costMinor: 3000 },   // 3 -> low
  { id: "milk", active: true, lowStockThreshold: 5, costMinor: 800 },    // 0 -> out (not low)
  { id: "oil", active: true, costMinor: null },                          // 4, no cost
  { id: "cut", active: true, trackStock: false },                        // service
  { id: "old", active: false, lowStockThreshold: 5, costMinor: 100 },    // hidden, 9 on hand
  { id: "edge", active: true, lowStockThreshold: 5, costMinor: 100 },    // exactly 5 -> low
];
const stock: Record<string, number> = { rice: 10, eggs: 3, milk: 0, oil: 4, cut: 7, old: 9, edge: 5 };
const qty = (id: string) => stock[id] ?? 0;

describe("stockStatus", () => {
  it("separates out, low, in and not counted", () => {
    expect(stockStatus(products[0]!, 10)).toBe("in");
    expect(stockStatus(products[1]!, 3)).toBe("low");
    expect(stockStatus(products[6]!, 5)).toBe("low");            // at the level counts as low
    expect(stockStatus(products[2]!, 0)).toBe("out");
    expect(stockStatus(products[2]!, -2)).toBe("out");
    expect(stockStatus(products[3]!, 4)).toBe("in");              // no level set
    expect(stockStatus(products[4]!, 7)).toBe("untracked");
  });
});

describe("computeStockStats", () => {
  it("counts only active, counted products and never double-counts out and low", () => {
    const s = computeStockStats(products, qty);
    expect(s).toMatchObject({ products: 6, counted: 5, units: 10 + 3 + 0 + 4 + 5, out: 1, low: 2, withoutCost: 1 });
  });
  it("values stock at cost, leaving out products with no cost, services and hidden products", () => {
    // rice 10×7000 + eggs 3×3000 + edge 5×100 (milk has none, oil has no cost, cut is a service, old is hidden)
    expect(computeStockStats(products, qty).valueMinor).toBe(70000 + 9000 + 500);
  });
  it("ignores negative stock and handles an empty shop", () => {
    expect(computeStockStats(products, () => -5)).toMatchObject({ units: 0, out: 5, low: 0, valueMinor: 0, withoutCost: 0 });
    expect(computeStockStats([], qty)).toEqual({ products: 0, counted: 0, units: 0, out: 0, low: 0, valueMinor: 0, withoutCost: 0 });
  });
  it("says so instead of rounding when the value is too large to be exact", () => {
    const huge: StatProduct[] = [{ id: "a", active: true, costMinor: 100_000_000_000 }];
    expect(computeStockStats(huge, () => 1_000_000).valueMinor).toBeNull();
    expect(computeStockStats(huge, () => 1000).valueMinor).toBe(100_000_000_000_000);
  });
});

describe("matchesFilter", () => {
  const pick = (filter: Parameters<typeof matchesFilter>[2]) => products.filter(p => matchesFilter(p, qty(p.id), filter)).map(p => p.id);
  it("filters like the summary counts, and shows hidden products only under All", () => {
    expect(pick("all")).toEqual(["rice", "eggs", "milk", "oil", "cut", "old", "edge"]);
    expect(pick("out")).toEqual(["milk"]);
    expect(pick("low")).toEqual(["eggs", "edge"]);
    expect(pick("in")).toEqual(["rice", "oil"]);
    expect(pick("untracked")).toEqual(["cut"]);
  });
});
