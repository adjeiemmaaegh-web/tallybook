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
async function initializeBackupCompany(db: TallybookDB) {
  await initializeDatabase(db);
  await saveBusinessProfile({ name: "Backup fixture", country: "Ghana", currency: "GHS", businessType: "Retail shop", phone: "", email: "", address: "" }, db);
}
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
    expect(exported.records.expenses[0].currency).toBe("GHS");
    const invalidExpenseCurrency = structuredClone(exported);
    invalidExpenseCurrency.records.expenses[0].currency = "usd";
    expect(() => parseBackup(stringifyBackup(invalidExpenseCurrency))).toThrow(/invalid expense/i);
    expect(getBackupSummary(exported).counts).toMatchObject({ products: 1, customers: 1, sales: 1, payments: 1, receipts: 1, repayments: 1, mobileMoneyProviders: 1, suppliers: 1, purchases: 1, purchaseLines: 1, expenses: 1 });
    await db.transaction("rw", db.appMeta, db.businessProfiles, db.products, db.customers, db.sales, db.saleLines, db.payments, db.receipts, db.customerActivities, db.repayments, db.inventoryMovements, db.categories, db.mobileMoneyProviders, db.suppliers, db.purchases, db.purchaseLines, db.expenses, async () => { await Promise.all([db.appMeta.clear(), db.businessProfiles.clear(), db.products.clear(), db.customers.clear(), db.sales.clear(), db.saleLines.clear(), db.payments.clear(), db.receipts.clear(), db.customerActivities.clear(), db.repayments.clear(), db.inventoryMovements.clear(), db.categories.clear(), db.mobileMoneyProviders.clear(), db.suppliers.clear(), db.purchases.clear(), db.purchaseLines.clear(), db.expenses.clear()]); });
    await restoreBackup(exported, db);
    // Device-local backup status is never imported from a portable business file.
    expect(await getLastBackupAt(db)).toBeNull();
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

  it("accepts explicit sale repayment links in backup and rejects tampered links", async () => {
    const local=database(); await initializeBackupCompany(local);
    const item=await createProduct({name:"Backup allocated product",sku:"",categoryId:"uncategorized",sellingPrice:"10.00",costPrice:"",initialStock:"4",lowStockThreshold:"1"},"GHS",local);
    const customer=await createCustomer({name:"Backup allocated customer",phone:"+233 20 555 1111",email:"",address:"",notes:"",status:"active"},local);
    const saved=await completeSale({lines:[{productId:item.id,quantity:1}],customerId:customer.id,discount:"0",paymentMethod:"credit",amountPaid:"0",currency:"GHS"},local);
    await recordRepayment({customerId:customer.id,amount:"3.00",method:"cash",currency:"GHS",submissionKey:"backup-linked-payment-0001",saleAllocations:[{saleId:saved.sale.id,amountMinor:300}]},local);
    const snapshot=await createBackup(local);
    expect(parseBackup(stringifyBackup(snapshot)).records.repayments[0].saleAllocations).toEqual([{saleId:saved.sale.id,amountMinor:300}]);
    expect(snapshot.records.sales[0].currency).toBe("GHS");
    expect(snapshot.records.repayments[0].currency).toBe("GHS");
    const tamperedCurrency=structuredClone(snapshot);
    tamperedCurrency.records.repayments[0].currency="USD";
    expect(()=>parseBackup(stringifyBackup(tamperedCurrency))).toThrow(/currency|currencies/i);
    // An unallocated repayment still has real currency evidence. It must not
    // bypass cross-currency checks merely because no saleAllocations exist.
    const unallocatedConflict=structuredClone(snapshot);
    delete unallocatedConflict.records.repayments[0].saleAllocations;
    unallocatedConflict.records.repayments[0].currency="USD";
    expect(()=>parseBackup(stringifyBackup(unallocatedConflict))).toThrow(/combines currencies/);
    const unknownHistoricalConflict=structuredClone(snapshot);
    delete unknownHistoricalConflict.records.repayments[0].saleAllocations;
    delete unknownHistoricalConflict.records.sales[0].currency;
    expect(()=>parseBackup(stringifyBackup(unknownHistoricalConflict))).toThrow(/unverified historical/);
    const unsupportedCurrency=structuredClone(snapshot);
    unsupportedCurrency.records.sales[0].currency="fake-currency";
    expect(()=>parseBackup(stringifyBackup(unsupportedCurrency))).toThrow(/sale currency evidence/i);
    const orphan=structuredClone(snapshot);
    orphan.records.repayments[0].saleAllocations![0].saleId="not-a-real-sale";
    expect(()=>parseBackup(stringifyBackup(orphan))).toThrow(/allocation.*missing|missing.*credit sale/i);
    const inflated=structuredClone(snapshot);
    inflated.records.repayments[0].saleAllocations![0].amountMinor=301;
    expect(()=>parseBackup(stringifyBackup(inflated))).toThrow(/allocations.*sum/i);
  });

  it("rejects invalid, unsupported, or duplicate-record backups without changing the current local business", async () => {
    const db = database(); await initializeDatabase(db); await saveBusinessProfile({ name: "Safe Existing Shop", country: "Ghana", currency: "GHS", businessType: "Retail shop", phone: "", email: "", address: "" }, db);
    await expect(async () => restoreBackup(parseBackup("{\"kind\":\"wrong\"}"), db)).rejects.toThrow();
    const valid = await createBackup(db); const newer = { ...valid, databaseSchemaVersion: 999 }; expect(() => parseBackup(stringifyBackup(newer as typeof valid))).toThrow("newer version");
    const duplicate = { ...valid, records: { ...valid.records, businessProfiles: [...valid.records.businessProfiles, ...valid.records.businessProfiles] } }; expect(() => parseBackup(stringifyBackup(duplicate))).toThrow("invalid businessProfiles");
    expect((await db.businessProfiles.get("primary"))?.name).toBe("Safe Existing Shop");
    expect(backupDownloadName(new Date("2026-08-25T10:00:00.000Z"))).toBe("tallybook-backup-2026-08-25.json");
  });


  it("does not replace device-local schema/backup metadata or erase local assistant audit on restore", async () => {
    const db = database(); await initializeBackupCompany(db);
    const currentSchema = await db.appMeta.get("schemaVersion");
    const originalCreatedAt = await db.appMeta.get("databaseCreatedAt");
    const stamp = "2026-10-11T00:00:00.000Z";
    await db.assistantAudit.add({id:"existing-assistant-audit",businessProfileId:"primary",createdAt:stamp,action:"sale",outcome:"saved",summary:"retained",request:"sell",details:[]});
    const snapshot = await createBackup(db);
    expect(snapshot.records.appMeta).toEqual([]);
    const legacy = structuredClone(snapshot);
    legacy.records.appMeta = [{key:"schemaVersion",value:"1",updatedAt:stamp},{key:"lastBackupAt",value:stamp,updatedAt:stamp}];
    expect(parseBackup(JSON.stringify(legacy)).records.appMeta).toHaveLength(2);
    await restoreBackup(legacy, db);
    expect((await db.appMeta.get("schemaVersion"))?.value).toBe(currentSchema?.value);
    expect(await db.appMeta.get("databaseCreatedAt")).toEqual(originalCreatedAt);
    expect(await db.appMeta.get("lastBackupAt")).toBeUndefined();
    expect(await db.assistantAudit.get("existing-assistant-audit")).toMatchObject({summary:"retained"});
    for (const key of ["activeBusinessProfileId","restoreRecoveryJournal","maliciousSetting"]) {
      const hostile=structuredClone(snapshot);
      hostile.records.appMeta=[{key,value:"forged",updatedAt:stamp}];
      expect(()=>parseBackup(JSON.stringify(hostile))).toThrow(/device metadata/i);
    }
  });

  it("accepts a readable version-9 backup that has no Stage 8 expense table", async () => {
    const db = database(); await initializeBackupCompany(db);
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

describe("Backup isolation regression checks", () => {
  it("rejects backup rows assigned to another company before restore", async () => {
    const local = database(); await initializeBackupCompany(local);
    const valid = await createBackup(local);
    const hostile = { ...valid, records: { ...valid.records, customers: [{ id: "foreign-customer", businessProfileId: "different-company" }] } };
    expect(() => parseBackup(JSON.stringify(hostile))).toThrow("another company");
  });

  it("rejects dangling sale lines and malformed assistant company IDs", async () => {
    const local = database(); await initializeBackupCompany(local);
    const valid = await createBackup(local);
    const dangling = { ...valid, records: { ...valid.records, saleLines: [{ id: "dangling-line", businessProfileId: valid.records.businessProfiles[0].id, saleId: "absent-sale", productId: "absent-product" }] } };
    expect(() => parseBackup(JSON.stringify(dangling))).toThrow("missing sales");
    const invalidAssistant = { ...valid, assistant: { ...valid.assistant!, history: [{ id: "foreign-entry", businessProfileId: "different-company" }] } };
    expect(() => parseBackup(JSON.stringify(invalidAssistant))).toThrow("foreign company");
  });
});

describe("V9 inventory backup integration", () => {
  it("includes local stock-count sessions and batches in the backup and restores both", async () => {
    const databaseInstance = database();
    await initializeDatabase(databaseInstance);
    await saveBusinessProfile({ name: "Inventory Backup", country: "Ghana", currency: "GHS", businessType: "Retail shop", phone: "", email: "", address: "" }, databaseInstance);
    const product = await createProduct({ name: "Counted item", sku: "COUNT-1", categoryId: "uncategorized", sellingPrice: "10.00", costPrice: "", initialStock: "4", lowStockThreshold: "1" }, "GHS", databaseInstance);
    const companyId = product.businessProfileId;
    await databaseInstance.stockCountSessions.add({ id: "count-backup", companyId, businessProfileId: companyId, lines: [{ productId: product.id, expectedQuantity: 4, countedQuantity: 4 }], status: "draft", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    await databaseInstance.inventoryBatches.add({ id: "batch-backup", businessProfileId: companyId, productId: product.id, batchCode: "LOT-01", quantity: 4, createdAt: new Date().toISOString() });
    const exported = parseBackup(stringifyBackup(await createBackup(databaseInstance)));
    expect(exported.records.stockCountSessions).toHaveLength(1);
    expect(exported.records.inventoryBatches).toHaveLength(1);
    await databaseInstance.stockCountSessions.clear();
    await databaseInstance.inventoryBatches.clear();
    await restoreBackup(exported, databaseInstance);
    expect(await databaseInstance.stockCountSessions.get("count-backup")).toMatchObject({ companyId, status: "draft" });
    expect(await databaseInstance.inventoryBatches.get("batch-backup")).toMatchObject({ productId: product.id, batchCode: "LOT-01" });
  });

  it("accepts older pre-V14 backups without optional inventory tables", async () => {
    const databaseInstance = database(); await initializeBackupCompany(databaseInstance);
    const current = await createBackup(databaseInstance);
    const legacy = { ...current, databaseSchemaVersion: 13, records: { ...current.records } };
    delete (legacy.records as Partial<typeof legacy.records>).stockCountSessions;
    delete (legacy.records as Partial<typeof legacy.records>).inventoryBatches;
    const parsed = parseBackup(JSON.stringify(legacy));
    expect(parsed.records.stockCountSessions).toEqual([]);
    expect(parsed.records.inventoryBatches).toEqual([]);
  });
});

describe("assistant backup history completeness", () => {
  it("exports every company-owned history record instead of silently truncating to 50 UI entries", async () => {
    const { assistantLocalDB } = await import("@/features/assistant/assistantLocalStore");
    const local=database();
    await initializeBackupCompany(local);
    setActiveBusinessProfileId("primary");
    await assistantLocalDB.open();
    const rows=Array.from({length:55},(_,i)=>({id:`backup-history-${i}`,businessProfileId:"primary",input:`question ${i}`,replyText:"answer",replayText:`question ${i}`,createdAt:new Date(Date.UTC(2026,9,11,0,0,i)).toISOString()}));
    try {
      await assistantLocalDB.history.bulkPut(rows);
      const exported=await createBackup(local);
      expect(exported.assistant?.history).toHaveLength(55);
      expect(parseBackup(stringifyBackup(exported)).assistant?.history).toHaveLength(55);
    } finally {
      await assistantLocalDB.history.bulkDelete(rows.map(row=>row.id));
    }
  });
});
