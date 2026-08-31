/** Stage 9: a downloaded backup must restore all local facts after a clean/reinstalled local database. */
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { TallybookDB, initializeDatabase } from "@/db/TallybookDB";
import { backupDownloadName, createBackup, getBackupSummary, getLastBackupAt, parseBackup, recordBackupExportedAt, restoreBackup, stringifyBackup } from "@/features/backup/backup";
import { saveBusinessProfile } from "@/features/business/businessProfile";
import { createCustomer } from "@/features/customers/customers";
import { getCustomerDebtSummary, recordRepayment } from "@/features/credit/credit";
import { createProduct, getInventorySnapshot } from "@/features/inventory/inventory";
import { addMobileMoneyProvider } from "@/features/payments/mobileMoney";
import { getReportsSnapshot } from "@/features/reports/reports";
import { resolveReceiptDetail } from "@/features/receipts/receiptDetail";
import { completeSale, getSaleSnapshot } from "@/features/sales/sales";
import { completePurchase, createSupplier, getPurchasesSnapshot } from "@/features/purchases/purchases";
import { createExpense } from "@/features/expenses/expenses";
import { persistActiveBusinessProfileId, setActiveBusinessProfileId } from "@/features/business/activeCompany";

const names = new Set<string>(); let sequence = 0; const opened: Dexie[] = [];
function database(name = `tallybook-backup-test-${Date.now()}-${++sequence}`) { names.add(name); const result = new TallybookDB(name); opened.push(result); return result; }
afterEach(async () => { opened.splice(0).forEach((entry) => entry.close()); await Promise.all([...names].map((name) => new Dexie(name).delete())); names.clear(); });

describe("Stage 9 local backup and restore", () => {
  it("exports and restores business records, inventory, customer debt, sales, payments, repayments, receipts, and reports after a simulated reinstall", async () => {
    const db = database(); await initializeDatabase(db);
    await saveBusinessProfile({ name: "Backup Shop", country: "Ghana", currency: "GHS", businessType: "Retail shop", phone: "", email: "", address: "" }, db);
    const product = await createProduct({ name: "Backup item", sku: "", categoryId: "uncategorized", sellingPrice: "10.00", costPrice: "", initialStock: "4", lowStockThreshold: "1" }, "GHS", db);
    const customer = await createCustomer({ name: "Backup customer", phone: "+233 20 123 4500", email: "", address: "", notes: "", status: "active" }, db);
    const provider = await addMobileMoneyProvider({ name: "MTN MoMo" }, db);
    const completed = await completeSale({ lines: [{ productId: product.id, quantity: 1 }], customerId: customer.id, discount: "0", paymentMethod: "mobile", amountPaid: "4.00", currency: "GHS", mobileMoneyProviderId: provider.id, mobileMoneyReference: "BACKUP-REF", submissionKey: "backup-sale" }, db);
    await recordRepayment({ customerId: customer.id, amount: "3.00", method: "mobile", currency: "GHS", submissionKey: "backup-repayment" }, db);
    const supplier = await createSupplier({ name: "Backup wholesaler", phone: "", email: "", address: "", notes: "" }, db);
    const purchase = await completePurchase({ supplierId: supplier.id, purchaseDate: "2026-08-27", note: "Restock", submissionKey: "backup-purchase", lines: [{ productId: product.id, quantity: "2", unitCost: "4.00" }] }, "GHS", db);
    const expense = await createExpense({ category: "transport", amount: "6.50", expenseDate: "2026-08-27", note: "Supplier delivery", currency: "GHS", submissionKey: "backup-expense" }, db);
    expect(await getLastBackupAt(db)).toBeNull();
    const exportedAt = "2026-08-27T18:00:00.000Z";
    await recordBackupExportedAt(exportedAt, db);
    expect(await getLastBackupAt(db)).toBe(exportedAt);
    const exported = parseBackup(stringifyBackup(await createBackup(db)));
    expect(getBackupSummary(exported).counts).toMatchObject({ products: 1, customers: 1, sales: 1, payments: 1, receipts: 1, repayments: 1, mobileMoneyProviders: 1, suppliers: 1, purchases: 1, purchaseLines: 1, expenses: 1 });
    await db.transaction("rw", db.appMeta, db.businessProfiles, db.products, db.customers, db.sales, db.saleLines, db.payments, db.receipts, db.customerActivities, db.repayments, db.inventoryMovements, db.categories, db.mobileMoneyProviders, db.suppliers, db.purchases, db.purchaseLines, db.expenses, async () => { await Promise.all([db.appMeta.clear(), db.businessProfiles.clear(), db.products.clear(), db.customers.clear(), db.sales.clear(), db.saleLines.clear(), db.payments.clear(), db.receipts.clear(), db.customerActivities.clear(), db.repayments.clear(), db.inventoryMovements.clear(), db.categories.clear(), db.mobileMoneyProviders.clear(), db.suppliers.clear(), db.purchases.clear(), db.purchaseLines.clear(), db.expenses.clear()]); });
    await restoreBackup(exported, db);
    expect(await getLastBackupAt(db)).toBe(exportedAt);
    const [inventory, debt, reports, sales, purchases] = await Promise.all([getInventorySnapshot(db), getCustomerDebtSummary(customer.id, "GHS", db), getReportsSnapshot("all", new Date(), db), getSaleSnapshot(db), getPurchasesSnapshot(db)]);
    const restoredReceipt = sales.receipts.find((receipt) => receipt.saleId === completed.sale.id)!;
    const receiptDetail = resolveReceiptDetail({ receiptId: restoredReceipt.id, snapshot: sales, profile: { name: "Backup Shop", currency: "GHS" }, customers: [{ id: customer.id, name: "Backup customer" }] });
    expect((await db.businessProfiles.get("primary"))?.name).toBe("Backup Shop");
    expect(inventory.products.find((entry) => entry.id === product.id)?.stockQuantity).toBe(5);
    expect(await db.receipts.where("saleId").equals(completed.sale.id).count()).toBe(1);
    expect(await db.payments.where("saleId").equals(completed.sale.id).first()).toMatchObject({ method: "mobile", mobileMoneyProviderName: "MTN MoMo", mobileMoneyReference: "BACKUP-REF" });
    expect(await db.mobileMoneyProviders.get(provider.id)).toMatchObject({ name: "MTN MoMo", active: true });
    expect(receiptDetail).toMatchObject({ businessName: "Backup Shop", customerName: "Backup customer" });
    expect(receiptDetail?.payment).toMatchObject({ mobileMoneyProviderName: "MTN MoMo", mobileMoneyReference: "BACKUP-REF" });
    expect(debt.outstandingMinor).toBe(300);
    expect(reports.totals).toMatchObject({ salesMinor: 1000, receivedMinor: 700, outstandingDebtMinor: 300, transactionCount: 1 });
    expect(purchases.suppliers).toMatchObject([{ name: "Backup wholesaler" }]);
    expect(purchases.purchases).toMatchObject([{ id: purchase.id, supplierName: "Backup wholesaler", totalCostMinor: 800, lines: [{ productId: product.id, productName: "Backup item", quantity: 2, unitCostMinor: 400, lineTotalMinor: 800 }] }]);
    expect(inventory.movements.find((movement) => movement.purchaseId === purchase.id)).toMatchObject({ movementType: "purchase", quantityDelta: 2, resultingQuantity: 5 });
    expect(await db.expenses.get(expense.id)).toMatchObject({ category: "transport", amountMinor: 650, note: "Supplier delivery" });
  });

  it("rejects invalid, unsupported, or duplicate-record backups without changing the current local business", async () => {
    const db = database(); await initializeDatabase(db); await saveBusinessProfile({ name: "Safe Existing Shop", country: "Ghana", currency: "GHS", businessType: "Retail shop", phone: "", email: "", address: "" }, db);
    await expect(async () => restoreBackup(parseBackup("{\"kind\":\"wrong\"}"), db)).rejects.toThrow();
    const valid = await createBackup(db); const newer = { ...valid, databaseSchemaVersion: 999 }; expect(() => parseBackup(stringifyBackup(newer as typeof valid))).toThrow("newer version");
    const duplicate = { ...valid, records: { ...valid.records, businessProfiles: [...valid.records.businessProfiles, ...valid.records.businessProfiles] } }; expect(() => parseBackup(stringifyBackup(duplicate))).toThrow("invalid businessProfiles");
    expect((await db.businessProfiles.get("primary"))?.name).toBe("Safe Existing Shop");
    expect(backupDownloadName(new Date("2026-08-25T10:00:00.000Z"))).toBe("tallybook-backup-2026-08-25.json");
  });

  it("accepts a readable version-9 backup that has no Stage 8 expense table", async () => {
    const db = database(); await initializeDatabase(db);
    const current = await createBackup(db);
    const legacy = { ...current, databaseSchemaVersion: 9, records: Object.fromEntries(Object.entries(current.records).filter(([key]) => key !== "expenses")) };

    const parsed = parseBackup(JSON.stringify(legacy));

    expect(parsed.records.expenses).toEqual([]);
  });
});

describe("Stage 11 multi-company backup scope", () => {
  it("accepts an expense export for a non-primary local company", async () => {
    const db = database();
    await initializeDatabase(db);
    await db.businessProfiles.put({ id: "company-secondary", name: "Secondary Shop", country: "Ghana", currency: "GHS", businessType: "Retail shop", phone: "", email: "", address: "", createdAt: "2026-08-30T10:00:00.000Z", updatedAt: "2026-08-30T10:00:00.000Z" });
    await persistActiveBusinessProfileId("company-secondary", db);
    try {
      await createExpense({ category: "transport", amount: "6.50", expenseDate: "2026-08-29", note: "Secondary delivery", currency: "GHS", submissionKey: "secondary-expense" }, db);
      const exported = parseBackup(stringifyBackup(await createBackup(db)));
      expect(exported.records.businessProfiles).toMatchObject([{ id: "company-secondary", name: "Secondary Shop" }]);
      expect(exported.records.expenses).toMatchObject([{ businessProfileId: "company-secondary", amountMinor: 650, note: "Secondary delivery" }]);
    } finally {
      setActiveBusinessProfileId("primary");
    }
  });
});
