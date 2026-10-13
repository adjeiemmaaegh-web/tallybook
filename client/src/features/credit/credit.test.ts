/** Tactile Ledger testing reminder: an amount owed is derived from saved credit sales minus immutable repayments; it is never an editable total. */
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { DATABASE_SCHEMA_VERSION, TallybookDB, initializeDatabase } from "@/db/TallybookDB";
import { createCustomer } from "@/features/customers/customers";
import { getCustomerDebtSummary, getCustomerRepaymentTargets, recordRepayment } from "@/features/credit/credit";
import { createProduct } from "@/features/inventory/inventory";
import { completeSale, getCustomerSaleSummary } from "@/features/sales/sales";
import { executeLatestSaleReversal } from "@/features/assistant/reversals";
import { setCustomerPolicy } from "@/features/customers/customerBenefits";
import { getReportsSnapshot } from "@/features/reports/reports";

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
  it("displays the same net receivable in the sale summary, customer ledger and management reports after repayment", async () => {
    const database = makeDatabase();
    const { customer } = await creditSale(database, "Consistent Balance");
    await recordRepayment({ customerId: customer.id, amount: "6.00", method: "cash", currency: "GHS", submissionKey: "consistent-receivable-001" }, database);
    expect((await getCustomerSaleSummary(customer.id, "GHS", database)).outstandingMinor).toBe(1400);
    expect((await getCustomerDebtSummary(customer.id, "GHS", database)).outstandingMinor).toBe(1400);
    expect((await getReportsSnapshot("all", new Date(), database)).debts.find(row => row.customerId === customer.id)?.outstandingMinor).toBe(1400);
  });

  it("frees customer credit limit after a real full reversal without inventing a repayment", async () => {
    const database = makeDatabase();
    const { customer, sale } = await creditSale(database, "Returned Credit Sale");
    await setCustomerPolicy(customer.id, { creditLimitMinor: 2000 }, database);
    const originalId = sale.sale.id;
    const result = await executeLatestSaleReversal("GHS", database, "reverse-credit-sale-once");
    expect(result).toMatchObject({ originalSaleId: originalId, reversedOutstandingMinor: -2000 });
    expect((await getCustomerSaleSummary(customer.id, "GHS", database)).outstandingMinor).toBe(0);
    expect((await getCustomerDebtSummary(customer.id, "GHS", database)).outstandingMinor).toBe(0);
    const productId = (await database.saleLines.where("saleId").equals(originalId).first())!.productId;
    const later = await completeSale({ lines: [{ productId, quantity: 1 }], customerId: customer.id, discount: "0", paymentMethod: "credit", amountPaid: "0", currency: "GHS" }, database);
    expect(later.sale.outstandingMinor).toBe(2000);
    expect((await getCustomerDebtSummary(customer.id, "GHS", database)).outstandingMinor).toBe(2000);
    expect(await database.repayments.count()).toBe(0);
  });
  it("fails closed rather than erase debt when customer repayments cannot be allocated to a particular sale", async () => {
    const database = makeDatabase();
    const { customer, sale } = await creditSale(database, "Unallocated Payment Customer");
    const productId = (await database.saleLines.where("saleId").equals(sale.sale.id).first())!.productId;
    await completeSale({ lines: [{ productId, quantity: 1 }], customerId: customer.id, discount: "0", paymentMethod: "credit", amountPaid: "0", currency: "GHS" }, database);
    await recordRepayment({ customerId: customer.id, amount: "5.00", method: "cash", currency: "GHS", submissionKey: "unallocated-repayment-0001" }, database);
    const stockBefore = (await database.products.get(productId))!.stockQuantity;
    await expect(executeLatestSaleReversal("GHS", database, "uncertain-payment-reversal-0001"))
      .rejects.toThrow("not linked to individual sales");
    expect(await database.saleReversals.count()).toBe(0);
    expect((await database.products.get(productId))!.stockQuantity).toBe(stockBefore);
    expect((await getCustomerDebtSummary(customer.id, "GHS", database)).outstandingMinor).toBe(3500);
  });

  it("blocks a foreign-currency credit sale before stock can change, even without a credit-limit policy", async () => {
    const database = makeDatabase();
    const { customer, sale } = await creditSale(database, "Single Currency Customer");
    const productId = (await database.saleLines.where("saleId").equals(sale.sale.id).first())!.productId;
    const before = (await database.products.get(productId))!.stockQuantity;
    await expect(completeSale({ lines: [{productId, quantity:1}], customerId: customer.id,
      discount:"0", paymentMethod:"credit", amountPaid:"0", currency:"USD" }, database))
      .rejects.toThrow(/different currency/);
    expect((await database.products.get(productId))!.stockQuantity).toBe(before);
    expect(await database.sales.where("customerId").equals(customer.id).count()).toBe(1);
  });

  it("refuses a foreign-currency repayment and does not persist or mislabel the customer's debt", async () => {
    const database = makeDatabase();
    const {customer} = await creditSale(database, "No FX Collection");
    await expect(recordRepayment({ customerId:customer.id, amount:"1.00", currency:"USD",
      method:"cash", submissionKey:"fx-repayment-attempt-001" }, database)).rejects.toThrow(/different currency/);
    expect(await database.repayments.where("customerId").equals(customer.id).count()).toBe(0);
    expect((await getCustomerDebtSummary(customer.id,"USD",database)).outstandingLabel).toContain("GHS");
  });

  it("keeps a historical sale currency unknown and refuses guessed-currency collections", async () => {
    const database = makeDatabase();
    const {customer,sale} = await creditSale(database,"Unknown Historical Currency");
    await database.sales.update(sale.sale.id,{currency:undefined});
    const summary = await getCustomerDebtSummary(customer.id,"GHS",database);
    expect(summary.outstandingMinor).toBe(2000);
    expect(summary.outstandingLabel).toContain("historical currency unverified");
    await expect(recordRepayment({customerId:customer.id,amount:"1.00",method:"cash",currency:"GHS"},database))
      .rejects.toThrow(/no verified currency/);
    expect(await database.repayments.count()).toBe(0);
  });

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

  it("rejects changed repayment details when a submission key is retried", async () => {
    const database = makeDatabase(); const { customer } = await creditSale(database);
    const original = { customerId: customer.id, amount: "5.00", method: "cash" as const, currency: "GHS", submissionKey: "repayment-idempotency-guard" };
    await recordRepayment(original, database);
    await expect(recordRepayment({ ...original, amount: "7.00" }, database)).rejects.toThrow("reused for different details");
    expect(await database.repayments.count()).toBe(1);
    expect((await getCustomerDebtSummary(customer.id, "GHS", database)).outstandingMinor).toBe(1500);
  });

  it("stores explicit sale allocations atomically and safely reverses only a different unpaid sale", async () => {
    const database = makeDatabase();
    const { customer, sale: first } = await creditSale(database, "Allocated Debtor");
    const product = (await database.products.toArray())[0];
    const second = await completeSale({ lines: [{ productId: product.id, quantity: 1 }], customerId: customer.id,
      discount: "0", paymentMethod: "credit", amountPaid: "0", currency: "GHS" }, database);
    const saved = await recordRepayment({ customerId: customer.id, amount: "5.00", method: "cash", currency: "GHS",
      submissionKey: "allocated-repayment-0001", saleAllocations: [{saleId:first.sale.id, amountMinor:500}] }, database);
    expect(saved.saleAllocations).toEqual([{saleId:first.sale.id,amountMinor:500}]);
    expect(await recordRepayment({ customerId: customer.id, amount: "5.00", method: "cash", currency: "GHS",
      submissionKey: "allocated-repayment-0001", saleAllocations: [{saleId:first.sale.id, amountMinor:500}] }, database)).toEqual(saved);
    await expect(recordRepayment({ customerId: customer.id, amount: "5.00", method: "cash", currency: "GHS",
      submissionKey: "allocated-repayment-0001", saleAllocations: [{saleId:second.sale.id,amountMinor:500}] }, database)).rejects.toThrow(/reused/);
    const reverted = await executeLatestSaleReversal("GHS",database,"allocated-other-sale-reversal");
    expect(reverted.originalSaleId).toBe(second.sale.id);
    await expect(executeLatestSaleReversal("GHS",database,"blocked-linked-sale-reversal")).rejects.toThrow(/linked repayments/);
    expect(await database.saleReversals.count()).toBe(1);
    expect(await database.repayments.count()).toBe(1);
    expect((await getCustomerDebtSummary(customer.id,"GHS",database)).outstandingMinor).toBe(1500);
  });

  it("rejects mismatched/foreign/overallocated repayments without persisting them", async () => {
    const database=makeDatabase();
    const {customer,sale} = await creditSale(database, "Allocation Validation");
    const another=await creditSale(database, "Other Allocation Customer");
    for (const saleAllocations of [
      [{saleId:sale.sale.id,amountMinor:499}],
      [{saleId:another.sale.id,amountMinor:500}],
      [{saleId:sale.sale.id,amountMinor:2001}],
      [{saleId:sale.sale.id,amountMinor:250},{saleId:sale.sale.id,amountMinor:250}],
    ]) {
      await expect(recordRepayment({customerId:customer.id,amount:"5.00",method:"cash",currency:"GHS",saleAllocations},database)).rejects.toThrow();
    }
    expect(await database.repayments.count()).toBe(0);
  });

  it("presents saved-currency targets, saves a single-sale payment and reduces its available debt", async () => {
    const database = makeDatabase();
    const {customer, sale: first} = await creditSale(database, "Sale Link UI Customer");
    const second = await completeSale({ lines: [{productId: (await database.saleLines.where("saleId").equals(first.sale.id).first())!.productId, quantity: 1}],
      customerId: customer.id, discount: "0", paymentMethod: "credit", amountPaid: "0", currency: "GHS" }, database);
    expect((await database.sales.get(first.sale.id))?.currency).toBe("GHS");
    const options = await getCustomerRepaymentTargets(customer.id, "GHS", database);
    expect(options.canLink).toBe(true);
    expect(options.targets.map(row => row.saleId)).toContain(first.sale.id);
    expect(options.targets.map(row => row.saleId)).toContain(second.sale.id);
    const saved = await recordRepayment({ customerId: customer.id, amount: "6.00", currency: "GHS", method: "cash",
      submissionKey: "sale-linked-ui-service-001", saleAllocations: [{saleId:first.sale.id,amountMinor:600}] }, database);
    expect(saved.currency).toBe("GHS");
    expect((await getCustomerRepaymentTargets(customer.id,"GHS",database)).targets.find(row=>row.saleId===first.sale.id)?.remainingMinor).toBe(1400);
    await expect(recordRepayment({ customerId: customer.id, amount: "6.00", currency: "USD", method: "cash",
      submissionKey: "sale-linked-ui-service-001", saleAllocations: [{saleId:first.sale.id,amountMinor:600}] }, database)).rejects.toThrow(/reused/);
    expect(await database.repayments.count()).toBe(1);
  });

  it("rejects linked repayments after a stale target becomes ambiguous due to historical unallocated payments", async () => {
    const database = makeDatabase();
    const {customer,sale} = await creditSale(database, "Stale Sale Link");
    const initial = await getCustomerRepaymentTargets(customer.id, "GHS", database);
    expect(initial.canLink).toBe(true);
    await recordRepayment({customerId:customer.id,amount:"3.00",method:"cash",currency:"GHS"},database);
    const choices = await getCustomerRepaymentTargets(customer.id, "GHS", database);
    expect(choices.canLink).toBe(false);
    expect(choices.unallocatedMinor).toBe(300);
    await expect(recordRepayment({customerId:customer.id,amount:"2.00",method:"cash",currency:"GHS",
      saleAllocations:[{saleId:sale.sale.id,amountMinor:200}]},database)).rejects.toThrow(/earlier payments/);
    expect(await database.repayments.count()).toBe(1);
  });

  it("refuses to imply a sale currency for old records but keeps customer-level repayment available", async () => {
    const database = makeDatabase();
    const {customer,sale} = await creditSale(database, "Old Unknown Currency");
    const { currency: _previousCurrency, ...legacySale } = (await database.sales.get(sale.sale.id))!;
    await database.sales.put(legacySale);
    const choices = await getCustomerRepaymentTargets(customer.id,"GHS",database);
    expect(choices.canLink).toBe(false);
    await expect(recordRepayment({customerId:customer.id,amount:"2.00",method:"cash",currency:"GHS",
      saleAllocations:[{saleId:sale.sale.id,amountMinor:200}]},database)).rejects.toThrow(/eligible|currency/);
    await recordRepayment({customerId:customer.id,amount:"2.00",method:"cash",currency:"GHS"},database);
    expect((await getCustomerDebtSummary(customer.id,"GHS",database)).outstandingMinor).toBe(1800);
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
