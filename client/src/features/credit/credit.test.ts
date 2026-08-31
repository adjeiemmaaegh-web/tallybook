/** Tactile Ledger testing reminder: an amount owed is derived from saved credit sales minus immutable repayments; it is never an editable total. */
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { DATABASE_SCHEMA_VERSION, TallybookDB, initializeDatabase } from "@/db/TallybookDB";
import { createCustomer } from "@/features/customers/customers";
import { getCustomerDebtSummary, recordRepayment } from "@/features/credit/credit";
import { createProduct } from "@/features/inventory/inventory";
import { completeSale } from "@/features/sales/sales";

const names = new Set<string>();
const databases: Dexie[] = [];
let sequence = 0;

function makeDatabase() {
  const database = new TallybookDB(`tallybook-credit-test-${Date.now()}-${++sequence}`);
  names.add(database.name);
  databases.push(database);
  return database;
}

async function creditSale(database: TallybookDB, customerName = "Credit Customer") {
  await initializeDatabase(database);
  const customer = await createCustomer({ name: customerName, phone: `+233 20 555 ${String(sequence).padStart(4, "0")}`, email: "", address: "", notes: "", status: "active" }, database);
  const product = await createProduct({ name: `Credit item for ${customerName}`, sku: "", categoryId: "uncategorized", sellingPrice: "20.00", costPrice: "", initialStock: "5", lowStockThreshold: "1" }, "GHS", database);
  const sale = await completeSale({ lines: [{ productId: product.id, quantity: 1 }], customerId: customer.id, discount: "0", paymentMethod: "credit", amountPaid: "0", currency: "GHS" }, database);
  return { customer, sale };
}

afterEach(async () => {
  databases.splice(0).forEach((database) => database.close());
  await Promise.all([...names].map((name) => new Dexie(name).delete()));
  names.clear();
});

describe("customer debt ledger", () => {
  it("derives outstanding balance from a credit sale minus a partial repayment and writes one repayment record", async () => {
    const database = makeDatabase();
    const { customer } = await creditSale(database);

    const repayment = await recordRepayment({ customerId: customer.id, amount: "7.50", method: "mobile", note: "Market-day payment", currency: "GHS", submissionKey: "repayment-partial-001" }, database);
    const summary = await getCustomerDebtSummary(customer.id, "GHS", database);

    expect(repayment).toMatchObject({ customerId: customer.id, amountMinor: 750, method: "mobile", note: "Market-day payment" });
    expect(summary).toMatchObject({ salesOutstandingMinor: 2000, repaidMinor: 750, outstandingMinor: 1250 });
    expect(summary.outstandingLabel).toContain("12.50");
    expect(summary.activities.map((activity) => activity.type)).toEqual(["repayment", "sale"]);
  });

  it("records a Mobile Money customer payment separately without altering the completed sale or its original debt", async () => {
    const database = makeDatabase();
    const { customer, sale: completion } = await creditSale(database, "Mobile Money Debtor");

    const payment = await recordRepayment({ customerId: customer.id, amount: "6.00", method: "mobile", currency: "GHS", submissionKey: "stage2-mobile-money-payment" }, database);
    const [savedSale, summary] = await Promise.all([database.sales.get(completion.sale.id), getCustomerDebtSummary(customer.id, "GHS", database)]);

    expect(payment).toMatchObject({ method: "mobile", amountMinor: 600, customerId: customer.id });
    expect(savedSale).toMatchObject({ id: completion.sale.id, totalMinor: 2000, outstandingMinor: 2000, amountPaidMinor: 0 });
    expect(summary).toMatchObject({ salesOutstandingMinor: 2000, repaidMinor: 600, outstandingMinor: 1400 });
  });

  it("supports multiple repayments through to a zero balance and rejects any further repayment", async () => {
    const database = makeDatabase();
    const { customer } = await creditSale(database);

    await recordRepayment({ customerId: customer.id, amount: "5.00", method: "cash", currency: "GHS" }, database);
    await recordRepayment({ customerId: customer.id, amount: "15.00", method: "card", currency: "GHS" }, database);
    const settled = await getCustomerDebtSummary(customer.id, "GHS", database);

    expect(settled).toMatchObject({ repaidMinor: 2000, outstandingMinor: 0 });
    await expect(recordRepayment({ customerId: customer.id, amount: "1.00", method: "cash", currency: "GHS" }, database)).rejects.toThrow("no outstanding balance");
  });

  it("rejects an overpayment without writing a detached or partial repayment record", async () => {
    const database = makeDatabase();
    const { customer } = await creditSale(database);

    await expect(recordRepayment({ customerId: customer.id, amount: "20.01", method: "cash", currency: "GHS" }, database)).rejects.toThrow("cannot exceed");
    expect(await database.repayments.count()).toBe(0);
    expect((await getCustomerDebtSummary(customer.id, "GHS", database)).outstandingMinor).toBe(2000);
  });

  it("isolates balances by customer and replays the same repayment submission key only once", async () => {
    const database = makeDatabase();
    const first = await creditSale(database, "First Debtor");
    const second = await creditSale(database, "Second Debtor");
    const request = { customerId: first.customer.id, amount: "8.00", method: "cash" as const, currency: "GHS", submissionKey: "repayment-retry-001" };

    const initial = await recordRepayment(request, database);
    const replayed = await recordRepayment(request, database);
    const [firstSummary, secondSummary] = await Promise.all([getCustomerDebtSummary(first.customer.id, "GHS", database), getCustomerDebtSummary(second.customer.id, "GHS", database)]);

    expect(replayed.id).toBe(initial.id);
    expect(await database.repayments.count()).toBe(1);
    expect(firstSummary.outstandingMinor).toBe(1200);
    expect(secondSummary.outstandingMinor).toBe(2000);
  });

  it("migrates a version 6 sales database into the repayment ledger without removing the customer record", async () => {
    const name = `tallybook-credit-migration-${Date.now()}-${++sequence}`;
    names.add(name);
    const legacy = new Dexie(name);
    legacy.version(6).stores({ appMeta: "key, updatedAt", businessProfiles: "id, name, country, currency, businessType, updatedAt", categories: "id, businessProfileId, name, normalizedName, archivedAt, updatedAt", products: "id, businessProfileId, name, normalizedName, sku, categoryId, archivedAt, lowStockThreshold, updatedAt", inventoryMovements: "id, businessProfileId, productId, createdAt, movementType, resultingQuantity", customers: "id, businessProfileId, name, normalizedName, phone, status, archivedAt, updatedAt", sales: "id, businessProfileId, customerId, receiptNumber, createdAt, outstandingMinor, paymentMethod, &submissionKey", saleLines: "id, saleId, productId", payments: "id, saleId, customerId, createdAt, method", receipts: "id, saleId, receiptNumber, issuedAt", customerActivities: "id, customerId, saleId, createdAt, activityType" });
    await legacy.open();
    await legacy.table("customers").put({ id: "credit-customer-legacy", businessProfileId: "primary", name: "Legacy Debtor", normalizedName: "legacy debtor", phone: "+233 27 000 0000", status: "active", createdAt: "2026-08-24T00:00:00.000Z", updatedAt: "2026-08-24T00:00:00.000Z" });
    legacy.close();

    const upgraded = new TallybookDB(name);
    databases.push(upgraded);
    const readiness = await initializeDatabase(upgraded);

    expect(readiness.schemaVersion).toBe(DATABASE_SCHEMA_VERSION);
    expect(await upgraded.customers.get("credit-customer-legacy")).toMatchObject({ name: "Legacy Debtor" });
    expect(await upgraded.repayments.count()).toBe(0);
  });
});
