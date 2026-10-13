import { describe, expect, it } from "vitest";
import { calculateStockAlerts } from "./localAlerts";
import type { Product } from "./inventory";
const product = (id: string, qty: number, threshold = 3, kind: "stock" | "service" = "stock"): Product => ({
 id, businessProfileId: "test", name: id, normalizedName: id, sellingPriceMinor: 100,
 stockQuantity: qty, lowStockThreshold: threshold, itemKind: kind, createdAt: "2026-01-01", updatedAt: "2026-01-01"
});
describe("offline stock alerts", () => {
 it("prioritizes out of stock and ignores nonstock services", () => {
  expect(calculateStockAlerts([product("low", 2), product("service", 0, 3, "service"), product("out", 0), product("healthy", 8)]).map(x => x.productId)).toEqual(["out", "low"]);
 });
 it("does not silently accept inconsistent inventory", () => {
  expect(() => calculateStockAlerts([product("bad", -1)])).toThrow("Invalid stock");
  expect(() => calculateStockAlerts([product("x", 1), product("x", 1)])).toThrow("Duplicate product");
 });
});
