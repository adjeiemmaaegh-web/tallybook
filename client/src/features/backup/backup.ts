import { taxPolicySchema, validateTaxSnapshot } from "@/features/sales/tax";
import { allocationCost, reconstructInventoryCost, type InventoryCostEvent } from "@/features/inventory/costLedger";
import { lockStaff, requirePermission } from "@/features/staff/staff";
import { auditRun13StoreBackup } from "@/features/stores/run13BackupAudit.mjs";
/** Stage 9: portable backups are versioned local files; retail restore is atomic, assistant restore uses durable crash recovery. Never cloud sync. */
import { DATABASE_SCHEMA_VERSION, db, initializeDatabase, type AppMetaRecord, type TallybookDB } from "@/db/TallybookDB";
import type { BusinessProfile } from "@/features/business/businessProfile";
import type { Customer } from "@/features/customers/customers";
import type { DebtRepayment } from "@/features/credit/credit";
import type { InventoryMovement, Product, ProductCategory } from "@/features/inventory/inventory";
import type { MobileMoneyProvider } from "@/features/payments/mobileMoney";
import type { CustomerActivity, Payment, Receipt, Sale, SaleLine } from "@/features/sales/sales";
import type { Purchase, PurchaseLine, Supplier } from "@/features/purchases/purchases";
import type { SupplierPayableEntry } from "@/features/purchases/supplierPayables.ts";
import { reconcileSupplierPayables } from "@/features/purchases/supplierPayables.mjs";
import { reconcileCreditLedger, inspectReceivableCurrency } from "@/features/sales/creditLedger.mjs";
import {auditCompanyReturnPolicyEvidence} from '@/features/business/returnPolicyAudit.mjs';
import {auditRun12SaleTaxHistory} from '@/features/reports/run12SaleTaxAudit.mjs';
import {auditRun12SupplierFinance} from '@/features/reports/run12SupplierFinanceAudit.mjs';
import {auditRun10CompanyReceivables} from "@/features/reports/run10ReceivablesAudit.mjs";
import {auditRun10PrepaidCashConservation} from "@/features/reports/run10PrepaidCashAudit.mjs";
import { expenseCategories, localExpenseDate, type Expense } from "@/features/expenses/expenses";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import { assistantLocalDB, listAllAssistantHistoryForBackup, listStoredAliases, listStoredWorkflows } from "@/features/assistant/assistantLocalStore";
import { RESTORE_JOURNAL_KEY } from "./restoreJournal.mjs";
import { withCrossTabDataLock } from "./crossTabDataLock.mjs";
import { assertImportableLegacyBackupMetadata, portableBackupMetadata } from "./backupMetadataPolicy.mjs";
import {normalizeRun8BackupTables,RUN8_BACKUP_TABLES} from "./run8BackupCompatibility.mjs";
import {assertRun8UnambiguousJSON} from "./run8JSONPreflight.mjs";
import {RUN8_VERIFIED_RECEIPT_KEY,RUN8_VERIFIED_RECEIPT_KIND,
 serializeRun8VerifiedReceipt,parseRun8VerifiedReceipt} from "./run8VerifiedReceipt.mjs";
import { assertPlainBackupSize } from "./backupResourceLimits.mjs";
import { beginBackupRestoreJournal, recoverPendingBackupRestoreWhileLocked, readAssistantRestoreSnapshot, writeAssistantRestoreSnapshot } from "./restoreRecovery";
import type { SaleReversal } from "@/features/assistant/reversals";
import type { CashPartialSaleReturn } from "@/features/sales/cashPartialReturnPosting";
import { reconcileCashPartialReturns } from "@/features/sales/cashPartialReturn.mjs";
import { assertCashReturnLedgerLinks } from "@/features/sales/cashReturnStockLinks.mjs";
import type { WalletTransfer } from "@/features/customers/walletTransfers";
import type { CustomerBenefitEntry, CustomerPolicy } from "@/features/customers/customerBenefits";
import type { Quotation } from "@/features/customers/quotations";
import { calculateOrderTotal, type CommerceOrder } from "@/features/commerce/commerce";
import {auditRun16PortableCommerce,type Run16CommerceHold,type Run16OrderEvent} from "@/features/commerce/run16Rules.mjs";
import {reconcileRun17Reviews,type Run17ReviewEvent} from "@/features/insights/run17ReviewAudit.mjs";
import type { StaffMember, StaffShift, StaffAudit } from "@/features/staff/staff";
import type { StockCountSession, InventoryBatch } from "@/features/inventory/stage2Inventory";
import { validateOutboxEvent } from "@/features/sync/syncFoundation";
import { validateLocalSyncDevice } from "@/features/sync/deviceRegistry";
import { normalizeStoreName } from "@/features/stores/storeDirectory";
import { validateTransferRequest } from "@/features/stores/storeTransfers";
import { validateStoreStockCount } from "@/features/stores/storeStockCounts";
import { reconcileSaleCosts } from "@/features/reports/costReconciliation";

export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_KIND = "tallybook-local-backup";

export interface BackupRecords {
  appMeta: AppMetaRecord[];
  businessProfiles: BusinessProfile[];
  categories: ProductCategory[];
  products: Product[];
  inventoryMovements: InventoryMovement[];
  inventoryCostEvents: InventoryCostEvent[];
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
  supplierPayableEntries: SupplierPayableEntry[];
  expenses: Expense[];
  saleReversals: SaleReversal[];
  cashPartialReturns: CashPartialSaleReturn[];
  stockCountSessions: StockCountSession[];
  inventoryBatches: InventoryBatch[];
  quotations: Quotation[];
  customerBenefits: CustomerBenefitEntry[];
  customerPolicies: CustomerPolicy[];
  walletTransfers: WalletTransfer[];
  staffMembers: StaffMember[];
  staffShifts: StaffShift[];
  staffAudits: StaffAudit[];
  commerceOrders: CommerceOrder[];
  commerceHolds: Run16CommerceHold[];
  commerceDeliveryEvents: Run16OrderEvent[];
  run17ReviewEvents: Run17ReviewEvent[];
  syncConsents: import("@/features/sync/syncFoundation").SyncConsent[];
  syncOutbox: import("@/features/sync/syncFoundation").SyncOutboxEvent[];
  syncConflicts: import("@/features/sync/reconciliation").SyncConflict[];
  syncDevices: import("@/features/sync/deviceRegistry").LocalSyncDevice[];
  storeLocations: import("@/features/stores/storeDirectory").StoreLocation[];
  storeAssignments: import("@/features/stores/storeDirectory").StoreAssignment[];
  storeTransferRequests: import("@/features/stores/storeTransfers").StoreTransferRequest[];
  storeStockObservations: import("@/features/stores/storeStockCounts").StoreStockObservation[];
  storeStockModes: import("@/features/stores/storeStockLedger").StoreStockMode[];
  storeStockEntries: import("@/features/stores/storeStockLedger").StoreStockEntry[];
}

export interface TallybookBackup {
  kind: typeof BACKUP_KIND;
  formatVersion: typeof BACKUP_FORMAT_VERSION;
  createdAt: string;
  databaseSchemaVersion: number;
  records: BackupRecords;
  assistant?: { workflows: Awaited<ReturnType<typeof listStoredWorkflows>>; aliases: Awaited<ReturnType<typeof listStoredAliases>>; history: Awaited<ReturnType<typeof listAllAssistantHistoryForBackup>> };
}

export interface BackupSummary {
  createdAt: string;
  businessName: string | null;
  counts: Record<Exclude<keyof BackupRecords, "appMeta">, number>;
}

const extendedKeys = ["syncConsents", "syncOutbox", "syncConflicts", "syncDevices", "storeLocations", "storeAssignments", "storeTransferRequests", "storeStockObservations", "storeStockModes", "storeStockEntries"] as const;
const recordKeys = ["appMeta", "businessProfiles", "categories", "products", "inventoryMovements", "customers", "sales", "saleLines", "payments", "receipts", "customerActivities", "repayments", "mobileMoneyProviders", "suppliers", "purchases", "purchaseLines", "supplierPayableEntries", "expenses", "saleReversals", "cashPartialReturns", "stockCountSessions", "inventoryBatches", "quotations", "customerBenefits", "customerPolicies", "walletTransfers", "staffMembers", "staffShifts", "staffAudits", "commerceOrders", "commerceHolds", "commerceDeliveryEvents", "run17ReviewEvents", "inventoryCostEvents", ...extendedKeys] as const;
const summaryKeys = recordKeys.filter((key) => key !== "appMeta") as Exclude<keyof BackupRecords, "appMeta">[];

/** Historical lastBackupAt/lastBackupCompanyId rows are NOT evidence that
 * a file was saved. Only the Run 8 reselected-file marker is trustworthy as
 * evidence of a local verification step, not of independent disaster recovery.
 */
export async function getVerifiedBackupReceipt(database:TallybookDB=db){
  await database.open();
  const row=await database.appMeta.get(RUN8_VERIFIED_RECEIPT_KEY);
  if(!row)return null;
  try{
    const receipt=parseRun8VerifiedReceipt(row.value);
    if(!await database.businessProfiles.get(receipt.companyId))return null;
    return receipt;
  }catch{return null;} // Corrupt evidence cannot grant backup readiness.
}
export async function getLastBackupAt(database:TallybookDB=db):Promise<string|null>{
  return (await getVerifiedBackupReceipt(database))?.createdAt??null;
}
export async function getLastBackupCompanyId(database:TallybookDB=db):Promise<string|null>{
  return (await getVerifiedBackupReceipt(database))?.companyId??null;
}
export function recordBackupExportedAt(
  value=new Date().toISOString(),database:TallybookDB=db,
  exportedCompanyId=getActiveBusinessProfileId(),verifiedSha256?:string
):Promise<string>{
  return withCrossTabDataLock('shared',async()=>{
    await database.open();
    if(!exportedCompanyId?.trim()||exportedCompanyId!==getActiveBusinessProfileId()||
       typeof value!=='string'||!Number.isFinite(Date.parse(value)))
      throw Error('Company or backup timestamp changed before export recording.');
    if(verifiedSha256!==undefined&&!/^[0-9a-f]{64}$/.test(verifiedSha256))
      throw Error('Invalid encrypted backup-file fingerprint.');
    await database.transaction('rw',[database.appMeta,database.businessProfiles,database.staffMembers],async()=>{
      if(await database.appMeta.get(RESTORE_JOURNAL_KEY))
        throw Error('Recover the interrupted restore before recording a backup.');
      if(exportedCompanyId!==getActiveBusinessProfileId()||
         !await database.businessProfiles.get(exportedCompanyId))
        throw Error('The exported company is no longer selected or available.');
      await requirePermission('staff',database,exportedCompanyId);
      // Kept only as legacy diagnostic metadata; neither one alone grants
      // destructive company-clear readiness.
      await database.appMeta.put({key:'lastBackupAt',value,updatedAt:value});
      if(exportedCompanyId!==getActiveBusinessProfileId())
        throw Error('Company changed while recording the backup export.');
      await database.appMeta.put({key:'lastBackupCompanyId',value:exportedCompanyId,updatedAt:value});
      if(exportedCompanyId!==getActiveBusinessProfileId())
        throw Error('Company changed while recording the backup export.');
      if(verifiedSha256){
        const verifiedAt=new Date().toISOString();
        const receipt=serializeRun8VerifiedReceipt({
          kind:RUN8_VERIFIED_RECEIPT_KIND,companyId:exportedCompanyId,
          createdAt:value,verifiedAt,sha256:verifiedSha256
        });
        await database.appMeta.put({key:RUN8_VERIFIED_RECEIPT_KEY,
          value:receipt,updatedAt:verifiedAt});
      }else{
        // An older or unverified export must never inherit prior V2 proof.
        await database.appMeta.delete(RUN8_VERIFIED_RECEIPT_KEY);
      }
      if(exportedCompanyId!==getActiveBusinessProfileId())
        throw Error('Company changed while recording the backup export.');
    });
    return value;
  });
}

/** Export is a TWO-DATABASE read. Hold the exclusive origin-wide Web Lock
 * across main IndexedDB and assistant queries so no cooperating writer can
 * change either snapshot halfway through the export. If Web Locks are absent
 * fail closed rather than claim a coherent portable backup. */
export function createBackup(database: TallybookDB = db): Promise<TallybookBackup> {
  return withCrossTabDataLock('exclusive',()=>createBackupWhileLocked(database));
}

async function createBackupWhileLocked(database: TallybookDB): Promise<TallybookBackup> {
  await database.open();
  const activeId = getActiveBusinessProfileId();
  const records = await database.transaction("r", database.tables, async () => {
    await requirePermission("staff", database, activeId);
    if (await database.appMeta.get(RESTORE_JOURNAL_KEY)) throw new Error("Recover the interrupted restore before exporting a backup.");
    const entries = await Promise.all(recordKeys.map(async key => {
      // Device metadata is not company data. Never read it into the export.
      if (key === "appMeta") return [key, portableBackupMetadata()];
      const rows = await database.table(key).toArray();
      return [key, rows.filter(row => key === "businessProfiles" ? row.id === activeId : key === "stockCountSessions" ? row.companyId === activeId : row.businessProfileId === activeId)];
    }));
    return Object.fromEntries(entries) as BackupRecords;
  });
  // These three assistant queries now run while the same exclusive lock is
  // held as the main retail read. The source tables are left untouched.
  const assistant = { workflows: await listStoredWorkflows(activeId), aliases: await listStoredAliases(activeId), history: await listAllAssistantHistoryForBackup(activeId) };
  if(activeId!==getActiveBusinessProfileId())
    throw new Error("Company changed during coordinated backup. No export was created.");
  await requirePermission("staff", database, activeId);
  // A backup must not escape after a competing interrupted restore, including
  // failures between the main DB and assistant DB reads.
  if(await database.appMeta.get(RESTORE_JOURNAL_KEY))
    throw new Error("An interrupted restore needs recovery before backup export.");
  return { kind: BACKUP_KIND, formatVersion: BACKUP_FORMAT_VERSION, createdAt: new Date().toISOString(), databaseSchemaVersion: DATABASE_SCHEMA_VERSION, assistant, records };
}

export function stringifyBackup(backup: TallybookBackup) { return assertPlainBackupSize(JSON.stringify(backup, null, 2)); }

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function hasUniqueIds(records: unknown[]) { const ids = records.map((record) => isRecord(record) ? record.id : undefined).filter((id): id is string => typeof id === "string"); return ids.length === new Set(ids).size; }
function hasValidLocalExpenseDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value > localExpenseDate()) return false;
  const [year, month, day] = value.split("-").map(Number); const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}
function hasValidExpenseRecord(value: unknown) {
  return isRecord(value) && typeof value.id === "string" && typeof value.businessProfileId === "string" && value.businessProfileId.trim().length > 0 && typeof value.category === "string" && (expenseCategories as readonly string[]).includes(value.category) && Number.isSafeInteger(value.amountMinor) && typeof value.amountMinor === "number" && value.amountMinor > 0 && (value.currency === undefined || (typeof value.currency === "string" && /^[A-Z]{3}$/.test(value.currency))) && hasValidLocalExpenseDate(value.expenseDate) && typeof value.submissionKey === "string" && value.submissionKey.length >= 8 && typeof value.createdAt === "string" && !Number.isNaN(Date.parse(value.createdAt)) && (value.note === undefined || typeof value.note === "string");
}

/** Enforce company isolation and relationships before any write. Legacy child rows
 * without businessProfileId are assigned only when their parent exists. */
function validateCompanyRecords(records: BackupRecords, assistant?: TallybookBackup["assistant"]) {
  if (records.businessProfiles.length !== 1 || !isRecord(records.businessProfiles[0]) || typeof records.businessProfiles[0].id !== "string" || !records.businessProfiles[0].id.trim()) throw new Error("This backup must contain exactly one company.");
  if (records.businessProfiles[0].taxPolicy !== undefined) taxPolicySchema.parse(records.businessProfiles[0].taxPolicy);
  const companyId = records.businessProfiles[0].id;
  const index = (key: keyof BackupRecords) => new Set((records[key] as Array<{ id: string }>).map((r) => r.id));
  for (const key of recordKeys) {
    if (key === "appMeta" || key === "businessProfiles") continue;
    for (const record of records[key] as unknown as Record<string, unknown>[]) {
      if (!["syncConsents","storeStockModes"].includes(key) && (typeof record.id !== "string" || !record.id.trim())) throw new Error(`Invalid ${key} record ID.`);
      const legacyChild = ["saleLines", "payments", "receipts", "customerActivities", "purchaseLines"].includes(key);
      if (key === "stockCountSessions") {
        if (record.companyId !== companyId || !Array.isArray(record.lines) || !["draft", "posted"].includes(String(record.status))) throw new Error("Invalid stock-count session ownership or contents.");
        for (const line of record.lines) {
          if (!isRecord(line) || typeof line.productId !== "string" || !Number.isSafeInteger(line.expectedQuantity) || !Number.isSafeInteger(line.countedQuantity) || Number(line.countedQuantity) < 0) throw new Error("Invalid stock-count line.");
        }
        if (record.businessProfileId !== undefined && record.businessProfileId !== companyId) throw new Error("Stock-count session belongs to another company.");
        continue;
      }
      if (record.businessProfileId === undefined && !legacyChild) throw new Error(`Backup ${key} is missing company ownership.`);
      if (record.businessProfileId !== undefined && record.businessProfileId !== companyId) throw new Error(`Backup ${key} contains data from another company.`);
    }
  }
  if (records.syncConsents.length > 1 || records.syncConsents.some(row => typeof row.enabled !== "boolean" || !Number.isFinite(Date.parse(row.updatedAt)))) throw new Error("Invalid sync consent snapshot.");
  records.syncOutbox.forEach(validateOutboxEvent);
  records.syncDevices.forEach(validateLocalSyncDevice);
  for (const conflict of records.syncConflicts) if (!["payload-mismatch", "operation-collision", "unknown-event"].includes(conflict.reason) || !["unresolved", "reviewed"].includes(conflict.status) || !conflict.eventId || !conflict.operationId || !Number.isFinite(Date.parse(conflict.detectedAt))) throw new Error("Invalid sync conflict snapshot.");
  auditRun13StoreBackup(companyId,records.storeStockModes,records.storeStockEntries,records.products,records.storeLocations,records.storeTransferRequests,records.inventoryMovements);
  for (const store of records.storeLocations) if (normalizeStoreName(store.name) !== store.normalizedName || !["active", "closed"].includes(store.status)) throw new Error("Invalid store snapshot.");
  for (const request of records.storeTransferRequests) {
    validateTransferRequest(request.sourceStoreId, request.destinationStoreId, request.productId, request.quantity);
    if (!["requested", "dispatched", "cancelled", "completed"].includes(request.status)) throw new Error("Invalid transfer request status.");
  }
  for (const observation of records.storeStockObservations) {
    validateStoreStockCount(observation.observedQuantity, observation.note);
    if (!Number.isFinite(Date.parse(observation.observedAt))) throw new Error("Invalid stock observation date.");
  }
  const extensionRelationships: Array<[keyof BackupRecords, string, keyof BackupRecords]> = [
    ["syncOutbox", "deviceId", "syncDevices"], ["storeAssignments", "storeId", "storeLocations"], ["storeAssignments", "staffId", "staffMembers"],
    ["storeTransferRequests", "sourceStoreId", "storeLocations"], ["storeTransferRequests", "destinationStoreId", "storeLocations"], ["storeTransferRequests", "productId", "products"], ["storeTransferRequests", "requestedByStaffId", "staffMembers"],
    ["storeStockObservations", "storeId", "storeLocations"], ["storeStockObservations", "productId", "products"], ["storeStockObservations", "recordedByStaffId", "staffMembers"],
  ];
  for (const [key, field, parent] of extensionRelationships) for (const row of records[key] as unknown as Record<string, unknown>[]) {
    if (typeof row[field] !== "string" || !index(parent).has(row[field] as string)) throw new Error(`Backup ${key} refers to missing ${parent}.`);
  }
  const relationships: Array<[keyof BackupRecords, string, keyof BackupRecords]> = [
    ["products", "categoryId", "categories"], ["inventoryMovements", "productId", "products"],
    ["saleLines", "saleId", "sales"], ["saleLines", "productId", "products"],
    ["cashPartialReturns", "originalSaleId", "sales"],
    ["payments", "saleId", "sales"], ["receipts", "saleId", "sales"],
    ["customerActivities", "customerId", "customers"], ["repayments", "customerId", "customers"],
    ["purchaseLines", "purchaseId", "purchases"], ["purchaseLines", "productId", "products"],
    ["supplierPayableEntries", "purchaseId", "purchases"], ["supplierPayableEntries", "supplierId", "suppliers"],
    ["inventoryBatches", "productId", "products"], ["inventoryCostEvents", "productId", "products"],
    ["staffShifts", "staffId", "staffMembers"], ["staffAudits", "staffId", "staffMembers"],
    ["quotations", "customerId", "customers"], ["customerBenefits", "customerId", "customers"], ["customerPolicies", "customerId", "customers"], ["walletTransfers", "customerId", "customers"],
  ];
  for (const [key, field, parent] of relationships) {
    const ids = index(parent);
    for (const record of records[key] as unknown as Record<string, unknown>[]) {
      const value = record[field];
      if (typeof value === "string" && value.length && !ids.has(value)) throw new Error(`Backup ${key} refers to a missing ${parent} record.`);
    }
  }
  // A receipt-linked batch must point to its own immutable receipt layer.
  // Older manually registered batches have no receiptCostEventId and remain valid.
  const costById = new Map(records.inventoryCostEvents.map(event => [event.id, event]));
  for (const batch of records.inventoryBatches) if (batch.receiptCostEventId) {
    const event = costById.get(batch.receiptCostEventId);
    if (!event || event.kind !== "receipt" || event.batchId !== batch.id ||
        event.productId !== batch.productId || event.businessProfileId !== batch.businessProfileId ||
        event.quantityDelta !== batch.startingQuantity)
      throw new Error("Batch receipt and historical cost evidence do not reconcile.");
  }
  // New v27 supplier evidence is optional for all older backups, but strict when present.
  // A legacy stock receipt never proves either payment or unpaid status.
  const purchaseById = new Map(records.purchases.map(row => [row.id, row]));
  for (const entry of records.supplierPayableEntries) {
    const purchase = purchaseById.get(entry.purchaseId);
    if (!purchase || !purchase.currency || entry.currency !== purchase.currency || !/^[A-Z]{3}$/.test(entry.currency) ||
        typeof entry.createdAt !== "string" || !Number.isFinite(Date.parse(entry.createdAt)) ||
        (entry.reference !== undefined && (typeof entry.reference !== "string" || entry.reference.length > 120)) ||
        (entry.staffId !== undefined && !index("staffMembers").has(entry.staffId)) ||
        (entry.shiftId !== undefined && !index("staffShifts").has(entry.shiftId))) {
      throw new Error("Invalid supplier payable evidence or currency in backup.");
    }
  }
  reconcileSupplierPayables(records.purchases, records.supplierPayableEntries);
  // Independently check original supplier ownership and purchase-versus-
  // settlement chronology before ANY restore mutation. A supplier credit note
  // is not a bank payment, and other-currency expenses remain unconverted.
  auditRun12SupplierFinance({
    company:companyId,companyCurrency:records.businessProfiles[0].currency,
    suppliers:records.suppliers,purchases:records.purchases,
    entries:records.supplierPayableEntries,expenses:records.expenses,
    range:{start:new Date(0),end:new Date(8_640_000_000_000_000)}
  });
  // Currency snapshots are additive: absence means UNKNOWN on old records,
  // never the current profile currency. Invalid new snapshots are rejected.
  const supportedCurrencyEvidence = (value: string | undefined) => value === undefined || /^[A-Z]{3}$/.test(value);
  for (const sale of records.sales) if (!supportedCurrencyEvidence(sale.currency))
    throw new Error("Invalid sale currency evidence in backup.");
  for (const repayment of records.repayments) if (!supportedCurrencyEvidence(repayment.currency))
    throw new Error("Invalid repayment currency evidence in backup.");
  // Even an entirely unallocated ledger must not restore a made-up single
  // currency total. Verify every customer's saved receivable denomination,
  // without reinterpreting the absent snapshots on legacy records.
  const denominationGroups = new Map<string, { sales: Sale[]; repayments: DebtRepayment[] }>();
  for (const sale of records.sales) if (sale.customerId) {
    const key = JSON.stringify([sale.businessProfileId, sale.customerId]);
    if (!denominationGroups.has(key)) denominationGroups.set(key, {sales: [], repayments: []});
    denominationGroups.get(key)!.sales.push(sale);
  }
  for (const repayment of records.repayments) {
    const key = JSON.stringify([repayment.businessProfileId, repayment.customerId]);
    if (!denominationGroups.has(key)) denominationGroups.set(key, {sales: [], repayments: []});
    denominationGroups.get(key)!.repayments.push(repayment);
  }
  for (const group of denominationGroups.values())
    inspectReceivableCurrency(group.sales, group.repayments);
  const salesById = new Map(records.sales.map(row => [row.id, row]));
  for (const repayment of records.repayments) for (const link of repayment.saleAllocations ?? []) {
    const original = salesById.get(link.saleId);
    if (repayment.currency && original?.currency && repayment.currency !== original.currency)
      throw new Error("Repayment allocation currency conflicts with saved sale currency.");
  }
  // Historical repayments may remain unallocated. Once explicit per-sale
  // evidence exists, verify it against ALL of this customer's sale/debt data.
  // Never trust an embedded sale ID just because it has the right shape.
  const allocatedCustomerIds = new Set(records.repayments.filter(row => row.saleAllocations !== undefined).map(row => row.customerId));
  for (const customerId of allocatedCustomerIds) {
    reconcileCreditLedger(
      records.sales.filter(row => row.customerId === customerId),
      records.saleReversals.filter(row => row.customerId === customerId),
      records.repayments.filter(row => row.customerId === customerId),
    );
  }
  // Full-history customer-level conservation: never let one customer's
  // overpayment disappear behind a different customer's valid receivables.
  // No old unallocated repayment is silently assigned to a particular sale.
  auditRun10CompanyReceivables({
    company:companyId,customers:records.customers,sales:records.sales,
    repayments:records.repayments,reversals:records.saleReversals
  });
  // Wallet cash is NOT a second collection on wallet-funded checkout.
  // Validate all transfers, actual stored-value debits, and reversal credits
  // before any main-ledger or assistant restore transaction can start.
  auditRun10PrepaidCashConservation({
    transfers:records.walletTransfers,benefits:records.customerBenefits,
    sales:records.sales,reversals:records.saleReversals
  },records.businessProfiles[0].currency);
  for (const order of records.commerceOrders) {
    if (!["draft", "prepared", "ready", "reserved", "packed", "dispatched", "delivered", "return-requested", "cancelled"].includes(order.status) ||
        typeof order.customerName !== "string" || !order.customerName.trim() || order.customerName.length > 120 ||
        typeof order.createdAt !== "string" || !Number.isFinite(Date.parse(order.createdAt)) ||
        typeof order.updatedAt !== "string" || !Number.isFinite(Date.parse(order.updatedAt)) ||
        !Array.isArray(order.lines) || order.lines.some(line => !index("products").has(line.productId)) ||
        calculateOrderTotal(order.lines) !== order.totalMinor) throw new Error("Invalid commerce order in backup.");
  }
  auditRun16PortableCommerce(records.commerceOrders,records.commerceHolds,
    records.commerceDeliveryEvents,records.products,companyId);
  for(const order of records.commerceOrders){
    if(order.saleId){
      const sale=records.sales.find(s=>s.id===order.saleId);
      if(!sale||sale.businessProfileId!==companyId||sale.commerceOrderId!==order.id||
        sale.storeId!==order.storeId||
        order.status==="cancelled")
        throw Error("Saved commerce order sale linkage does not reconcile.");
    }else if(["packed","dispatched","delivered","return-requested"].includes(order.status))
      throw Error("Unpaid commerce order cannot be dispatched or delivered.");
  }
  for(const sale of records.sales)if(sale.commerceOrderId){
    const matches=records.commerceOrders.filter(o=>o.id===sale.commerceOrderId&&o.saleId===sale.id);
    if(matches.length!==1||sale.businessProfileId!==companyId)
      throw Error("Sale refers to missing or duplicated commerce reservation evidence.");
  }
  // Run 17 review notes are advisory history, not a financial posting.
  // Preserve full order and unique company-scope identity; never fabricate
  // review rows for backups produced before schema v33.
  reconcileRun17Reviews(records.run17ReviewEvents,companyId);
  const reviewStaffIds=new Set(records.staffMembers.map(member=>member.id));
  for(const row of records.run17ReviewEvents){
    if(!reviewStaffIds.has(row.staffId))
      throw new Error("Insight review author is missing from this company backup.");
    if(!Number.isFinite(Date.parse(row.createdAt)))
      throw new Error("Insight review has invalid event chronology.");
  }
  for (const member of records.staffMembers) {
    if (!["owner","supervisor","cashier"].includes(member.role) || typeof member.name !== 'string' || !member.name.trim() ||
      typeof member.salt !== 'string' || !/^[0-9a-f]{32}$/.test(member.salt) ||
      typeof member.pinHash !== 'string' || !/^[0-9a-f]{64}$/.test(member.pinHash) ||
      (member.permissions !== undefined && (!Array.isArray(member.permissions) || member.permissions.some(p=> !['sell','refund','discount','inventory','reports','staff'].includes(p) || member.role==='owner' || (member.role==='cashier' && p!=='sell') || (member.role==='supervisor' && p==='staff'))))) throw new Error('Invalid staff credential record.');
  }
  if (records.staffMembers.length && records.staffMembers.filter(m=>m.role==='owner' && !m.disabledAt).length !== 1)
    throw new Error('Staff backup requires exactly one active local owner.');
  for (const shift of records.staffShifts) {
    if (!Number.isSafeInteger(shift.openingFloatMinor) || shift.openingFloatMinor < 0 ||
      typeof shift.openedAt !== 'string' || Number.isNaN(Date.parse(shift.openedAt)) ||
      (shift.varianceMinor !== undefined && shift.varianceMinor !== (shift.countedCashMinor ?? 0) - (shift.expectedCashMinor ?? 0)))
      throw new Error('Invalid staff shift record.');
  }
  for (const audit of records.staffAudits) if (typeof audit.action !== 'string' || !audit.action.trim() || !audit.createdAt)
    throw new Error('Invalid staff audit record.');
  for (const quote of records.quotations) {
    if (!Array.isArray(quote.lines) || !Number.isSafeInteger(quote.totalMinor) || quote.totalMinor < 0 || !["draft","issued","accepted","declined","expired"].includes(quote.status)) throw new Error("Invalid quotation record.");
    if (quote.lines.some(line => !index("products").has(line.productId) || !Number.isSafeInteger(line.quantity) || line.quantity <= 0 || !Number.isSafeInteger(line.lineTotalMinor))) throw new Error("Invalid quotation lines.");
    if (quote.convertedSaleId && !index("sales").has(quote.convertedSaleId)) throw new Error("Quotation conversion refers to an absent sale.");
  }
  for (const entry of records.customerBenefits) if (!["wallet","points"].includes(entry.kind) || !Number.isSafeInteger(entry.delta) || !entry.delta || typeof entry.submissionKey !== "string" || entry.submissionKey.length < 8) throw new Error("Invalid customer benefit entry.");
  for (const transfer of records.walletTransfers) {
    if (!['deposit','refund'].includes(transfer.kind) || !['cash','card','mobile','bank'].includes(transfer.method) ||
      !Number.isSafeInteger(transfer.amountMinor) || transfer.amountMinor <= 0 ||
      (transfer.currency !== undefined && !/^[A-Z]{3}$/.test(transfer.currency)) ||
      !index('customerBenefits').has(transfer.benefitEntryId) || typeof transfer.reference!=='string' || !transfer.reference.trim() ||
      typeof transfer.submissionKey!=='string' || transfer.submissionKey.length<8)
      throw new Error('Invalid prepaid wallet transfer.');
    const entry=records.customerBenefits.find(e=>e.id===transfer.benefitEntryId);
    if (!entry || entry.customerId!==transfer.customerId || entry.kind!=='wallet' ||
       entry.delta !== (transfer.kind==='deposit'?transfer.amountMinor:-transfer.amountMinor))
      throw new Error('Prepaid wallet transfer and benefit record do not reconcile.');
  }
  for (const policy of records.customerPolicies) if (policy.id !== `${companyId}:${policy.customerId}` || (policy.creditLimitMinor !== undefined && (!Number.isSafeInteger(policy.creditLimitMinor) || policy.creditLimitMinor < 0)) || (policy.maxDiscountPercent !== undefined && (!Number.isInteger(policy.maxDiscountPercent) || policy.maxDiscountPercent < 0 || policy.maxDiscountPercent > 100)) || (policy.loyaltySpendMinorPerPoint !== undefined && (!Number.isSafeInteger(policy.loyaltySpendMinorPerPoint) || policy.loyaltySpendMinorPerPoint < 1)) || (policy.loyaltyPointValueMinor !== undefined && (!Number.isSafeInteger(policy.loyaltyPointValueMinor) || policy.loyaltyPointValueMinor < 1))) throw new Error("Invalid customer policy.");
  for (const session of records.stockCountSessions) {
    const productIds = index("products");
    if (session.lines.some(line => !productIds.has(line.productId))) throw new Error("Stock-count session refers to a missing product.");
  }
  for (const product of records.products) {
    const events = records.inventoryCostEvents.filter(event => event.productId === product.id);
    if (!events.length) continue; // Older backups carry no invented receipt history.
    const state = reconstructInventoryCost(events, companyId, product.id);
    if (state.quantity !== product.stockQuantity) throw new Error("Backup stock and historical costs do not reconcile.");
  }
  for (const line of records.saleLines) {
    if (!line.costEventId) {
      if (line.costStatus === "verified" && (line.stockTracked !== false || line.cogsMinor !== 0)) throw new Error("Verified sale cost is missing its allocation evidence.");
      continue;
    }
    const event = records.inventoryCostEvents.find(e => e.id === line.costEventId);
    if (!event || event.kind !== "issue" || event.saleId !== line.saleId || event.saleLineId !== line.id || event.productId !== line.productId || event.quantityDelta !== -line.quantity) throw new Error("Backup sale cost allocation does not match its sale line.");
    const value = allocationCost(event);
    if (value !== line.cogsMinor || line.costStatus !== (value === undefined ? "unavailable" : "verified")) throw new Error("Backup sale cost total does not match receipt allocations.");
  }
  // Verify explicit OFF/registered invoice policy snapshots across every
  // saved sale. Older pre-snapshot receipts are kept legacy-unverified.
  auditRun12SaleTaxHistory(records.sales);
  for (const sale of records.sales) {
    validateTaxSnapshot(sale);
    if (sale.costStatus === undefined) continue;
    const lines = records.saleLines.filter(line => line.saleId === sale.id);
    const verified = lines.length > 0 && lines.every(line => line.costStatus === "verified");
    const total = verified ? lines.reduce((sum, line) => sum + line.cogsMinor!, 0) : undefined;
    if ((total !== undefined && !Number.isSafeInteger(total)) || total !== sale.cogsMinor || sale.costStatus !== (verified ? "verified" : "unavailable")) throw new Error("Backup sale costs do not reconcile with the sale lines.");
  }
  for (const ret of records.cashPartialReturns) {
    if ((ret.staffId && !index("staffMembers").has(ret.staffId)) ||
        (ret.shiftId && !index("staffShifts").has(ret.shiftId))) throw new Error("Cash return references an absent staff member or shift.");
  }
  // Check original sale policy snapshots and refund-time owner decisions.
  // Old refunds without snapshots remain flagged legacy rather than being
  // rewritten to match the current company terms.
  auditCompanyReturnPolicyEvidence(records.businessProfiles[0],
    records.sales,records.saleReversals,records.cashPartialReturns);
  reconcileCashPartialReturns(records.sales, records.saleLines, records.payments, records.cashPartialReturns, records.saleReversals);
  assertCashReturnLedgerLinks(records.sales, records.saleLines, records.cashPartialReturns, records.inventoryMovements, records.inventoryCostEvents);
  reconcileSaleCosts(companyId, {
    cashReturns:records.cashPartialReturns,products:records.products,
    events:records.inventoryCostEvents,movements:records.inventoryMovements,
    sales:records.sales,
    lines:records.saleLines.map(line=>({...line,businessProfileId:line.businessProfileId??companyId})),
    reversals:records.saleReversals,
    purchases:records.purchases,
    purchaseLines:records.purchaseLines.map(line=>({...line,businessProfileId:line.businessProfileId??companyId})),
    expectedCurrency:records.businessProfiles[0].currency
  },{start:new Date(0),end:new Date(8_640_000_000_000_000)});
  if (assistant) {
    for (const key of ["workflows", "aliases", "history"] as const) {
      if (!Array.isArray(assistant[key]) || !hasUniqueIds(assistant[key])) throw new Error(`Invalid assistant ${key} records.`);
      for (const record of assistant[key]) if (typeof record.id !== "string" || !record.id.trim() || record.businessProfileId !== companyId) throw new Error(`Assistant ${key} contains invalid or foreign company data.`);
    }
  }
  return companyId;
}

export function parseBackup(text: string): TallybookBackup {
  assertPlainBackupSize(text); // Reject before allocating a parsed record graph.
  assertRun8UnambiguousJSON(text); // JSON.parse alone silently hides duplicate money/company keys.
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error("This file is not valid Tallybook backup JSON."); }
  if (!isRecord(parsed) || parsed.kind !== BACKUP_KIND) throw new Error("This file is not a Tallybook local backup.");
  // A future root field or an incomplete assistant section could otherwise
  // be dropped without warning while replacing an owner's saved records.
  const rootKeys=["kind","formatVersion","createdAt","databaseSchemaVersion","records","assistant"];
  if(Object.keys(parsed).some(key=>!rootKeys.includes(key)))
    throw new Error("Backup contains unknown top-level data. A newer Tallybook version may be required.");
  if(parsed.assistant!==undefined){
    const expectedAssistantKeys=["workflows","aliases","history"];
    if(!isRecord(parsed.assistant)||
       Object.keys(parsed.assistant).length!==expectedAssistantKeys.length||
       Object.keys(parsed.assistant).some(key=>!expectedAssistantKeys.includes(key)))
      throw new Error("Backup assistant section is incomplete or contains unsupported tables.");
  }
  if (parsed.formatVersion !== BACKUP_FORMAT_VERSION) throw new Error("This backup format is not supported by this version of Tallybook.");
  if (typeof parsed.createdAt !== "string" || Number.isNaN(Date.parse(parsed.createdAt))) throw new Error("This backup is missing a valid creation date.");
  if (typeof parsed.databaseSchemaVersion !== "number" || !Number.isInteger(parsed.databaseSchemaVersion) || parsed.databaseSchemaVersion < 1) throw new Error("This backup has an unsupported database schema version.");
  if (parsed.databaseSchemaVersion > DATABASE_SCHEMA_VERSION) throw new Error("This backup needs a newer version of Tallybook before it can be restored.");
  if (!isRecord(parsed.records)) throw new Error("This backup is missing its local record section.");
  // Normalize optional historical tables only if they did not yet exist.
  // Reject unknown future table names and missing already-introduced tables.
  const normalizedTables=normalizeRun8BackupTables(
    parsed.records,parsed.databaseSchemaVersion,DATABASE_SCHEMA_VERSION
  );
  if(RUN8_BACKUP_TABLES.length!==recordKeys.length ||
     RUN8_BACKUP_TABLES.some((key,index)=>key!==recordKeys[index]))
    throw new Error("Backup schema compatibility policy is out of sync.");
  for(const key of recordKeys){
    const rows=normalizedTables[key];
    if(!rows.every(isRecord)||!hasUniqueIds(rows))
      throw new Error(`This backup has invalid ${key} records.`);
    if(key==="expenses"&&!rows.every(hasValidExpenseRecord))
      throw new Error("This backup has invalid expense records.");
  }
  const backup={...parsed,records:normalizedTables} as unknown as TallybookBackup;
  assertImportableLegacyBackupMetadata(backup.records.appMeta); // Allow old metadata only for reading, never applying.
  validateCompanyRecords(backup.records, backup.assistant);
  return backup;
}

export function getBackupSummary(backup: TallybookBackup): BackupSummary {
  const counts = Object.fromEntries(summaryKeys.map((key) => [key, backup.records[key].length])) as BackupSummary["counts"];
  return { createdAt: backup.createdAt, businessName: backup.records.businessProfiles[0]?.name ?? null, counts };
}

async function restoreBackupWhileLocked(backup: TallybookBackup, database: TallybookDB): Promise<BackupSummary> {
  await recoverPendingBackupRestoreWhileLocked(database);
  const authorizedCompany = getActiveBusinessProfileId();
  await requirePermission("staff", database, authorizedCompany);
  const validated = parseBackup(stringifyBackup(backup));
  const profile = validated.records.businessProfiles[0];
  if (!profile) throw new Error("This backup does not contain one complete local company.");
  const companyId = profile.id;
  const normalizeChild = <T extends { businessProfileId?: string }>(records: T[], parentRecords: Array<{ id: string; businessProfileId: string }>, parentKey: keyof T) => records.map((record) => record.businessProfileId ? record : { ...record, businessProfileId: parentRecords.find((parent) => parent.id === record[parentKey])?.businessProfileId ?? companyId });
  const normalized: BackupRecords = { ...validated.records, saleLines: normalizeChild(validated.records.saleLines, validated.records.sales, "saleId"), payments: normalizeChild(validated.records.payments, validated.records.sales, "saleId"), receipts: normalizeChild(validated.records.receipts, validated.records.sales, "saleId"), customerActivities: normalizeChild(validated.records.customerActivities, validated.records.customers, "customerId"), purchaseLines: normalizeChild(validated.records.purchaseLines, validated.records.purchases, "purchaseId") } as BackupRecords;
  await database.open();
  if (companyId !== authorizedCompany && await database.businessProfiles.get(companyId)) throw new Error("Switch to the company being restored and unlock its owner before replacing its records.");
  // IndexedDB keys are global to each table, even when rows are company-scoped.
  // Reject collisions before deleting or overwriting anything.
  for (const key of recordKeys) {
    if (key === "appMeta" || key === "businessProfiles") continue;
    const table = database[key] as unknown as { bulkGet(ids: string[]): Promise<Array<{ businessProfileId?: string } | undefined>> };
    const rows = normalized[key] as Array<{ id?: string; businessProfileId?: string }>;
    const existing = await table.bulkGet(rows.map((row) => key === "syncConsents" ? row.businessProfileId! : row.id!));
    if (existing.some((row) => row && (key === "stockCountSessions" ? (row as {companyId?: string}).companyId !== companyId : row.businessProfileId !== companyId))) throw new Error(`Cannot restore: ${key} ID belongs to another company.`);
  }
  // Persist the preimage in the ledger BEFORE writing to the separate assistant
  // database. The marker will be removed in the same transaction that commits
  // the ledger restore, allowing startup to distinguish either crash outcome.
  let restoreMarker: string | null = null;
  let assistantSnapshot: Awaited<ReturnType<typeof readAssistantRestoreSnapshot>> | null = null;
  if (validated.assistant) {
    await assistantLocalDB.open();
    assistantSnapshot = await readAssistantRestoreSnapshot(companyId);
    for (const key of ["workflows", "aliases", "history"] as const) {
      const existing = await assistantLocalDB[key].bulkGet(validated.assistant[key].map(row => row.id));
      if (existing.some(row => row && row.businessProfileId !== companyId)) throw new Error(`Cannot restore: assistant ${key} ID belongs to another company.`);
    }
    restoreMarker = await beginBackupRestoreJournal(companyId, assistantSnapshot!, database, validated.assistant);
  }
  try {
    if (validated.assistant) await writeAssistantRestoreSnapshot(companyId, validated.assistant, assistantSnapshot!);
    await database.transaction("rw", database.tables, async () => {
    if (restoreMarker && (await database.appMeta.get(RESTORE_JOURNAL_KEY))?.value !== restoreMarker) throw new Error("Backup restore journal changed before ledger commit.");
    if (!restoreMarker && await database.appMeta.get(RESTORE_JOURNAL_KEY)) throw new Error("An interrupted backup restore requires recovery.");
    await requirePermission("staff", database, authorizedCompany);
    if (companyId !== authorizedCompany && await database.businessProfiles.get(companyId)) throw new Error("The destination company now exists; unlock its owner before restoring.");
    const scopedTables = recordKeys.filter(key => !["appMeta", "businessProfiles", "stockCountSessions"].includes(key)).map(key => database.table(key));
    // Repeat collision checks under the write lock: a concurrent company may
    // have claimed a globally unique key since the initial preflight.
    for (const key of recordKeys) {
      if (key === "appMeta" || key === "businessProfiles") continue;
      const rows = normalized[key] as Array<{ id?: string; businessProfileId?: string }>;
      const existing = await database.table(key).bulkGet(rows.map(row => key === "syncConsents" ? row.businessProfileId! : row.id!));
      if (existing.some(row => row && (key === "stockCountSessions" ? row.companyId : row.businessProfileId) !== companyId)) throw new Error(`Cannot restore: ${key} ID belongs to another company.`);
    }
    const oldCounts = (await database.stockCountSessions.toArray()).filter(row => row.companyId === companyId);
    if (oldCounts.length) await database.stockCountSessions.bulkDelete(oldCounts.map(row => row.id));
    for (const table of scopedTables) await table.where("businessProfileId").equals(companyId).delete();
    // Run 14 encrypted device-local caches are NOT portable ledger evidence.
    // Reset queues, encrypted inbox, conflict notices and relay cursor in the
    // SAME restore transaction; never resume an old remote acknowledgement
    // against a freshly restored company database.
    for(const table of [database.syncReplicaOutbox,database.syncReplicaInbox,
      database.syncReplicaCursors,database.syncReplicaConflicts,
      database.paymentSandboxIntents,database.paymentSandboxEvents])
      await table.where("businessProfileId").equals(companyId).delete();
    // Device-local assistant audit is intentionally excluded from portable backups.
    // Retain this existing audit history instead of silently deleting it on restore.
    // Company deletion and any eventual retention policy are separate owner decisions.
    await database.businessProfiles.delete(companyId);
    await database.businessProfiles.put(normalized.businessProfiles[0]);
    for (const key of recordKeys) if (key !== "businessProfiles" && key !== "appMeta") {
      // Importing a file never grants fresh consent to send records off-device.
      const rows = key === "syncConsents"
        ? normalized.syncConsents.map(row => ({ ...row, enabled: false, updatedAt: new Date().toISOString() }))
        : key === "syncDevices"
        ? normalized.syncDevices.map(row => ({...row,status:"revoked" as const,
            revokedAt:new Date().toISOString(),updatedAt:new Date().toISOString()}))
        : normalized[key];
      await database.table(key).bulkPut(rows);
    }
    await database.appMeta.put({ key: "activeBusinessProfileId", value: companyId, updatedAt: new Date().toISOString() });
    // A restored ledger has a new local revision; old file verification must
    // not be presented as a fresh backup of the restored contents.
    await database.appMeta.delete(RUN8_VERIFIED_RECEIPT_KEY);
    if (restoreMarker) await database.appMeta.delete(RESTORE_JOURNAL_KEY); // Commit decision: atomic with ledger data.
    });
  } catch (error) {
    if (restoreMarker) {
      try {
        if (!(await recoverPendingBackupRestoreWhileLocked(database))) throw new Error("The durable restore marker disappeared before recovery.");
      }
      catch { throw new Error("Ledger restore failed and durable assistant recovery also failed. Preserve this device and retry startup recovery.", { cause: error }); }
    }
    throw error;
  }
  await initializeDatabase(database);
  lockStaff(companyId); // Restored roles/PIN verifiers invalidate any previous local unlock.
  return getBackupSummary({ ...validated, records: normalized });
}

/** Restore owns the exclusive cross-tab lock for the full journal -> assistant
 * write -> retail commit sequence, including recovery on failure. */
export function restoreBackup(backup: TallybookBackup, database: TallybookDB = db): Promise<BackupSummary> {
  return withCrossTabDataLock('exclusive', () => restoreBackupWhileLocked(backup, database));
}

export function backupDownloadName(createdAt = new Date()) { return `tallybook-backup-${createdAt.toISOString().slice(0, 10)}.json`; }
