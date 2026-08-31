/** Stage 11: integrity checks report relationships safely and never alter local owner records. */
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { TallybookDB, initializeDatabase } from "@/db/TallybookDB";
import { saveBusinessProfile } from "@/features/business/businessProfile";
import { createCustomer } from "@/features/customers/customers";
import { createProduct } from "@/features/inventory/inventory";
import { addMobileMoneyProvider } from "@/features/payments/mobileMoney";
import { auditLocalIntegrity } from "@/features/reliability/integrity";
import { completeSale } from "@/features/sales/sales";
import { completePurchase, createSupplier } from "@/features/purchases/purchases";
import { createExpense } from "@/features/expenses/expenses";

const names = new Set<string>(); const openDatabases: Dexie[] = []; let sequence = 0;
function database() { const name = `tallybook-integrity-${Date.now()}-${++sequence}`; names.add(name); const result = new TallybookDB(name); openDatabases.push(result); return result; }
async function readyLedger(database: TallybookDB) {
  await initializeDatabase(database);
  await saveBusinessProfile({ name: "Integrity Shop", country: "Ghana", currency: "GHS", businessType: "Retail shop", phone: "", email: "", address: "" }, database);
  const product = await createProduct({ name: "Integrity item", sku: "", categoryId: "uncategorized", sellingPrice: "10.00", costPrice: "", initialStock: "3", lowStockThreshold: "1" }, "GHS", database);
  const customer = await createCustomer({ name: "Integrity customer", phone: "+233201118888", email: "", address: "", notes: "", status: "active" }, database);
  return { product, customer };
}
afterEach(async () => { openDatabases.splice(0).forEach((database) => database.close()); await Promise.all([...names].map((name) => new Dexie(name).delete())); names.clear(); });

describe("Stage 11 local integrity audit", () => {
  it("clears a valid sale ledger without writing any record", async () => {
    const localDatabase = database(); const { product, customer } = await readyLedger(localDatabase);
    await completeSale({ lines: [{ productId: product.id, quantity: 1 }], customerId: customer.id, discount: "0", paymentMethod: "cash", amountPaid: "10.00", currency: "GHS", submissionKey: "integrity-clear-sale" }, localDatabase);
    const before = { sales: await localDatabase.sales.count(), receipts: await localDatabase.receipts.count(), products: await localDatabase.products.count() };
    const audit = await auditLocalIntegrity(localDatabase);

    expect(audit.status).toBe("clear");
    expect(audit.issues).toEqual([]);
    await expect(Promise.all([localDatabase.sales.count(), localDatabase.receipts.count(), localDatabase.products.count()])).resolves.toEqual([before.sales, before.receipts, before.products]);
  });

  it("reports inconsistent totals and orphan records without attempting a destructive repair", async () => {
    const localDatabase = database(); const { product, customer } = await readyLedger(localDatabase);
    const completed = await completeSale({ lines: [{ productId: product.id, quantity: 1 }], customerId: customer.id, discount: "0", paymentMethod: "cash", amountPaid: "10.00", currency: "GHS", submissionKey: "integrity-attention-sale" }, localDatabase);
    await localDatabase.sales.update(completed.sale.id, { totalMinor: 1250 });
    await localDatabase.receipts.add({ id: "orphan-receipt", businessProfileId: "primary", saleId: "missing-sale", receiptNumber: "TB-ORPHAN", issuedAt: "2026-08-01T00:00:00.000Z" });
    const before = { total: (await localDatabase.sales.get(completed.sale.id))?.totalMinor, receipts: await localDatabase.receipts.count() };
    const audit = await auditLocalIntegrity(localDatabase);

    expect(audit.status).toBe("attention");
    expect(audit.issues.map((entry) => entry.code)).toEqual(expect.arrayContaining(["sale-total", "sale-outstanding", "receipt-orphan"]));
    expect((await localDatabase.sales.get(completed.sale.id))?.totalMinor).toBe(before.total);
    expect(await localDatabase.receipts.count()).toBe(before.receipts);
  });

  it("accepts valid and historical Mobile Money payments, then reports a missing configured provider without changing any records", async () => {
    const localDatabase = database(); const { product, customer } = await readyLedger(localDatabase);
    const provider = await addMobileMoneyProvider({ name: "Vodacom M-Pesa" }, localDatabase);
    const completed = await completeSale({ lines: [{ productId: product.id, quantity: 1 }], customerId: customer.id, discount: "0", paymentMethod: "mobile", amountPaid: "10.00", currency: "GHS", mobileMoneyProviderId: provider.id, mobileMoneyReference: "INTEGRITY-REF", submissionKey: "integrity-mobile-sale" }, localDatabase);
    const payment = await localDatabase.payments.get(completed.payment!.id);

    expect((await auditLocalIntegrity(localDatabase)).status).toBe("clear");
    await localDatabase.payments.put({ ...payment!, mobileMoneyProviderId: undefined, mobileMoneyProviderName: undefined, mobileMoneyReference: undefined });
    expect((await auditLocalIntegrity(localDatabase)).status).toBe("clear");
    await localDatabase.payments.put({ ...payment!, mobileMoneyProviderId: "missing-provider", mobileMoneyProviderName: "Missing Provider" });
    const audit = await auditLocalIntegrity(localDatabase);

    expect(audit.issues.map((entry) => entry.code)).toContain("mobile-money-provider-orphan");
    expect(await localDatabase.payments.get(completed.payment!.id)).toMatchObject({ mobileMoneyProviderId: "missing-provider" });
  });

  it("checks supplier purchases and purchase stock-in movements without changing their saved records", async () => {
    const localDatabase = database(); const { product } = await readyLedger(localDatabase); const supplier = await createSupplier({ name: "Integrity wholesaler", phone: "", email: "", address: "", notes: "" }, localDatabase);
    const purchase = await completePurchase({ supplierId: supplier.id, purchaseDate: "2026-08-27", note: "", submissionKey: "integrity-purchase", lines: [{ productId: product.id, quantity: "2", unitCost: "4.00" }] }, "GHS", localDatabase);
    expect((await auditLocalIntegrity(localDatabase)).status).toBe("clear");
    const [line] = await localDatabase.purchaseLines.where("purchaseId").equals(purchase.id).toArray(); const [movement] = await localDatabase.inventoryMovements.where("purchaseId").equals(purchase.id).toArray();
    await localDatabase.purchases.update(purchase.id, { supplierId: "missing-supplier", totalCostMinor: 2 }); await localDatabase.purchaseLines.update(line.id, { lineTotalMinor: 1 }); await localDatabase.inventoryMovements.delete(movement.id);
    const before = { purchase: await localDatabase.purchases.get(purchase.id), line: await localDatabase.purchaseLines.get(line.id), movements: await localDatabase.inventoryMovements.where("purchaseId").equals(purchase.id).count() };
    const audit = await auditLocalIntegrity(localDatabase);
    expect(audit.issues.map((entry) => entry.code)).toEqual(expect.arrayContaining(["purchase-supplier-orphan", "purchase-total", "purchase-line-total", "purchase-movement-missing"]));
    expect(await localDatabase.purchases.get(purchase.id)).toEqual(before.purchase); expect(await localDatabase.purchaseLines.get(line.id)).toEqual(before.line); expect(await localDatabase.inventoryMovements.where("purchaseId").equals(purchase.id).count()).toBe(before.movements);
  });

  it("reports malformed saved expenses without changing their local history", async () => {
    const localDatabase = database(); await readyLedger(localDatabase);
    const saved = await createExpense({ category: "transport", amount: "5.00", expenseDate: "2026-08-27", currency: "GHS", submissionKey: "integrity-expense" }, localDatabase);
    await localDatabase.expenses.put({ ...saved, category: "incorrect" as never, amountMinor: 0, expenseDate: "2999-01-01" });
    const before = await localDatabase.expenses.get(saved.id);
    const audit = await auditLocalIntegrity(localDatabase);

    expect(audit.issues.map((entry) => entry.code)).toEqual(expect.arrayContaining(["expense-category", "expense-amount", "expense-date"]));
    expect(await localDatabase.expenses.get(saved.id)).toEqual(before);
  });
});
