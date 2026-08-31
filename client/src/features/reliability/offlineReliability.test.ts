/** Stage 8: local records must survive close/reopen and migrations; failed writes must leave no partial ledger state. */
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { DATABASE_SCHEMA_VERSION, TallybookDB, initializeDatabase } from "@/db/TallybookDB";
import { saveBusinessProfile } from "@/features/business/businessProfile";
import { createCustomer } from "@/features/customers/customers";
import { getCustomerDebtSummary, recordRepayment } from "@/features/credit/credit";
import { createProduct, getInventorySnapshot } from "@/features/inventory/inventory";
import { addMobileMoneyProvider } from "@/features/payments/mobileMoney";
import { getDashboardSummary, getReportsSnapshot } from "@/features/reports/reports";
import { completeSale } from "@/features/sales/sales";

const names = new Set<string>();
const openDatabases: Dexie[] = [];
let sequence = 0;
function database(name = `tallybook-offline-test-${Date.now()}-${++sequence}`) { names.add(name); const result = new TallybookDB(name); openDatabases.push(result); return result; }
async function productFixture(db: TallybookDB, name: string, stock = "3", price = "10.00") { return createProduct({ name, sku: "", categoryId: "uncategorized", sellingPrice: price, costPrice: "", initialStock: stock, lowStockThreshold: "1" }, "GHS", db); }
afterEach(async () => { openDatabases.splice(0).forEach((database) => database.close()); await Promise.all([...names].map((name) => new Dexie(name).delete())); names.clear(); });

describe("Stage 8 offline reliability", () => {
  it("preserves business, product, customer, sale, receipt, repayment, dashboard, and reports after a local close/reopen", async () => {
    const name = `tallybook-offline-reopen-${Date.now()}-${++sequence}`;
    const first = database(name);
    await initializeDatabase(first);
    await saveBusinessProfile({ name: "Offline Shop", country: "Ghana", currency: "GHS", businessType: "Retail shop", phone: "", email: "", address: "" }, first);
    const product = await productFixture(first, "Offline soap");
    const customer = await createCustomer({ name: "Offline Customer", phone: "+233 20 111 9000", email: "", address: "", notes: "", status: "active" }, first);
    const provider = await addMobileMoneyProvider({ name: "Offline MoMo" }, first);
    const sale = await completeSale({ lines: [{ productId: product.id, quantity: 1 }], customerId: customer.id, discount: "0", paymentMethod: "mobile", amountPaid: "4.00", currency: "GHS", mobileMoneyProviderId: provider.id, submissionKey: "offline-reopen-sale" }, first);
    await recordRepayment({ customerId: customer.id, amount: "3.00", method: "cash", currency: "GHS", submissionKey: "offline-reopen-repayment" }, first);
    first.close();
    const reopened = database(name);
    const readiness = await initializeDatabase(reopened);
    const [inventory, debt, dashboard, reports] = await Promise.all([getInventorySnapshot(reopened), getCustomerDebtSummary(customer.id, "GHS", reopened), getDashboardSummary(new Date(), reopened), getReportsSnapshot("all", new Date(), reopened)]);

    expect(readiness.schemaVersion).toBe(DATABASE_SCHEMA_VERSION);
    expect((await reopened.businessProfiles.get("primary"))?.name).toBe("Offline Shop");
    expect(inventory.products.find((entry) => entry.id === product.id)?.stockQuantity).toBe(2);
    expect(await reopened.receipts.where("saleId").equals(sale.sale.id).count()).toBe(1);
    expect(debt.outstandingMinor).toBe(300);
    expect(dashboard.outstandingDebtMinor).toBe(300);
    expect(reports.totals).toMatchObject({ salesMinor: 1000, receivedMinor: 700, outstandingDebtMinor: 300, transactionCount: 1 });
  });

  it("upgrades a version-6 ledger without removing its existing owner records and safely heals invalid schema metadata", async () => {
    const name = `tallybook-offline-v6-${Date.now()}-${++sequence}`;
    names.add(name);
    const legacy = new Dexie(name);
    legacy.version(6).stores({ appMeta: "key, updatedAt", businessProfiles: "id, name, country, currency, businessType, updatedAt", categories: "id, businessProfileId, name, normalizedName, archivedAt, updatedAt", products: "id, businessProfileId, name, normalizedName, sku, categoryId, archivedAt, lowStockThreshold, updatedAt", inventoryMovements: "id, businessProfileId, productId, createdAt, movementType, resultingQuantity", customers: "id, businessProfileId, name, normalizedName, phone, status, archivedAt, updatedAt", sales: "id, businessProfileId, customerId, receiptNumber, createdAt, outstandingMinor, paymentMethod, &submissionKey", saleLines: "id, saleId, productId", payments: "id, saleId, customerId, createdAt, method", receipts: "id, saleId, receiptNumber, issuedAt", customerActivities: "id, customerId, saleId, createdAt, activityType" });
    await legacy.open();
    await legacy.table("appMeta").put({ key: "databaseCreatedAt", value: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" });
    await legacy.table("appMeta").put({ key: "schemaVersion", value: "invalid", updatedAt: "2026-01-01T00:00:00.000Z" });
    await legacy.table("businessProfiles").put({ id: "primary", name: "Legacy Offline Shop", country: "Ghana", currency: "GHS", businessType: "Retail shop", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" });
    legacy.close();
    const upgraded = database(name);
    await initializeDatabase(upgraded);

    expect((await upgraded.businessProfiles.get("primary"))?.name).toBe("Legacy Offline Shop");
    expect((await upgraded.appMeta.get("databaseCreatedAt"))?.value).toBe("2026-01-01T00:00:00.000Z");
    expect((await upgraded.appMeta.get("schemaVersion"))?.value).toBe(String(DATABASE_SCHEMA_VERSION));
    expect(await upgraded.repayments.count()).toBe(0);
  });

  it("leaves no partial sale, payment, receipt, or stock change after an offline local validation failure and a reopen", async () => {
    const db = database();
    await initializeDatabase(db);
    const product = await productFixture(db, "Failure-safe item", "1");
    await expect(completeSale({ lines: [{ productId: product.id, quantity: 2 }], discount: "0", paymentMethod: "cash", amountPaid: "20.00", currency: "GHS", submissionKey: "offline-failure-sale" }, db)).rejects.toThrow("only 1 units available");
    db.close();
    const reopened = database(db.name);
    await initializeDatabase(reopened);

    expect(await reopened.sales.count()).toBe(0);
    expect(await reopened.payments.count()).toBe(0);
    expect(await reopened.receipts.count()).toBe(0);
    expect((await reopened.products.get(product.id))?.stockQuantity).toBe(1);
  });
});
