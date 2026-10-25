import { describe, expect, it } from "vitest";
import type { Product } from "@/features/inventory/inventory";
import type { InventoryCostEvent } from "@/features/inventory/costLedger";
import type { Purchase, PurchaseLine } from "@/features/purchases/purchases";
import { reconcileInventoryValuation } from "./inventoryValuation";

const company = "shop-1";
const product = (stockQuantity: number): Product => ({
  id: "product-1", businessProfileId: company, name: "Rice", stockQuantity,
  itemKind: "stock", baseUnit: "kg",
} as Product);
const event = (overrides: Partial<InventoryCostEvent>): InventoryCostEvent => ({
  id: "opening-1", businessProfileId: company, productId: "product-1", sequence: 1,
  createdAt: "2026-10-01T10:00:00.000Z", kind: "opening", sourceId: "opening:product-1",
  quantityDelta: 2, unitCostMinor: 500, allocations: [], ...overrides,
});
const purchase = (id: string, currency?: string, totalCostMinor = 1400): Purchase => ({
  id, businessProfileId: company, supplierId: "supplier-1", totalCostMinor,
  currency, purchaseDate: "2026-10-01",
} as Purchase);
const line = (id: string, purchaseId: string, quantity: number, unitCostMinor: number, batchId?: string, lineTotalMinor = quantity * unitCostMinor): PurchaseLine => ({
  id, businessProfileId: company, purchaseId, productId: "product-1", quantity,
  unitCostMinor, lineTotalMinor, batchId,
} as PurchaseLine);
const snapshotAt = "2026-10-23T12:00:00.000Z";

describe("currency-safe current inventory valuation", () => {
  it("values purchase-linked layers but keeps an opening layer of unverified currency unknown", () => {
    const receipt = event({
      id: "receipt-1", sequence: 2, kind: "receipt", sourceId: "movement-1",
      quantityDelta: 2, unitCostMinor: 700, purchaseId: "purchase-1",
    });
    const result = reconcileInventoryValuation(company, [product(4)], [event({}), receipt], [purchase("purchase-1", "GHS")], [line("line-1", "purchase-1", 2, 700)], snapshotAt);
    expect(result).toMatchObject({
      asOf: snapshotAt,
      currencyTotals: [{ currency: "GHS", amountMinor: 1400, productCount: 1 }],
      unknownCostProducts: 1,
      complete: false,
      products: [{ onHandQuantity: 4, unknownCostQuantity: 2, byCurrency: [{ currency: "GHS", quantity: 2, amountMinor: 1400 }], status: "partial" }],
    });
  });

  it("keeps different saved purchase currencies separate for the same product", () => {
    const first = event({ id: "receipt-ghs", sequence: 2, kind: "receipt", sourceId: "move-ghs", quantityDelta: 1, unitCostMinor: 700, purchaseId: "purchase-ghs" });
    const second = event({ id: "receipt-usd", sequence: 3, kind: "receipt", sourceId: "move-usd", createdAt: "2026-10-02T10:00:00.000Z", quantityDelta: 1, unitCostMinor: 800, purchaseId: "purchase-usd" });
    const result = reconcileInventoryValuation(company, [product(4)], [event({}), first, second], [purchase("purchase-ghs", "GHS", 700), purchase("purchase-usd", "USD", 800)], [line("line-ghs", "purchase-ghs", 1, 700), line("line-usd", "purchase-usd", 1, 800)], snapshotAt);
    expect(result.currencyTotals).toEqual([
      { currency: "GHS", amountMinor: 700, productCount: 1 },
      { currency: "USD", amountMinor: 800, productCount: 1 },
    ]);
    expect(result.products[0].byCurrency).toEqual([
      { currency: "GHS", quantity: 1, amountMinor: 700 },
      { currency: "USD", quantity: 1, amountMinor: 800 },
    ]);
    expect(result.products[0].unknownCostQuantity).toBe(2);
  });

  it("treats a purchase cost without a saved currency as unknown", () => {
    const receipt = event({ id: "receipt-1", sequence: 2, kind: "receipt", sourceId: "movement-1", quantityDelta: 2, unitCostMinor: 700, purchaseId: "purchase-1" });
    const result = reconcileInventoryValuation(company, [product(4)], [event({}), receipt], [purchase("purchase-1")], [line("line-1", "purchase-1", 2, 700)], snapshotAt);
    expect(result.currencyTotals).toEqual([]);
    expect(result.products[0]).toMatchObject({ unknownCostQuantity: 4, status: "unknown" });
  });

  it("rejects altered purchase-line provenance, stock mismatches, and unsafe totals", () => {
    const receipt = event({ id: "receipt-1", sequence: 2, kind: "receipt", sourceId: "movement-1", quantityDelta: 2, unitCostMinor: 700, purchaseId: "purchase-1" });
    expect(() => reconcileInventoryValuation(company, [product(4)], [event({}), receipt], [purchase("purchase-1", "GHS", 2100)], [line("line-1", "purchase-1", 3, 700)], snapshotAt)).toThrow(/purchase line/);
    expect(() => reconcileInventoryValuation(company, [product(5)], [event({}), receipt], [purchase("purchase-1", "GHS")], [line("line-1", "purchase-1", 2, 700)], snapshotAt)).toThrow(/quantity does not reconcile/);
    const hugeReceipt = event({ id: "receipt-big", sequence: 2, kind: "receipt", sourceId: "movement-big", quantityDelta: 2, unitCostMinor: Number.MAX_SAFE_INTEGER, purchaseId: "purchase-big" });
    expect(() => reconcileInventoryValuation(company, [product(4)], [event({}), hugeReceipt], [purchase("purchase-big", "GHS", Number.MAX_SAFE_INTEGER)], [line("line-big", "purchase-big", 2, Number.MAX_SAFE_INTEGER, undefined, Number.MAX_SAFE_INTEGER)], snapshotAt)).toThrow(/safe monetary precision/);
  });
});
