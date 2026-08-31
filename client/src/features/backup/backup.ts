/** Stage 9: portable backups are explicit, versioned local files; restore is validated and atomic, never a cloud sync. */
import { DATABASE_SCHEMA_VERSION, db, initializeDatabase, type AppMetaRecord, type TallybookDB } from "@/db/TallybookDB";
import type { BusinessProfile } from "@/features/business/businessProfile";
import type { Customer } from "@/features/customers/customers";
import type { DebtRepayment } from "@/features/credit/credit";
import type { InventoryMovement, Product, ProductCategory } from "@/features/inventory/inventory";
import type { MobileMoneyProvider } from "@/features/payments/mobileMoney";
import type { CustomerActivity, Payment, Receipt, Sale, SaleLine } from "@/features/sales/sales";
import type { Purchase, PurchaseLine, Supplier } from "@/features/purchases/purchases";
import { expenseCategories, localExpenseDate, type Expense } from "@/features/expenses/expenses";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";

export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_KIND = "tallybook-local-backup";

export interface BackupRecords {
  appMeta: AppMetaRecord[];
  businessProfiles: BusinessProfile[];
  categories: ProductCategory[];
  products: Product[];
  inventoryMovements: InventoryMovement[];
  customers: Customer[];
  sales: Sale[];
  saleLines: SaleLine[];
  payments: Payment[];
  receipts: Receipt[];
  customerActivities: CustomerActivity[];
  repayments: DebtRepayment[];
  mobileMoneyProviders: MobileMoneyProvider[];
  suppliers: Supplier[];
  purchases: Purchase[];
  purchaseLines: PurchaseLine[];
  expenses: Expense[];
}

export interface TallybookBackup {
  kind: typeof BACKUP_KIND;
  formatVersion: typeof BACKUP_FORMAT_VERSION;
  createdAt: string;
  databaseSchemaVersion: number;
  records: BackupRecords;
}

export interface BackupSummary {
  createdAt: string;
  businessName: string | null;
  counts: Record<Exclude<keyof BackupRecords, "appMeta">, number>;
}

const recordKeys = ["appMeta", "businessProfiles", "categories", "products", "inventoryMovements", "customers", "sales", "saleLines", "payments", "receipts", "customerActivities", "repayments", "mobileMoneyProviders", "suppliers", "purchases", "purchaseLines", "expenses"] as const;
const summaryKeys = recordKeys.filter((key) => key !== "appMeta") as Exclude<keyof BackupRecords, "appMeta">[];

export async function getLastBackupAt(database: TallybookDB = db): Promise<string | null> {
  await database.open();
  return (await database.appMeta.get("lastBackupAt"))?.value ?? null;
}

export async function getLastBackupCompanyId(database: TallybookDB = db): Promise<string | null> {
  await database.open();
  return (await database.appMeta.get("lastBackupCompanyId"))?.value ?? null;
}

export async function recordBackupExportedAt(value = new Date().toISOString(), database: TallybookDB = db): Promise<string> {
  await database.open();
  const companyId = getActiveBusinessProfileId();
  await database.transaction("rw", database.appMeta, async () => {
    await database.appMeta.put({ key: "lastBackupAt", value, updatedAt: value });
    await database.appMeta.put({ key: "lastBackupCompanyId", value: companyId, updatedAt: value });
  });
  return value;
}

export async function createBackup(database: TallybookDB = db): Promise<TallybookBackup> {
  await database.open();
  const activeId = getActiveBusinessProfileId();
  const [appMeta, allBusinessProfiles, allCategories, allProducts, allInventoryMovements, allCustomers, allSales, allSaleLines, allPayments, allReceipts, allCustomerActivities, allRepayments, allMobileMoneyProviders, allSuppliers, allPurchases, allPurchaseLines, allExpenses] = await Promise.all([
    database.appMeta.toArray(), database.businessProfiles.toArray(), database.categories.toArray(), database.products.toArray(), database.inventoryMovements.toArray(), database.customers.toArray(), database.sales.toArray(), database.saleLines.toArray(), database.payments.toArray(), database.receipts.toArray(), database.customerActivities.toArray(), database.repayments.toArray(), database.mobileMoneyProviders.toArray(), database.suppliers.toArray(), database.purchases.toArray(), database.purchaseLines.toArray(), database.expenses.toArray(),
  ]);
  const scoped = <T extends { businessProfileId: string }>(records: T[]) => records.filter((record) => record.businessProfileId === activeId);
  return { kind: BACKUP_KIND, formatVersion: BACKUP_FORMAT_VERSION, createdAt: new Date().toISOString(), databaseSchemaVersion: DATABASE_SCHEMA_VERSION, records: { appMeta: appMeta.filter((record) => record.key !== "activeBusinessProfileId"), businessProfiles: allBusinessProfiles.filter((record) => record.id === activeId), categories: scoped(allCategories), products: scoped(allProducts), inventoryMovements: scoped(allInventoryMovements), customers: scoped(allCustomers), sales: scoped(allSales), saleLines: scoped(allSaleLines), payments: scoped(allPayments), receipts: scoped(allReceipts), customerActivities: scoped(allCustomerActivities), repayments: scoped(allRepayments), mobileMoneyProviders: scoped(allMobileMoneyProviders), suppliers: scoped(allSuppliers), purchases: scoped(allPurchases), purchaseLines: scoped(allPurchaseLines), expenses: scoped(allExpenses) } };
}

export function stringifyBackup(backup: TallybookBackup) { return JSON.stringify(backup, null, 2); }

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function hasUniqueIds(records: unknown[]) { const ids = records.map((record) => isRecord(record) ? record.id : undefined).filter((id): id is string => typeof id === "string"); return ids.length === new Set(ids).size; }
function hasValidLocalExpenseDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value > localExpenseDate()) return false;
  const [year, month, day] = value.split("-").map(Number); const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}
function hasValidExpenseRecord(value: unknown) {
  return isRecord(value) && typeof value.id === "string" && typeof value.businessProfileId === "string" && value.businessProfileId.trim().length > 0 && typeof value.category === "string" && (expenseCategories as readonly string[]).includes(value.category) && Number.isInteger(value.amountMinor) && typeof value.amountMinor === "number" && value.amountMinor > 0 && hasValidLocalExpenseDate(value.expenseDate) && typeof value.submissionKey === "string" && value.submissionKey.length >= 8 && typeof value.createdAt === "string" && !Number.isNaN(Date.parse(value.createdAt)) && (value.note === undefined || typeof value.note === "string");
}

export function parseBackup(text: string): TallybookBackup {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error("This file is not valid Tallybook backup JSON."); }
  if (!isRecord(parsed) || parsed.kind !== BACKUP_KIND) throw new Error("This file is not a Tallybook local backup.");
  if (parsed.formatVersion !== BACKUP_FORMAT_VERSION) throw new Error("This backup format is not supported by this version of Tallybook.");
  if (typeof parsed.createdAt !== "string" || Number.isNaN(Date.parse(parsed.createdAt))) throw new Error("This backup is missing a valid creation date.");
  if (typeof parsed.databaseSchemaVersion !== "number" || parsed.databaseSchemaVersion > DATABASE_SCHEMA_VERSION) throw new Error("This backup needs a newer version of Tallybook before it can be restored.");
  if (!isRecord(parsed.records)) throw new Error("This backup is missing its local record section.");
  const records = parsed.records;
  for (const key of recordKeys) {
    const tableRecords = records[key];
    if (key === "mobileMoneyProviders" && tableRecords === undefined && parsed.databaseSchemaVersion <= 7) continue;
    if ((key === "suppliers" || key === "purchases" || key === "purchaseLines") && tableRecords === undefined && parsed.databaseSchemaVersion <= 8) continue;
    if (key === "expenses" && tableRecords === undefined && parsed.databaseSchemaVersion <= 9) continue;
    if (!Array.isArray(tableRecords) || !tableRecords.every(isRecord) || !hasUniqueIds(tableRecords)) throw new Error(`This backup has invalid ${key} records.`);
    if (key === "expenses" && !tableRecords.every(hasValidExpenseRecord)) throw new Error("This backup has invalid expense records.");
  }
  return { ...parsed, records: { ...records, mobileMoneyProviders: records.mobileMoneyProviders ?? [], suppliers: records.suppliers ?? [], purchases: records.purchases ?? [], purchaseLines: records.purchaseLines ?? [], expenses: records.expenses ?? [] } } as unknown as TallybookBackup;
}

export function getBackupSummary(backup: TallybookBackup): BackupSummary {
  const counts = Object.fromEntries(summaryKeys.map((key) => [key, backup.records[key].length])) as BackupSummary["counts"];
  return { createdAt: backup.createdAt, businessName: backup.records.businessProfiles[0]?.name ?? null, counts };
}

export async function restoreBackup(backup: TallybookBackup, database: TallybookDB = db): Promise<BackupSummary> {
  const validated = parseBackup(stringifyBackup(backup));
  const profile = validated.records.businessProfiles[0];
  if (!profile) throw new Error("This backup does not contain one complete local company.");
  const companyId = profile.id;
  const normalizeChild = <T extends { businessProfileId?: string }>(records: T[], parentRecords: Array<{ id: string; businessProfileId: string }>, parentKey: keyof T) => records.map((record) => record.businessProfileId ? record : { ...record, businessProfileId: parentRecords.find((parent) => parent.id === record[parentKey])?.businessProfileId ?? companyId });
  const normalized: BackupRecords = { ...validated.records, saleLines: normalizeChild(validated.records.saleLines, validated.records.sales, "saleId"), payments: normalizeChild(validated.records.payments, validated.records.sales, "saleId"), receipts: normalizeChild(validated.records.receipts, validated.records.sales, "saleId"), customerActivities: normalizeChild(validated.records.customerActivities, validated.records.customers, "customerId"), purchaseLines: normalizeChild(validated.records.purchaseLines, validated.records.purchases, "purchaseId") } as BackupRecords;
  await database.open();
  await database.transaction("rw", [database.appMeta, database.businessProfiles, database.categories, database.products, database.inventoryMovements, database.customers, database.sales, database.saleLines, database.payments, database.receipts, database.customerActivities, database.repayments, database.mobileMoneyProviders, database.suppliers, database.purchases, database.purchaseLines, database.expenses], async () => {
    const scopedTables = [database.categories, database.products, database.inventoryMovements, database.customers, database.sales, database.saleLines, database.payments, database.receipts, database.customerActivities, database.repayments, database.mobileMoneyProviders, database.suppliers, database.purchases, database.purchaseLines, database.expenses];
    for (const table of scopedTables) { const existing = await table.where("businessProfileId").equals(companyId).toArray(); if (existing.length) await table.bulkDelete(existing.map((record) => record.id)); }
    await database.businessProfiles.delete(companyId);
    await database.businessProfiles.put(normalized.businessProfiles[0]);
    await Promise.all([database.appMeta.bulkPut(normalized.appMeta), database.categories.bulkPut(normalized.categories), database.products.bulkPut(normalized.products), database.inventoryMovements.bulkPut(normalized.inventoryMovements), database.customers.bulkPut(normalized.customers), database.sales.bulkPut(normalized.sales), database.saleLines.bulkPut(normalized.saleLines), database.payments.bulkPut(normalized.payments), database.receipts.bulkPut(normalized.receipts), database.customerActivities.bulkPut(normalized.customerActivities), database.repayments.bulkPut(normalized.repayments), database.mobileMoneyProviders.bulkPut(normalized.mobileMoneyProviders), database.suppliers.bulkPut(normalized.suppliers), database.purchases.bulkPut(normalized.purchases), database.purchaseLines.bulkPut(normalized.purchaseLines), database.expenses.bulkPut(normalized.expenses)]);
    await database.appMeta.put({ key: "activeBusinessProfileId", value: companyId, updatedAt: new Date().toISOString() });
  });
  await initializeDatabase(database);
  return getBackupSummary({ ...validated, records: normalized });
}

export function backupDownloadName(createdAt = new Date()) { return `tallybook-backup-${createdAt.toISOString().slice(0, 10)}.json`; }
