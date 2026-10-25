import Dexie from "dexie";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DATABASE_SCHEMA_VERSION, TallybookDB, initializeDatabase } from "@/db/TallybookDB";
import { createProduct } from "@/features/inventory/inventory";
import { registerBatch } from "@/features/inventory/stage2Inventory";
import { archiveSupplier, completePurchase, createSupplier, getPurchasesSnapshot, updateSupplier } from "@/features/purchases/purchases";
import { recognizeUnpaidPurchase, recordSupplierSettlement } from "@/features/purchases/supplierPayables.ts";

const names = new Set<string>(); const databases: Dexie[] = []; let sequence = 0;
function makeDatabase() { const database = new TallybookDB(`tallybook-purchases-test-${Date.now()}-${++sequence}`); names.add(database.name); databases.push(database); return database; }
afterEach(async () => { vi.restoreAllMocks(); databases.splice(0).forEach((database) => database.close()); await Promise.all([...names].map(async (name) => { const cleanup = new Dexie(name); await cleanup.delete(); })); names.clear(); });

async function fixture(database: TallybookDB) {
  await initializeDatabase(database);
  const [rice, oil] = await Promise.all([
    createProduct({ name: "Stage 7 Rice", sku: "S7-RICE", categoryId: "uncategorized", sellingPrice: "25", costPrice: "15", initialStock: "3", lowStockThreshold: "1" }, "GHS", database),
    createProduct({ name: "Stage 7 Oil", sku: "S7-OIL", categoryId: "uncategorized", sellingPrice: "12", costPrice: "7", initialStock: "2", lowStockThreshold: "1" }, "GHS", database),
  ]);
  const supplier = await createSupplier({ name: "ABC Wholesale", phone: "0200000000", email: "", address: "", notes: "" }, database);
  return { rice, oil, supplier };
}

describe("Stage 7 local suppliers and purchases", () => {
  it("adds a completed multi-line purchase, stock increases, and traceable purchase movements exactly once", async () => {
    const database = makeDatabase(); const { rice, oil, supplier } = await fixture(database);
    const values = { supplierId: supplier.id, purchaseDate: "2026-08-27", note: "Morning delivery", submissionKey: "stage7-purchase-key", lines: [{ productId: rice.id, quantity: "4", unitCost: "14.50" }, { productId: oil.id, quantity: "5", unitCost: "6.00" }] };
    const first = await completePurchase(values, "GHS", database); const repeated = await completePurchase(values, "GHS", database);
    const [currentRice, currentOil, snapshot, movements] = await Promise.all([database.products.get(rice.id), database.products.get(oil.id), getPurchasesSnapshot(database), database.inventoryMovements.where("purchaseId").equals(first.id).toArray()]);

    expect(repeated.id).toBe(first.id);
    expect(first).toMatchObject({ supplierId: supplier.id, supplierName: "ABC Wholesale", totalCostMinor: 8800, purchaseDate: "2026-08-27" });
    expect(currentRice?.stockQuantity).toBe(7); expect(currentOil?.stockQuantity).toBe(7);
    expect(snapshot.purchases).toHaveLength(1); expect(snapshot.purchases[0].lines).toEqual(expect.arrayContaining([expect.objectContaining({ productName: "Stage 7 Rice", quantity: 4, unitCostMinor: 1450, lineTotalMinor: 5800 }), expect.objectContaining({ productName: "Stage 7 Oil", quantity: 5, unitCostMinor: 600, lineTotalMinor: 3000 })]));
    expect(movements).toEqual(expect.arrayContaining([expect.objectContaining({ productId: rice.id, purchaseId: first.id, movementType: "purchase", quantityDelta: 4, previousQuantity: 3, resultingQuantity: 7, note: "Purchase from ABC Wholesale" }), expect.objectContaining({ productId: oil.id, purchaseId: first.id, movementType: "purchase", quantityDelta: 5, previousQuantity: 2, resultingQuantity: 7 })]));
  });

  it("records a batch purchase, its base-unit FIFO cost and batch expiry atomically and idempotently", async () => {
    const database = makeDatabase(); const { rice, supplier } = await fixture(database);
    await registerBatch(rice.id, "OPENING-LOT", 3, "2027-02-01", database);
    const values = { supplierId: supplier.id, purchaseDate: "2026-08-27", note: "New expiry lot", submissionKey: "batch-receipt-key-01", lines: [{ productId: rice.id, quantity: "2", unitCost: "14.50", batchCode: "LOT-NEW", expiryDate: "2027-03-01" }] };

    const first = await completePurchase(values, "GHS", database); const repeated = await completePurchase(values, "GHS", database);
    const line = (await database.purchaseLines.where("purchaseId").equals(first.id).toArray())[0];
    const batch = await database.inventoryBatches.get(line.batchId!);
    const event = (await database.inventoryCostEvents.where("purchaseId").equals(first.id).toArray())[0];

    expect(repeated.id).toBe(first.id);
    expect((await database.products.get(rice.id))?.stockQuantity).toBe(5);
    expect(line).toMatchObject({ quantity: 2, unitCostMinor: 1450, batchCode: "LOT-NEW", expiryDate: "2027-03-01", batchId: expect.any(String) });
    expect(batch).toMatchObject({ productId: rice.id, batchCode: "LOT-NEW", expiryDate: "2027-03-01", quantity: 2, startingQuantity: 2, receiptCostEventId: event.id });
    expect(event).toMatchObject({ kind: "receipt", purchaseId: first.id, batchId: batch?.id, quantityDelta: 2, unitCostMinor: 1450 });
    expect(await database.inventoryBatches.where("productId").equals(rice.id).count()).toBe(2);
    expect(await database.purchaseLines.where("purchaseId").equals(first.id).count()).toBe(1);
  });

  it("refuses to start expiry tracking on untracked on-hand stock or append to a partially tracked balance", async () => {
    const database = makeDatabase(); const { rice, supplier } = await fixture(database);
    const values = { supplierId: supplier.id, purchaseDate: "2026-08-27", note: "", submissionKey: "batch-start-refused", lines: [{ productId: rice.id, quantity: "2", unitCost: "10", batchCode: "NEW-LOT", expiryDate: "2027-01-01" }] };
    await expect(completePurchase(values, "GHS", database)).rejects.toThrow("has no batch record");
    expect(await database.purchases.count()).toBe(0);
    expect((await database.products.get(rice.id))?.stockQuantity).toBe(3);

    await registerBatch(rice.id, "PARTIAL-LOT", 1, undefined, database);
    await expect(completePurchase({ ...values, submissionKey: "batch-partial-refused" }, "GHS", database)).rejects.toThrow("do not match on-hand stock");
    expect(await database.purchases.count()).toBe(0);
  });

  it("rolls back purchase, cost event, movement, product and batch writes when batch persistence fails", async () => {
    const database = makeDatabase(); const { rice, supplier } = await fixture(database);
    await registerBatch(rice.id, "OPENING-LOT", 3, undefined, database);
    const bulkAdd = vi.spyOn(database.inventoryBatches, "bulkAdd").mockRejectedValueOnce(new Error("Simulated batch write failure"));
    await expect(completePurchase({ supplierId: supplier.id, purchaseDate: "2026-08-27", note: "", submissionKey: "batch-write-rollback", lines: [{ productId: rice.id, quantity: "2", unitCost: "10", batchCode: "NEW-LOT" }] }, "GHS", database)).rejects.toThrow("Simulated batch write failure");
    bulkAdd.mockRestore();
    expect((await database.products.get(rice.id))?.stockQuantity).toBe(3);
    expect(await database.purchases.count()).toBe(0);
    expect(await database.purchaseLines.count()).toBe(0);
    expect((await database.inventoryMovements.where("productId").equals(rice.id).toArray()).filter(movement => movement.movementType === "purchase")).toHaveLength(0);
    expect((await database.inventoryCostEvents.where("productId").equals(rice.id).toArray()).filter(event => event.batchId)).toHaveLength(0);
    expect(await database.inventoryBatches.count()).toBe(1);
  });

  it("rejects changed purchase details under an existing submission key without adjusting stock", async () => {
    const database = makeDatabase(); const { rice, supplier } = await fixture(database);
    const original = { supplierId: supplier.id, purchaseDate: "2026-08-27", note: "", submissionKey: "purchase-idempotency-guard", lines: [{ productId: rice.id, quantity: "2", unitCost: "10" }] };
    await completePurchase(original, "GHS", database);
    await expect(completePurchase({ ...original, lines: [{ ...original.lines[0], quantity: "3" }] }, "GHS", database)).rejects.toThrow("reused for different details");
    expect((await database.products.get(rice.id))?.stockQuantity).toBe(5);
    expect(await database.purchases.count()).toBe(1);
  });

  it("keeps the original supplier snapshot when a supplier is renamed or archived", async () => {
    const database = makeDatabase(); const { rice, supplier } = await fixture(database);
    const purchase = await completePurchase({ supplierId: supplier.id, purchaseDate: "2026-08-27", note: "", submissionKey: "stage7-snapshot-key", lines: [{ productId: rice.id, quantity: "1", unitCost: "10" }] }, "GHS", database);
    await updateSupplier(supplier.id, { name: "ABC Electronics Ltd", phone: "", email: "", address: "", notes: "" }, database);
    await expect(archiveSupplier(supplier.id, database)).rejects.toThrow(/unpaid or unverified/);
    await recognizeUnpaidPurchase(purchase.id, "stage7-recognize-snapshot", database);
    await recordSupplierSettlement({ purchaseId: purchase.id, kind: "payment", amountMinor: 1000, method: "cash", submissionKey: "stage7-settle-snapshot" }, database);
    await archiveSupplier(supplier.id, database);
    const snapshot = await getPurchasesSnapshot(database);
    expect(snapshot.suppliers).toHaveLength(0); expect(snapshot.archivedSuppliers).toMatchObject([{ name: "ABC Electronics Ltd" }]); expect(snapshot.purchases[0]).toMatchObject({ supplierName: "ABC Wholesale" });
  });

  it("rejects duplicate product lines and rolls back every purchase record and stock increase after a failed write", async () => {
    const database = makeDatabase(); const { rice, supplier } = await fixture(database);
    await expect(completePurchase({ supplierId: supplier.id, purchaseDate: "2026-08-27", note: "", lines: [{ productId: rice.id, quantity: "1", unitCost: "10" }, { productId: rice.id, quantity: "2", unitCost: "10" }] }, "GHS", database)).rejects.toThrow("only once");
    const bulkAdd = vi.spyOn(database.inventoryMovements, "bulkAdd").mockRejectedValueOnce(new Error("Simulated movement write failure"));
    await expect(completePurchase({ supplierId: supplier.id, purchaseDate: "2026-08-27", note: "", submissionKey: "stage7-failed-key", lines: [{ productId: rice.id, quantity: "2", unitCost: "10" }] }, "GHS", database)).rejects.toThrow("Simulated movement write failure");
    bulkAdd.mockRestore();
    expect((await database.products.get(rice.id))?.stockQuantity).toBe(3); expect(await database.purchases.count()).toBe(0); expect(await database.purchaseLines.count()).toBe(0); expect((await database.inventoryMovements.where("productId").equals(rice.id).toArray()).filter((movement) => movement.movementType === "purchase")).toHaveLength(0);
  });

  it("prevents active normalized supplier duplicates", async () => {
    const database = makeDatabase(); await initializeDatabase(database); await createSupplier({ name: "Ama Supply", phone: "", email: "", address: "", notes: "" }, database);
    await expect(createSupplier({ name: "  ama   supply ", phone: "", email: "", address: "", notes: "" }, database)).rejects.toThrow("already exists");
  });

  it("serializes simultaneous normalized supplier submissions without writing duplicates", async () => {
    const database = makeDatabase(); await initializeDatabase(database);
    const form = { name: "Concurrent Supplier", phone: "", email: "", address: "", notes: "" };
    const outcomes = await Promise.allSettled([
      createSupplier(form, database),
      createSupplier({ ...form, name: "  concurrent   supplier " }, database),
    ]);
    expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(result => result.status === "rejected")).toHaveLength(1);
    expect((await database.suppliers.toArray()).filter(item => !item.archivedAt)).toHaveLength(1);
  });

  it("opens version 8 local records under current schema without rewriting existing sales, payments, receipts, provider data, or movements", async () => {
    const name = `tallybook-stage7-v8-${Date.now()}-${++sequence}`; names.add(name); const legacy = new Dexie(name); databases.push(legacy);
    legacy.version(8).stores({ appMeta: "key, updatedAt", businessProfiles: "id, name, country, currency, businessType, updatedAt", categories: "id, businessProfileId, name, normalizedName, archivedAt, updatedAt", products: "id, businessProfileId, name, normalizedName, sku, categoryId, archivedAt, lowStockThreshold, updatedAt", inventoryMovements: "id, businessProfileId, productId, createdAt, movementType, resultingQuantity", customers: "id, businessProfileId, name, normalizedName, phone, status, archivedAt, updatedAt", sales: "id, businessProfileId, customerId, receiptNumber, createdAt, outstandingMinor, paymentMethod, &submissionKey", saleLines: "id, saleId, productId", payments: "id, saleId, customerId, createdAt, method", receipts: "id, saleId, receiptNumber, issuedAt", customerActivities: "id, customerId, saleId, createdAt, activityType", repayments: "id, businessProfileId, customerId, createdAt, method, &submissionKey", mobileMoneyProviders: "id, businessProfileId, normalizedName, updatedAt" });
    await legacy.open(); const date = "2026-08-26T10:00:00.000Z";
    await Promise.all([legacy.table("businessProfiles").put({ id: "primary", name: "Version 8 Shop", country: "Ghana", currency: "GHS", businessType: "Retail", createdAt: date, updatedAt: date }), legacy.table("products").put({ id: "v8-product", businessProfileId: "primary", name: "Version 8 Soap", normalizedName: "version 8 soap", sellingPriceMinor: 1000, stockQuantity: 4, lowStockThreshold: 1, createdAt: date, updatedAt: date }), legacy.table("inventoryMovements").put({ id: "v8-movement", businessProfileId: "primary", productId: "v8-product", movementType: "sale", quantityDelta: -1, previousQuantity: 5, resultingQuantity: 4, createdAt: date }), legacy.table("sales").put({ id: "v8-sale", businessProfileId: "primary", receiptNumber: "V8-001", status: "completed", subtotalMinor: 1000, discountMinor: 0, totalMinor: 1000, amountPaidMinor: 1000, outstandingMinor: 0, paymentMethod: "mobile", submissionKey: "v8-sale-key", createdAt: date }), legacy.table("payments").put({ id: "v8-payment", saleId: "v8-sale", method: "mobile", amountMinor: 1000, mobileMoneyProviderName: "Legacy MoMo", mobileMoneyReference: "V8-REF", createdAt: date }), legacy.table("receipts").put({ id: "v8-receipt", saleId: "v8-sale", receiptNumber: "V8-001", issuedAt: date }), legacy.table("mobileMoneyProviders").put({ id: "v8-provider", businessProfileId: "primary", name: "Legacy MoMo", normalizedName: "legacy momo", active: true, createdAt: date, updatedAt: date })]); legacy.close();
    const upgraded = new TallybookDB(name); databases.push(upgraded); await initializeDatabase(upgraded);
    expect(upgraded.verno).toBe(DATABASE_SCHEMA_VERSION); expect(await upgraded.businessProfiles.get("primary")).toMatchObject({ name: "Version 8 Shop" }); expect(await upgraded.sales.get("v8-sale")).toMatchObject({ paymentMethod: "mobile", totalMinor: 1000 }); expect(await upgraded.payments.get("v8-payment")).toMatchObject({ mobileMoneyProviderName: "Legacy MoMo", mobileMoneyReference: "V8-REF" }); expect(await upgraded.receipts.get("v8-receipt")).toMatchObject({ receiptNumber: "V8-001" }); expect(await upgraded.inventoryMovements.get("v8-movement")).toMatchObject({ movementType: "sale", resultingQuantity: 4 }); expect(await upgraded.suppliers.count()).toBe(0); expect(await upgraded.purchases.count()).toBe(0); expect(await upgraded.purchaseLines.count()).toBe(0); expect(await upgraded.expenses.count()).toBe(0); expect(await upgraded.saleReversals.count()).toBe(0);
  });
});
