import { beforeEach, describe, expect, it } from "vitest";
import { calculateInsights, calculateReorderSuggestion, renderDays, renderReorderSuggestion, renderSalesComparison, renderSlowMovers } from "./insights";
import { useAssistantDb } from "./testKit";

const kit = useAssistantDb();
const NOW = new Date(2026, 9, 15, 12);
let saleNumber = 0;

async function addSale(when: Date, productId: string, productName: string, quantity: number, totalMinor = quantity * 100) {
  const id = `insight-sale-${++saleNumber}`;
  await kit.database.sales.add({ id, businessProfileId: "primary", receiptNumber: id, status: "completed", subtotalMinor: totalMinor, discountMinor: 0, totalMinor, amountPaidMinor: totalMinor, outstandingMinor: 0, paymentMethod: "cash", submissionKey: id, createdAt: when.toISOString() });
  await kit.database.saleLines.add({ id: `${id}-line`, saleId: id, productId, businessProfileId: "primary", productName, quantity, unitPriceMinor: 100, lineTotalMinor: totalMinor });
}

beforeEach(async () => {
  saleNumber = 0;
  await kit.database.sales.clear();
  await kit.database.saleLines.clear();
  await kit.database.products.update(kit.products.eggs.id, { stockQuantity: 20, createdAt: new Date(2026, 8, 1).toISOString() });
  await kit.database.products.update(kit.products.rice.id, { stockQuantity: 20, createdAt: new Date(2026, 8, 1).toISOString() });
  await kit.database.products.update(kit.products.soap.id, { stockQuantity: 20, createdAt: new Date(2026, 8, 1).toISOString() });
});

describe("period sales comparison", () => {
  it("calculates increase, decrease, and unchanged wording", () => {
    expect(renderSalesComparison({ ...({ currentMinor: 120, previousMinor: 100, changeMinor: 20, percentage: 20, direction: "increase" }) })).toBe("Sales are up 20% compared with last month.");
    expect(renderSalesComparison({ currentMinor: 92, previousMinor: 100, changeMinor: -8, percentage: 8, direction: "decrease" })).toBe("Sales are down 8% compared with last month.");
    expect(renderSalesComparison({ currentMinor: 100, previousMinor: 100, changeMinor: 0, percentage: 0, direction: "unchanged" })).toBe("Sales are unchanged compared with last month.");
  });

  it("handles a zero comparison period without NaN or Infinity", () => {
    const result = { currentMinor: 100, previousMinor: 0, changeMinor: 100, direction: "no-comparison" as const };
    expect(renderSalesComparison(result)).toContain("no sales last month");
    expect(renderSalesComparison(result)).not.toMatch(/NaN|Infinity/);
  });

  it("loads this month and last month from the existing period queries", async () => {
    await addSale(new Date(2026, 9, 3), kit.products.eggs.id, "Eggs", 2, 200);
    await addSale(new Date(2026, 8, 3), kit.products.eggs.id, "Eggs", 1, 100);
    const result = (await calculateInsights(kit.database, NOW)).salesComparison;
    expect(result.currentMinor).toBe(200);
    expect(result.previousMinor).toBe(100);
    expect(result.percentage).toBe(100);
    expect(result.direction).toBe("increase");
  });
});

describe("reorder calculations", () => {
  it("flags low stock and rounds the 14-day estimate upward", () => {
    const suggestion = calculateReorderSuggestion({ id: "eggs", name: "Eggs", stockQuantity: 1 } as never, 10, 30);
    expect(suggestion.status).toBe("reorder");
    expect(suggestion.daysLeft).toBe(3);
    expect(suggestion.suggestedQuantity).toBe(4);
    expect(renderReorderSuggestion(suggestion)).toContain("4 units");
  });

  it("does not suggest a negative quantity for well-stocked products", () => {
    const suggestion = calculateReorderSuggestion({ id: "rice", name: "Rice", stockQuantity: 1000 } as never, 1, 30);
    expect(suggestion.status).toBe("sufficient-stock");
    expect(suggestion.suggestedQuantity).toBeUndefined();
  });

  it("distinguishes no sales, out of stock, and limited history", () => {
    const product = (stockQuantity: number) => ({ id: "p", name: "Product", stockQuantity } as never);
    expect(calculateReorderSuggestion(product(10), 0, 30).status).toBe("no-sales");
    expect(calculateReorderSuggestion(product(0), 5, 30).status).toBe("out-of-stock");
    expect(calculateReorderSuggestion(product(1), 5, 3).status).toBe("limited-history");
    expect(renderDays(1)).toBe("1 day");
    expect(renderDays(2)).toBe("2 days");
  });

  it("calculates suggestions from the last 30 days and identifies slow movers", async () => {
    await addSale(new Date(2026, 9, 10), kit.products.eggs.id, "Eggs", 30, 3000);
    await addSale(new Date(2026, 8, 10), kit.products.rice.id, "Rice", 5, 500); // outside the last 30 days
    const insights = await calculateInsights(kit.database, NOW);
    expect(insights.reorderSuggestions.find((item) => item.productName === "Eggs")?.unitsSold).toBe(30);
    expect(insights.reorderSuggestions.find((item) => item.productName === "Rice")?.unitsSold).toBe(0);
    expect(insights.slowMovers.map((item) => item.productName)).toContain("Rice");
    expect(insights.slowMovers.map((item) => item.productName)).toContain("Laundry soap");
  });
});


  it("uses actual observation days for young products but does not invent a reorder quantity", () => {
    const product = { id: "new", name: "New product", stockQuantity: 4 } as never;
    const result = calculateReorderSuggestion(product, 14, 2);
    expect(result.velocityPerDay).toBe(7);
    expect(result.status).toBe("limited-history");
    expect(renderReorderSuggestion(result)).not.toMatch(/Estimated reorder:|14 units/);
  });

  it("refuses negative stock, negative sales, and invalid days", () => {
    expect(() => calculateReorderSuggestion({ id: "x", name: "X", stockQuantity: -1 } as never, 1, 30)).toThrow();
    expect(() => calculateReorderSuggestion({ id: "x", name: "X", stockQuantity: 1 } as never, -1, 30)).toThrow();
    expect(() => calculateReorderSuggestion({ id: "x", name: "X", stockQuantity: 1 } as never, 1, NaN)).toThrow();
  });

describe("slow movers and empty templates", () => {
  it("only calls stocked products with zero recent sales slow movers", () => {
    expect(renderSlowMovers([])).toContain("No slow-moving products");
    expect(renderSlowMovers([{ productId: "p", productName: "Rice", stock: 2 }])).toContain("Rice (2 in stock)");
  });

  it("provides an empty reorder result without invented numbers", async () => {
    const insights = await calculateInsights(kit.database, NOW);
    expect(insights.reorderSuggestions.every((item) => item.status === "no-sales")).toBe(true);
    expect(renderReorderSuggestion(insights.reorderSuggestions[0])).not.toMatch(/\d+ days left/);
  });
});

describe("assistant insights integration", () => {
  it("routes explicit insight questions without writing ledger data", async () => {
    await addSale(new Date(2026, 9, 10), kit.products.eggs.id, "Eggs", 30, 3000);
    const before = await kit.database.sales.count();
    const comparison = await kit.assistantAt(NOW).send("Are sales up this month?");
    const reorder = await kit.assistantAt(NOW).send("What should I reorder?");
    const slow = await kit.assistantAt(NOW).send("What are the slow movers?");
    expect(comparison.intent).toBe("INSIGHTS_QUERY");
    expect(comparison.text).toContain("no sales last month");
    expect(reorder.intent).toBe("INSIGHTS_QUERY");
    expect(reorder.text).toContain("reorder");
    expect(slow.intent).toBe("INSIGHTS_QUERY");
    expect(slow.text.toLowerCase()).toContain("slow-moving");
    expect(await kit.database.sales.count()).toBe(before);
  });
});
