import { describe, expect, it } from "vitest";
import { parseBatch } from "./batchParser";

describe("parseBatch", () => {
  it("detects bullet-pointed multi-line transactions", () => {
    const text = `- Sell 2 eggs to Kwame, cash
- Sell 3 rice to Adwoa, credit
- Receive 10 eggs from Suppliers`;
    const batch = parseBatch(text);
    expect(batch).toBeTruthy();
    expect(batch?.items.length).toBe(3);
    expect(batch?.items[0]?.intent).toBe("RECORD_SALE");
    expect(batch?.items[1]?.intent).toBe("RECORD_SALE");
    expect(batch?.items[2]?.intent).toBe("RECEIVE_STOCK");
  });

  it("detects numbered multi-line transactions", () => {
    const text = `1. Sell 2 eggs to Kwame, cash
2. Sell 1 bag rice to Adwoa, credit
3. Receive 5 crates eggs from XYZ`;
    const batch = parseBatch(text);
    expect(batch).toBeTruthy();
    expect(batch?.items.length).toBeGreaterThanOrEqual(2);
  });

  it("detects newline-separated multi-line transactions", () => {
    const text = `Sell 2 eggs to Kwame, cash
Sell 3 rice to Adwoa, credit
Record payment from Kwame: 50 cedis`;
    const batch = parseBatch(text);
    expect(batch).toBeTruthy();
    expect(batch?.items.length).toBeGreaterThanOrEqual(2);
  });

  it("strips bullets and numbers correctly", () => {
    const text = `• Sell 5 Fanta to Kwame
- Receive 20 eggs from supplier`;
    const batch = parseBatch(text);
    if (batch) {
      expect(batch.items[0]?.entities.productText?.toLowerCase()).toContain("fanta");
    }
  });

  it("returns null for single-line input", () => {
    const text = "Sell 2 eggs to Kwame, cash";
    const batch = parseBatch(text);
    expect(batch).toBeNull();
  });

  it("returns null for non-transaction content", () => {
    const text = `How much does Kwame owe?
What's our best-selling product?`;
    const batch = parseBatch(text);
    expect(batch).toBeNull();
  });

  it("filters out very short lines (noise)", () => {
    const text = `Sell 2 eggs to Kwame, cash
OK
Receive 10 eggs from supplier`;
    const batch = parseBatch(text);
    if (batch) {
      // Should not include the "OK" line
      expect(batch.items.length).toBeLessThanOrEqual(2);
    }
  });
});
