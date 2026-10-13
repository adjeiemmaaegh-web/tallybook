import { describe, expect, it } from "vitest";
import { getCustomerDebtSummary } from "@/features/credit/credit";
import { getInventorySnapshot } from "@/features/inventory/inventory";
import { executeLatestSaleReversal, prepareLatestSaleReversal } from "./reversals";
import { simulatePurchase, simulateRepayment } from "./dryRun";
import { useAssistantDb } from "./testKit";

describe("Phase 1 transaction simulation and reversal services", () => {
  const kit = useAssistantDb();

  it("previews and atomically reverses the latest sale without deleting its history", async () => {
    const before = await getInventorySnapshot(kit.database);
    const debtBefore = await getCustomerDebtSummary(kit.customers.adwoa.id, "GHS", kit.database);
    const preview = await prepareLatestSaleReversal("GHS", kit.database);
    expect(preview.receiptNumber).toBeTruthy();
    const reversal = await executeLatestSaleReversal("GHS", kit.database, "reversal-test-key");
    expect(await kit.database.sales.count()).toBe(1);
    expect(await kit.database.saleReversals.count()).toBe(1);
    const after = await getInventorySnapshot(kit.database);
    expect(after.products.find((product) => product.id === kit.products.rice.id)?.stockQuantity).toBe((before.products.find((product) => product.id === kit.products.rice.id)?.stockQuantity ?? 0) + 3);
    const debtAfter = await getCustomerDebtSummary(kit.customers.adwoa.id, "GHS", kit.database);
    expect(debtAfter.outstandingMinor).toBe(0);
    expect(debtAfter.outstandingMinor).toBeLessThan(debtBefore.outstandingMinor);
    expect(reversal.originalReceiptNumber).toBe(preview.receiptNumber);
    expect(await executeLatestSaleReversal("GHS", kit.database, "reversal-test-key")).toEqual(reversal);
    expect(await kit.database.saleReversals.count()).toBe(1);
  });

  it("restores duplicate historical sale lines exactly once per product", async () => {
    const sale = (await kit.database.sales.toArray())[0];
    const original = await kit.database.saleLines.where("saleId").equals(sale.id).first();
    expect(original).toBeDefined();
    const product = await kit.database.products.get(original!.productId);
    expect(product).toBeDefined();
    // Split one historical line into two lines for the same product without
    // changing the original sale quantity or stock already deducted.
    expect(original!.quantity).toBeGreaterThan(1);
    // This fixture represents pre-ledger history, which has no persisted cost links.
    const { costEventId, costStatus, cogsMinor, ...legacyLine } = original!;
    await kit.database.inventoryCostEvents.clear();
    await kit.database.saleLines.put({ ...legacyLine, quantity: 1 });
    await kit.database.saleLines.add({ ...legacyLine, id: `${original!.id}-split`, quantity: original!.quantity - 1 });
    const beforeMovements = await kit.database.inventoryMovements.where("productId").equals(product!.id).count();
    await executeLatestSaleReversal("GHS", kit.database, "split-line-reversal-key");
    const restored = await kit.database.products.get(product!.id);
    expect(restored!.stockQuantity).toBe(product!.stockQuantity + original!.quantity);
    const movements = await kit.database.inventoryMovements.where("productId").equals(product!.id).toArray();
    expect(movements.length).toBe(beforeMovements + 1);
    expect(movements.filter(movement => movement.movementType === "reversal").map(movement => movement.quantityDelta)).toEqual([original!.quantity]);
  });

  it("rejects duplicated cost links without partially restoring stock", async () => {
    const original = (await kit.database.saleLines.toArray())[0];
    const before = await kit.database.products.toArray();
    await kit.database.saleLines.add({ ...original, id: `${original.id}-tampered` });
    await expect(executeLatestSaleReversal("GHS", kit.database, "invalid-cost-link")).rejects.toThrow(/reconciliation/);
    expect(await kit.database.products.toArray()).toEqual(before);
    expect(await kit.database.saleReversals.count()).toBe(0);
  });

  it("simulates a purchase and repayment without writing records", async () => {
    const countsBefore = { purchases: await kit.database.purchases.count(), repayments: await kit.database.repayments.count() };
    const purchase = await simulatePurchase({ supplierText: "Kofi Traders", lines: [{ productText: "Eggs", quantity: 4, unitCost: "45" }] }, "GHS", kit.database);
    expect(purchase.totalMinor).toBe(18000);
    const repayment = await simulateRepayment({ customerText: "Adwoa Mensah", amount: "100" }, "GHS", kit.database);
    expect(repayment.resultingDebtMinor).toBeLessThan(repayment.currentDebtMinor);
    expect(await kit.database.purchases.count()).toBe(countsBefore.purchases);
    expect(await kit.database.repayments.count()).toBe(countsBefore.repayments);
  });
});
