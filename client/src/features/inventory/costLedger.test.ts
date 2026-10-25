import Dexie from "dexie";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TallybookDB, initializeDatabase } from "@/db/TallybookDB";
import { saveBusinessProfile } from "@/features/business/businessProfile";
import { clearCompanyData, setActiveBusinessProfileId } from "@/features/business/activeCompany";
import { completePurchase, createSupplier } from "@/features/purchases/purchases";
import { completeSale } from "@/features/sales/sales";
import { executeLatestSaleReversal } from "@/features/assistant/reversals";
import { createBackup, parseBackup, restoreBackup } from "@/features/backup/backup";
import { createProduct } from "./inventory";
import { registerBatch } from "./stage2Inventory";
import { getFinancialSummary } from "@/features/reports/financialIntelligence";
import { auditLocalIntegrity } from "@/features/reliability/integrity";
import { setSyncConsent, enqueueSyncEvent } from "@/features/sync/syncFoundation";
import { registerLocalSyncDevice } from "@/features/sync/deviceRegistry";
import { createStore } from "@/features/stores/storeDirectory";
import { getInsightFindings } from "@/features/insights/insightEvidence";
import { appendInventoryCostChange, reconstructInventoryCost, restorePartialInventoryCost } from "./costLedger";
import { createStaff, unlockStaff, openShift, lockStaff } from "@/features/staff/staff";
import { updateCompanyReturnPolicy } from "@/features/business/returnPolicySettings";

const dbs: TallybookDB[] = [];
const at = (stamp: string) => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(stamp)); };
async function atWithOwner(db: TallybookDB, stamp: string) {
  at(stamp);
  const owner = await db.staffMembers.where("businessProfileId").equals("primary").first();
  await unlockStaff(owner!.id, "123456", db);
}
async function setup(initialStock = "2", costPrice = "1") {
  at("2026-01-01T10:00:00.000Z");
  setActiveBusinessProfileId("primary");
  const db = new TallybookDB(`cost-ledger-${crypto.randomUUID()}`); dbs.push(db);
  await initializeDatabase(db);
  await saveBusinessProfile({ name: "Cost shop", country: "Ghana", currency: "GHS", businessType: "Retail" }, db);
  const owner = await createStaff("Cost test owner", "owner", "123456", db);
  await unlockStaff(owner.id, "123456", db);
  await openShift(0, db);
  await updateCompanyReturnPolicy({ enabled: true, allowFullReversal: true, allowCashPartial: true, maxAgeDays: 30 }, "Enable cost test returns", db);
  const product = await createProduct({ name: "Rice", categoryId: "uncategorized", sellingPrice: "10", costPrice, initialStock, lowStockThreshold: "1" }, "GHS", db);
  const supplier = await createSupplier({ name: "Supplier" }, db);
  return { db, product, supplier };
}
const checkout = (productId: string, quantity: number, key = crypto.randomUUID()) => ({ lines: [{ productId, quantity }], discount: "0", paymentMethod: "cash" as const, amountPaid: String(quantity * 10), currency: "GHS", submissionKey: key });
afterEach(async () => {
  lockStaff("primary");
  vi.useRealTimers(); vi.restoreAllMocks(); setActiveBusinessProfileId("primary");
  for (const db of dbs.splice(0)) { db.close(); await new Dexie(db.name).delete(); }
});

describe("persisted inventory cost history", () => {
  it("allocates FIFO receipts atomically, reconstructs earlier balances and restores the original costs", async () => {
    const { db, product, supplier } = await setup();
    await atWithOwner(db,"2026-01-02T10:00:00.000Z");
    await completePurchase({ supplierId: supplier.id, purchaseDate: "2026-01-02", lines: [{ productId: product.id, quantity: "3", unitCost: "2" }] }, "GHS", db);
    await atWithOwner(db,"2026-01-03T10:00:00.000Z");
    const saved = await completeSale(checkout(product.id, 4), db);
    expect(saved.sale).toMatchObject({ costStatus: "verified", cogsMinor: 600 });
    expect(saved.lines[0]).toMatchObject({ costStatus: "verified", cogsMinor: 600 });
    expect(await getFinancialSummary("month", new Date(), undefined, undefined, db)).toMatchObject({ revenueMinor: 4000, cogsMinor: 600, salesLessCostMinor: 3400, unavailable: { cogs: "", grossProfit: "" } });
    const events = await db.inventoryCostEvents.toArray();
    expect(reconstructInventoryCost(events, "primary", product.id, "2026-01-01T23:00:00Z")).toMatchObject({ quantity: 2, knownValueMinor: 200 });
    expect(reconstructInventoryCost(events, "primary", product.id)).toMatchObject({ quantity: 1, knownValueMinor: 200 });
    await atWithOwner(db,"2026-01-04T10:00:00.000Z");
    await executeLatestSaleReversal("GHS", db, "reverse-cost-sale");
    expect(await getFinancialSummary("today", new Date(), undefined, undefined, db)).toMatchObject({ revenueMinor: -4000, cogsMinor: -600, salesLessCostMinor: -3400 });
    expect(reconstructInventoryCost(await db.inventoryCostEvents.toArray(), "primary", product.id)).toMatchObject({ quantity: 5, knownValueMinor: 800 });
    await atWithOwner(db,"2026-01-05T10:00:00.000Z");
    const next = await completeSale(checkout(product.id, 1), db);
    expect(next.sale.cogsMinor).toBe(100);
  });
  it("restores original FIFO portions inside an inventory transaction without manufacturing a refund", async () => {
    const { db, product, supplier } = await setup();
    await atWithOwner(db,"2026-01-02T10:00:00.000Z");
    await completePurchase({ supplierId: supplier.id, purchaseDate: "2026-01-02", lines: [{ productId: product.id, quantity: "3", unitCost: "2" }] }, "GHS", db);
    await atWithOwner(db,"2026-01-03T10:00:00.000Z");
    const saved = await completeSale(checkout(product.id, 4), db);
    const issueId = saved.lines[0].costEventId!;
    const snapshot = await db.inventoryCostEvents.toArray();
    await atWithOwner(db,"2026-01-04T10:00:00.000Z");
    await db.transaction("rw", [db.products, db.inventoryCostEvents, db.inventoryMovements], async () => {
      const current = (await db.products.get(product.id))!;
      const now = new Date().toISOString();
      const movementId = "partial-cost-1";
      const event = await restorePartialInventoryCost(db, current, issueId, {sourceId:movementId,createdAt:now,saleId:saved.sale.id}, 1);
      expect(event.allocations).toEqual([{receiptId:snapshot.find(event => event.id === issueId)!.allocations![0].receiptId,quantity:1,unitCostMinor:100}]);
      await db.products.update(product.id, {stockQuantity: current.stockQuantity + 1});
      await db.inventoryMovements.add({id:movementId,businessProfileId:"primary",productId:product.id,movementType:"reversal",quantityDelta:1,previousQuantity:current.stockQuantity,resultingQuantity:current.stockQuantity+1,createdAt:now});
    });
    expect(reconstructInventoryCost(await db.inventoryCostEvents.toArray(),"primary",product.id)).toMatchObject({quantity:2,knownValueMinor:300});
    const updated = await db.products.get(product.id);
    await expect(db.transaction("rw",[db.products,db.inventoryCostEvents],async () => restorePartialInventoryCost(db,updated!,issueId,{sourceId:"over",createdAt:new Date().toISOString(),saleId:saved.sale.id}, 4))).rejects.toThrow(/exceeds/);
    expect(await db.inventoryCostEvents.count()).toBe(snapshot.length + 1);
    const beforeFailure = await db.inventoryCostEvents.toArray();
    const beforeStock = (await db.products.get(product.id))!.stockQuantity;
    vi.spyOn(db.inventoryMovements,"add").mockRejectedValueOnce(new Error("storage unavailable"));
    await expect(db.transaction("rw",[db.products,db.inventoryCostEvents,db.inventoryMovements],async () => {
      const current = (await db.products.get(product.id))!;
      await restorePartialInventoryCost(db,current,issueId,{sourceId:"partial-cost-failed",createdAt:new Date().toISOString(),saleId:saved.sale.id},1);
      await db.products.update(product.id,{stockQuantity:current.stockQuantity+1});
      await db.inventoryMovements.add({id:"partial-cost-failed",businessProfileId:"primary",productId:product.id,movementType:"reversal",quantityDelta:1,previousQuantity:current.stockQuantity,resultingQuantity:current.stockQuantity+1,createdAt:new Date().toISOString()});
    })).rejects.toThrow(/storage unavailable/);
    expect(await db.inventoryCostEvents.toArray()).toEqual(beforeFailure);
    expect((await db.products.get(product.id))!.stockQuantity).toBe(beforeStock);
    // Financial reports and backups should continue to fail closed until an
    // exact-linked, immutable partial-return financial posting is implemented.
    await expect(getFinancialSummary("today",new Date(),undefined,undefined,db)).rejects.toThrow(/no uniquely matched full or partial return evidence/);
  });
  it("never substitutes today's product cost for an unknown legacy opening", async () => {
    const { db, product } = await setup();
    await db.inventoryCostEvents.clear(); // A v25 balance, with no historic receipt evidence.
    await db.products.update(product.id, { costPriceMinor: 999999 });
    await atWithOwner(db,"2026-02-01T10:00:00.000Z");
    const saved = await completeSale(checkout(product.id, 1), db);
    expect(saved.sale.costStatus).toBe("unavailable");
    expect(saved.sale.cogsMinor).toBeUndefined();
    expect((await getFinancialSummary("month", new Date(), undefined, undefined, db)).cogsMinor).toBeUndefined();
    const events = await db.inventoryCostEvents.toArray();
    expect(events.find(e => e.kind === "legacy-opening")?.unitCostMinor).toBeUndefined();
    expect(reconstructInventoryCost(events, "primary", product.id)).toMatchObject({ quantity: 1, unknownCostUnits: 1 });
    expect(reconstructInventoryCost(events, "primary", product.id, "2026-01-15T00:00:00Z").historyAvailable).toBe(false);
  });
  it("rolls allocations, sale records and stock back together after a late receipt-write failure", async () => {
    const { db, product } = await setup();
    const initial = await db.inventoryCostEvents.toArray();
    vi.spyOn(db.receipts, "add").mockRejectedValueOnce(new Error("disk full"));
    await expect(completeSale(checkout(product.id, 1), db)).rejects.toThrow("disk full");
    expect(await db.inventoryCostEvents.toArray()).toEqual(initial);
    expect(await db.sales.count()).toBe(0);
    expect(await db.saleLines.count()).toBe(0);
    expect((await db.products.get(product.id))?.stockQuantity).toBe(2);
  });
  it("allows one of two competing full-stock checkouts and records exactly one cost allocation", async () => {
    const { db, product } = await setup();
    const results = await Promise.allSettled([completeSale(checkout(product.id, 2), db), completeSale(checkout(product.id, 2), db)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(await db.sales.count()).toBe(1);
    expect(await db.inventoryCostEvents.count()).toBe(2);
    expect((await db.products.get(product.id))?.stockQuantity).toBe(0);
  });
  it("retries a checkout without consuming cost layers twice and rejects a changed intent", async () => {
    const { db, product } = await setup();
    const input = checkout(product.id, 1, "cost-idempotency-key");
    const first = await completeSale(input, db);
    expect((await completeSale(input, db)).sale).toEqual(first.sale);
    await expect(completeSale({ ...input, lines: [{ productId: product.id, quantity: 2 }], amountPaid: "20" }, db)).rejects.toThrow(/different details/);
    expect(await db.inventoryCostEvents.count()).toBe(2);
  });
  it("rejects another company's inventory at both checkout and replay boundaries", async () => {
    const { db, product } = await setup();
    const events = await db.inventoryCostEvents.toArray();
    expect(() => reconstructInventoryCost(events, "other", product.id)).toThrow(/another company/);
    setActiveBusinessProfileId("other");
    await expect(completeSale(checkout(product.id, 1), db)).rejects.toThrow(/no longer available/);
    expect(await db.inventoryCostEvents.toArray()).toEqual(events);
  });
  it("includes immutable cost events in backup and rejects altered costs before restore", async () => {
    const { db, product } = await setup();
    await completeSale(checkout(product.id, 1), db);
    const backup = parseBackup(JSON.stringify(await createBackup(db)));
    expect(backup.records.inventoryCostEvents).toHaveLength(2);
    const bad = structuredClone(backup);
    bad.records.inventoryCostEvents.find(e => e.kind === "issue")!.allocations[0].unitCostMinor = 5;
    expect(() => parseBackup(JSON.stringify(bad))).toThrow(/allocation/);
    const wrongSource = structuredClone(backup);
    wrongSource.records.inventoryCostEvents.find(e => e.kind === "issue")!.sourceId = "missing-movement";
    expect(() => parseBackup(JSON.stringify(wrongSource))).toThrow(/stock movement/);
    await restoreBackup(backup, db);
    expect(await db.inventoryCostEvents.toArray()).toEqual(backup.records.inventoryCostEvents);
    expect((await db.products.get(product.id))?.stockQuantity).toBe(1);
  });
  it("restores batch quantities as well as FIFO accounting layers on reversal", async () => {
    const { db, product } = await setup("4");
    const batch = await registerBatch(product.id, "LOT-1", 4, "2027-01-01", db);
    const saved = await completeSale(checkout(product.id, 2), db);
    expect(saved.lines[0].batchAllocations).toEqual([{ batchId: batch.id, quantity: 2 }]);
    expect((await db.inventoryBatches.get(batch.id))?.quantity).toBe(2);
    await executeLatestSaleReversal("GHS", db, "batch-reversal-key");
    expect((await db.inventoryBatches.get(batch.id))?.quantity).toBe(4);
    expect((await db.products.get(product.id))?.stockQuantity).toBe(4);
  });
  it("receives batch cost evidence, allocates physical stock by expiry, keeps accounting FIFO independent, and restores both on reversal", async () => {
    const { db, product, supplier } = await setup("4", "1");
    await registerBatch(product.id, "LATER-LOT", 4, "2027-02-01", db);
    await atWithOwner(db,"2026-01-02T10:00:00.000Z");
    const purchase = await completePurchase({ supplierId: supplier.id, purchaseDate: "2026-01-02", submissionKey: "expiry-cost-purchase", lines: [{ productId: product.id, quantity: "3", unitCost: "5", batchCode: "EARLIER-EXPIRY", expiryDate: "2026-02-01" }] }, "GHS", db);
    const receiptLine = (await db.purchaseLines.where("purchaseId").equals(purchase.id).toArray())[0];
    const batch = await db.inventoryBatches.get(receiptLine.batchId!);
    await atWithOwner(db,"2026-01-03T10:00:00.000Z");
    const sale = await completeSale(checkout(product.id, 2), db);

    expect(sale.lines[0].batchAllocations).toEqual([{ batchId: batch?.id, quantity: 2 }]);
    expect(sale.lines[0].cogsMinor).toBe(200); // Accounting FIFO uses the earlier $1 opening layer, not the expiry-picked $5 lot.
    expect((await db.inventoryBatches.get(batch!.id))?.quantity).toBe(1);
    const backup = parseBackup(JSON.stringify(await createBackup(db)));
    expect(backup.records.purchaseLines.find(line => line.id === receiptLine.id)).toMatchObject({ batchId: batch!.id, batchCode: "EARLIER-EXPIRY" });
    const altered = structuredClone(backup);
    altered.records.inventoryBatches.find(row => row.id === batch!.id)!.receiptCostEventId = "missing-cost-event";
    expect(() => parseBackup(JSON.stringify(altered))).toThrow(/Batch receipt.*do not reconcile/);

    await atWithOwner(db,"2026-01-04T10:00:00.000Z");
    await executeLatestSaleReversal("GHS", db, "expiry-cost-reversal");
    expect((await db.inventoryBatches.get(batch!.id))?.quantity).toBe(3);
    expect((await db.products.get(product.id))?.stockQuantity).toBe(7);
    expect(reconstructInventoryCost(await db.inventoryCostEvents.toArray(), "primary", product.id)).toMatchObject({ quantity: 7, knownValueMinor: 1900 });
  });
  it("audits cost-linked batch receipts and detects quantity tampering without changing records", async () => {
    const { db, product, supplier } = await setup("2", "1");
    await registerBatch(product.id, "OPENING-LOT", 2, undefined, db);
    const purchase = await completePurchase({ supplierId: supplier.id, purchaseDate: "2026-01-01", submissionKey: "batch-audit-purchase", lines: [{ productId: product.id, quantity: "3", unitCost: "2", batchCode: "RECEIVED-LOT" }] }, "GHS", db);
    const batch = await db.inventoryBatches.where("productId").equals(product.id).and(row => row.batchCode === "RECEIVED-LOT").first();
    const before = await db.inventoryBatches.toArray();

    expect(await auditLocalIntegrity(db)).toMatchObject({ status: "clear", issues: [] });
    await db.inventoryBatches.update(batch!.id, { quantity: 99 });
    const audit = await auditLocalIntegrity(db);
    expect(audit.issues.some(item => item.code === "inventory-batch-integrity" && item.recordId === batch!.id)).toBe(true);
    expect(audit.issues.some(item => item.code === "inventory-batch-allocation" && item.recordId === product.id)).toBe(true);
    expect(await db.purchases.get(purchase.id)).toBeDefined();
    expect(before.find(row => row.id === batch!.id)?.quantity).toBe(3);
  });
  it("grounds expiry and unit-sales insights in company-scoped live records", async () => {
    const { db, product } = await setup("4");
    await registerBatch(product.id, "EXPIRING", 4, "2026-01-04", db);
    await completeSale(checkout(product.id, 2), db);
    await db.inventoryBatches.put({ id: "foreign-batch", businessProfileId: "foreign", productId: product.id, batchCode: "FOREIGN", quantity: 100, expiryDate: "2026-01-01", createdAt: new Date().toISOString() });
    const findings = await getInsightFindings("today", new Date(), db);
    expect(findings.some(row => row.kind === "expiry" && row.evidence.includes("2 recorded units"))).toBe(true);
    expect(findings.some(row => row.id === `units:${product.id}` && row.evidence.includes("2 base units"))).toBe(true);
    expect(findings.some(row => row.evidence.includes("foreign-batch"))).toBe(false);
    await executeLatestSaleReversal("GHS", db, "insight-reversal");
    expect((await getInsightFindings("today", new Date(), db)).some(row => row.id === `units:${product.id}`)).toBe(false);
  });
  it("rejects posting outside the atomic stock transaction", async () => {
    const { db, product } = await setup();
    await expect(appendInventoryCostChange(db, product, 1, { sourceId: "orphan", createdAt: new Date().toISOString() })).rejects.toThrow(/stock transaction/);
    expect(await db.inventoryCostEvents.count()).toBe(1);
  });
  it("restores store and outbox records while requiring fresh consent to synchronize", async () => {
    const { db } = await setup();
    const store = await createStore("Accra", db);
    await setSyncConsent(db, "primary", true);
    const device = await registerLocalSyncDevice(db, "primary", "fixture-device", "Till");
    await enqueueSyncEvent(db, { id: "fixture-event", businessProfileId: "primary", deviceId: device.id, operationId: "fixture-operation", entityType: "sale", entityId: "fixture-sale", payloadDigest: "a".repeat(64), createdAt: new Date().toISOString(), status: "pending" });
    const backup = parseBackup(JSON.stringify(await createBackup(db)));
    expect(backup.records.storeLocations).toEqual([store]);
    expect(backup.records.syncOutbox).toHaveLength(1);
    await db.storeLocations.clear(); await db.syncOutbox.clear(); await db.syncDevices.clear();
    await restoreBackup(backup, db);
    expect(await db.storeLocations.toArray()).toEqual([store]);
    expect(await db.syncOutbox.toArray()).toEqual(backup.records.syncOutbox);
    expect((await db.syncConsents.get("primary"))?.enabled).toBe(false);
  });
  it("detects tampered persisted COGS independently from receipt evidence", async () => {
    const { db, product } = await setup();
    const saved = await completeSale(checkout(product.id, 1), db);
    await db.sales.update(saved.sale.id, { cogsMinor: 99 });
    await expect(getFinancialSummary("month", new Date(), undefined, undefined, db)).rejects.toThrow(/receipt evidence/);
  });
  it("deletes only the selected company's cost, store, commerce and sync records", async () => {
    const { db } = await setup();
    await db.syncConsents.put({ businessProfileId: "primary", enabled: false, updatedAt: new Date().toISOString() } as never);
    await db.commerceOrders.put({ id: "local", businessProfileId: "primary" } as never);
    await db.commerceOrders.put({ id: "foreign", businessProfileId: "other" } as never);
    await clearCompanyData("primary", db);
    expect(await db.inventoryCostEvents.count()).toBe(0);
    expect(await db.syncConsents.count()).toBe(0);
    expect((await db.commerceOrders.toArray()).map(order => order.id)).toEqual(["foreign"]);
  });
});
