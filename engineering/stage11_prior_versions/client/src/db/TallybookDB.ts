/** Tactile Ledger design reminder: every local record is deliberate, traceable, and independent of a server. */
/** Tactile Ledger database reminder: migrations are explicit; local business identity remains one validated, owner-controlled record. */
import Dexie, { type Table } from "dexie";
import type { BusinessProfile } from "@/features/business/businessProfile";
import type { Customer } from "@/features/customers/customers";
import type { InventoryMovement, Product, ProductCategory } from "@/features/inventory/inventory";
import type { CustomerActivity, Payment, Receipt, Sale, SaleLine } from "@/features/sales/sales";
import type { DebtRepayment } from "@/features/credit/credit";
import type { MobileMoneyProvider } from "@/features/payments/mobileMoney";
import type { Purchase, PurchaseLine, Supplier } from "@/features/purchases/purchases";
import type { Expense } from "@/features/expenses/expenses";
import type { AssistantAuditEntry } from "@/features/assistant/audit";
import { loadActiveBusinessProfileId } from "@/features/business/activeCompany";

export const DATABASE_NAME = "tallybook-db";
export const DATABASE_SCHEMA_VERSION = 29;

export interface AppMetaRecord {
  key: "databaseCreatedAt" | "schemaVersion" | "lastBackupAt" | "lastBackupCompanyId" | "activeBusinessProfileId" | "restoreRecoveryJournal";
  value: string;
  updatedAt: string;
}

export interface DatabaseReadiness {
  databaseName: string;
  schemaVersion: number;
  initializedAt: string;
}

export class TallybookDB extends Dexie {
  appMeta!: Table<AppMetaRecord, AppMetaRecord["key"]>;
  businessProfiles!: Table<BusinessProfile, BusinessProfile["id"]>;
  categories!: Table<ProductCategory, ProductCategory["id"]>;
  products!: Table<Product, Product["id"]>;
  inventoryMovements!: Table<InventoryMovement, InventoryMovement["id"]>;
  inventoryCostEvents!: Table<import("@/features/inventory/costLedger").InventoryCostEvent, string>;
  customers!: Table<Customer, Customer["id"]>;
  sales!: Table<Sale, Sale["id"]>;
  saleLines!: Table<SaleLine, SaleLine["id"]>;
  payments!: Table<Payment, Payment["id"]>;
  receipts!: Table<Receipt, Receipt["id"]>;
  customerActivities!: Table<CustomerActivity, CustomerActivity["id"]>;
  repayments!: Table<DebtRepayment, DebtRepayment["id"]>;
  mobileMoneyProviders!: Table<MobileMoneyProvider, MobileMoneyProvider["id"]>;
  suppliers!: Table<Supplier, Supplier["id"]>;
  purchases!: Table<Purchase, Purchase["id"]>;
  purchaseLines!: Table<PurchaseLine, PurchaseLine["id"]>;
  supplierPayableEntries!: Table<import("@/features/purchases/supplierPayables.ts").SupplierPayableEntry, string>;
  expenses!: Table<Expense, Expense["id"]>;
  /** Device-local log of what the Assistant saved. Not part of backups. */
  assistantAudit!: Table<AssistantAuditEntry, AssistantAuditEntry["id"]>;
  saleReversals!: Table<import("@/features/assistant/reversals").SaleReversal, string>;
  cashPartialReturns!: Table<import("@/features/sales/cashPartialReturnPosting").CashPartialSaleReturn, string>;
  stockCountSessions!: Table<import("@/features/inventory/stage2Inventory").StockCountSession, string>;
  inventoryBatches!: Table<import("@/features/inventory/stage2Inventory").InventoryBatch, string>;
  quotations!: Table<import("@/features/customers/quotations").Quotation, string>;
  customerBenefits!: Table<import("@/features/customers/customerBenefits").CustomerBenefitEntry, string>;
  customerPolicies!: Table<import("@/features/customers/customerBenefits").CustomerPolicy, string>;
  staffMembers!: Table<import("@/features/staff/staff").StaffMember, string>;
  staffShifts!: Table<import("@/features/staff/staff").StaffShift, string>;
  staffAudits!: Table<import("@/features/staff/staff").StaffAudit, string>;
  walletTransfers!: Table<import("@/features/customers/walletTransfers").WalletTransfer, string>;
  syncConsents!: Table<import("@/features/sync/syncFoundation").SyncConsent, string>;
  syncOutbox!: Table<import("@/features/sync/syncFoundation").SyncOutboxEvent, string>;
  syncConflicts!: Table<import("@/features/sync/reconciliation").SyncConflict, string>;
  syncDevices!: Table<import("@/features/sync/deviceRegistry").LocalSyncDevice, string>;

  storeLocations!: Table<import("@/features/stores/storeDirectory").StoreLocation, string>;
  storeAssignments!: Table<import("@/features/stores/storeDirectory").StoreAssignment, string>;
  storeTransferRequests!: Table<import("@/features/stores/storeTransfers").StoreTransferRequest, string>;
  storeStockObservations!: Table<import("@/features/stores/storeStockCounts").StoreStockObservation, string>;

  commerceOrders!: Table<import("@/features/commerce/commerce").CommerceOrder, string>;

  constructor(name = DATABASE_NAME) {
    super(name);
    this.version(1).stores({ appMeta: "key, updatedAt" });
    this.version(2).stores({
      appMeta: "key, updatedAt",
      businessProfiles: "id, name, country, currency, businessType, updatedAt",
    });
    this.version(3).stores({
      appMeta: "key, updatedAt",
      businessProfiles: "id, name, country, currency, businessType, updatedAt",
      categories: "id, businessProfileId, name, normalizedName, archivedAt, updatedAt",
      products: "id, businessProfileId, name, normalizedName, sku, categoryId, archivedAt, lowStockThreshold, updatedAt",
      inventoryMovements: "id, businessProfileId, productId, createdAt, movementType, resultingQuantity",
    });
    this.version(4).stores({
      appMeta: "key, updatedAt",
      businessProfiles: "id, name, country, currency, businessType, updatedAt",
      categories: "id, businessProfileId, name, normalizedName, archivedAt, updatedAt",
      products: "id, businessProfileId, name, normalizedName, sku, categoryId, archivedAt, lowStockThreshold, updatedAt",
      inventoryMovements: "id, businessProfileId, productId, createdAt, movementType, resultingQuantity",
      customers: "id, businessProfileId, name, normalizedName, phone, status, archivedAt, updatedAt",
    });
    this.version(5).stores({
      appMeta: "key, updatedAt",
      businessProfiles: "id, name, country, currency, businessType, updatedAt",
      categories: "id, businessProfileId, name, normalizedName, archivedAt, updatedAt",
      products: "id, businessProfileId, name, normalizedName, sku, categoryId, archivedAt, lowStockThreshold, updatedAt",
      inventoryMovements: "id, businessProfileId, productId, createdAt, movementType, resultingQuantity",
      customers: "id, businessProfileId, name, normalizedName, phone, status, archivedAt, updatedAt",
      sales: "id, businessProfileId, customerId, receiptNumber, createdAt, outstandingMinor, paymentMethod",
      saleLines: "id, saleId, productId",
      payments: "id, saleId, customerId, createdAt, method",
      receipts: "id, saleId, receiptNumber, issuedAt",
      customerActivities: "id, customerId, saleId, createdAt, activityType",
    });
    this.version(6).stores({
      appMeta: "key, updatedAt",
      businessProfiles: "id, name, country, currency, businessType, updatedAt",
      categories: "id, businessProfileId, name, normalizedName, archivedAt, updatedAt",
      products: "id, businessProfileId, name, normalizedName, sku, categoryId, archivedAt, lowStockThreshold, updatedAt",
      inventoryMovements: "id, businessProfileId, productId, createdAt, movementType, resultingQuantity",
      customers: "id, businessProfileId, name, normalizedName, phone, status, archivedAt, updatedAt",
      sales: "id, businessProfileId, customerId, receiptNumber, createdAt, outstandingMinor, paymentMethod, &submissionKey",
      saleLines: "id, saleId, productId",
      payments: "id, saleId, customerId, createdAt, method",
      receipts: "id, saleId, receiptNumber, issuedAt",
      customerActivities: "id, customerId, saleId, createdAt, activityType",
    });
    this.version(7).stores({
      appMeta: "key, updatedAt",
      businessProfiles: "id, name, country, currency, businessType, updatedAt",
      categories: "id, businessProfileId, name, normalizedName, archivedAt, updatedAt",
      products: "id, businessProfileId, name, normalizedName, sku, categoryId, archivedAt, lowStockThreshold, updatedAt",
      inventoryMovements: "id, businessProfileId, productId, createdAt, movementType, resultingQuantity",
      customers: "id, businessProfileId, name, normalizedName, phone, status, archivedAt, updatedAt",
      sales: "id, businessProfileId, customerId, receiptNumber, createdAt, outstandingMinor, paymentMethod, &submissionKey",
      saleLines: "id, saleId, productId",
      payments: "id, saleId, customerId, createdAt, method",
      receipts: "id, saleId, receiptNumber, issuedAt",
      customerActivities: "id, customerId, saleId, createdAt, activityType",
      repayments: "id, businessProfileId, customerId, createdAt, method, &submissionKey",
    });
    this.version(8).stores({
      appMeta: "key, updatedAt",
      businessProfiles: "id, name, country, currency, businessType, updatedAt",
      categories: "id, businessProfileId, name, normalizedName, archivedAt, updatedAt",
      products: "id, businessProfileId, name, normalizedName, sku, categoryId, archivedAt, lowStockThreshold, updatedAt",
      inventoryMovements: "id, businessProfileId, productId, createdAt, movementType, resultingQuantity",
      customers: "id, businessProfileId, name, normalizedName, phone, status, archivedAt, updatedAt",
      sales: "id, businessProfileId, customerId, receiptNumber, createdAt, outstandingMinor, paymentMethod, &submissionKey",
      saleLines: "id, saleId, productId",
      payments: "id, saleId, customerId, createdAt, method",
      receipts: "id, saleId, receiptNumber, issuedAt",
      customerActivities: "id, customerId, saleId, createdAt, activityType",
      repayments: "id, businessProfileId, customerId, createdAt, method, &submissionKey",
      mobileMoneyProviders: "id, businessProfileId, normalizedName, updatedAt",
    });
    this.version(9).stores({
      appMeta: "key, updatedAt",
      businessProfiles: "id, name, country, currency, businessType, updatedAt",
      categories: "id, businessProfileId, name, normalizedName, archivedAt, updatedAt",
      products: "id, businessProfileId, name, normalizedName, sku, categoryId, archivedAt, lowStockThreshold, updatedAt",
      inventoryMovements: "id, businessProfileId, productId, createdAt, movementType, resultingQuantity, purchaseId",
      customers: "id, businessProfileId, name, normalizedName, phone, status, archivedAt, updatedAt",
      sales: "id, businessProfileId, customerId, receiptNumber, createdAt, outstandingMinor, paymentMethod, &submissionKey",
      saleLines: "id, saleId, productId",
      payments: "id, saleId, customerId, createdAt, method",
      receipts: "id, saleId, receiptNumber, issuedAt",
      customerActivities: "id, customerId, saleId, createdAt, activityType",
      repayments: "id, businessProfileId, customerId, createdAt, method, &submissionKey",
      mobileMoneyProviders: "id, businessProfileId, normalizedName, updatedAt",
      suppliers: "id, businessProfileId, normalizedName, archivedAt, updatedAt",
      purchases: "id, businessProfileId, supplierId, purchaseDate, createdAt, &submissionKey",
      purchaseLines: "id, purchaseId, productId",
    });
    this.version(10).stores({
      appMeta: "key, updatedAt",
      businessProfiles: "id, name, country, currency, businessType, updatedAt",
      categories: "id, businessProfileId, name, normalizedName, archivedAt, updatedAt",
      products: "id, businessProfileId, name, normalizedName, sku, categoryId, archivedAt, lowStockThreshold, updatedAt",
      inventoryMovements: "id, businessProfileId, productId, createdAt, movementType, resultingQuantity, purchaseId",
      customers: "id, businessProfileId, name, normalizedName, phone, status, archivedAt, updatedAt",
      sales: "id, businessProfileId, customerId, receiptNumber, createdAt, outstandingMinor, paymentMethod, &submissionKey",
      saleLines: "id, saleId, productId",
      payments: "id, saleId, customerId, createdAt, method",
      receipts: "id, saleId, receiptNumber, issuedAt",
      customerActivities: "id, customerId, saleId, createdAt, activityType",
      repayments: "id, businessProfileId, customerId, createdAt, method, &submissionKey",
      mobileMoneyProviders: "id, businessProfileId, normalizedName, updatedAt",
      suppliers: "id, businessProfileId, normalizedName, archivedAt, updatedAt",
      purchases: "id, businessProfileId, supplierId, purchaseDate, createdAt, &submissionKey",
      purchaseLines: "id, purchaseId, productId",
      expenses: "id, businessProfileId, expenseDate, category, createdAt, &submissionKey",
    });
    this.version(11).stores({
      appMeta: "key, updatedAt",
      businessProfiles: "id, name, country, currency, businessType, updatedAt",
      categories: "id, businessProfileId, name, normalizedName, archivedAt, updatedAt",
      products: "id, businessProfileId, name, normalizedName, sku, categoryId, archivedAt, lowStockThreshold, updatedAt",
      inventoryMovements: "id, businessProfileId, productId, createdAt, movementType, resultingQuantity, purchaseId",
      customers: "id, businessProfileId, name, normalizedName, phone, status, archivedAt, updatedAt",
      sales: "id, businessProfileId, customerId, receiptNumber, createdAt, outstandingMinor, paymentMethod, &submissionKey",
      saleLines: "id, saleId, productId, businessProfileId",
      payments: "id, saleId, customerId, createdAt, method, businessProfileId",
      receipts: "id, saleId, receiptNumber, issuedAt, businessProfileId",
      customerActivities: "id, customerId, saleId, createdAt, activityType, businessProfileId",
      repayments: "id, businessProfileId, customerId, createdAt, method, &submissionKey",
      mobileMoneyProviders: "id, businessProfileId, normalizedName, updatedAt",
      suppliers: "id, businessProfileId, normalizedName, archivedAt, updatedAt",
      purchases: "id, businessProfileId, supplierId, purchaseDate, createdAt, &submissionKey",
      purchaseLines: "id, purchaseId, productId, businessProfileId",
      expenses: "id, businessProfileId, expenseDate, category, createdAt, &submissionKey",
    }).upgrade(async (transaction) => {
      const sales = transaction.table("sales");
      const customers = transaction.table("customers");
      const purchases = transaction.table("purchases");
      const saleLines = transaction.table("saleLines");
      const payments = transaction.table("payments");
      const receipts = transaction.table("receipts");
      const activities = transaction.table("customerActivities");
      const purchaseLines = transaction.table("purchaseLines");

      for (const line of await saleLines.toArray()) {
        const sale = await sales.get(line.saleId);
        if (sale?.businessProfileId) await saleLines.put({ ...line, businessProfileId: sale.businessProfileId });
      }
      for (const payment of await payments.toArray()) {
        const sale = await sales.get(payment.saleId);
        if (sale?.businessProfileId) await payments.put({ ...payment, businessProfileId: sale.businessProfileId });
      }
      for (const receipt of await receipts.toArray()) {
        const sale = await sales.get(receipt.saleId);
        if (sale?.businessProfileId) await receipts.put({ ...receipt, businessProfileId: sale.businessProfileId });
      }
      for (const activity of await activities.toArray()) {
        const customer = await customers.get(activity.customerId);
        if (customer?.businessProfileId) await activities.put({ ...activity, businessProfileId: customer.businessProfileId });
      }
      for (const line of await purchaseLines.toArray()) {
        const purchase = await purchases.get(line.purchaseId);
        if (purchase?.businessProfileId) await purchaseLines.put({ ...line, businessProfileId: purchase.businessProfileId });
      }
    });
    this.version(12).stores({ saleReversals: "id, businessProfileId, originalSaleId, customerId, createdAt, &submissionKey" });
    // v13: adds the Assistant activity log. A new, empty table: no existing record is touched.
    this.version(13).stores({ assistantAudit: "id, businessProfileId, createdAt, action" });
    this.version(14).stores({
      stockCountSessions: "id, businessProfileId, status, updatedAt",
      inventoryBatches: "id, businessProfileId, productId, expiryDate, createdAt",
    });
    this.version(15).stores({ quotations: "id, businessProfileId, customerId, status, createdAt" });
    this.version(16).stores({ customerBenefits: "id, businessProfileId, customerId, kind, createdAt, &submissionKey", customerPolicies: "id, businessProfileId, customerId" });
    this.version(17).stores({ walletTransfers: "id, businessProfileId, customerId, kind, createdAt, &submissionKey" });
    this.version(18).stores({ staffMembers: "id, businessProfileId, role, createdAt", staffShifts: "id, businessProfileId, staffId, openedAt, closedAt", staffAudits: "id, businessProfileId, staffId, action, createdAt" });
    this.version(19).stores({ syncConsents: "businessProfileId, enabled, updatedAt", syncOutbox: "id, businessProfileId, [businessProfileId+operationId], [businessProfileId+status], createdAt, status" });
    this.version(20).stores({ syncDevices: "id, businessProfileId, [businessProfileId+status], registeredAt" });
    this.version(21).stores({ syncConflicts: "id, businessProfileId, [businessProfileId+status], eventId, detectedAt" });
    this.version(22).stores({
      storeLocations: "id, businessProfileId, [businessProfileId+normalizedName], [businessProfileId+status]",
      storeAssignments: "id, businessProfileId, staffId, storeId, &[businessProfileId+staffId+storeId]",
    });
    // v23 append-only physical counts by store; intentionally does not alter company stock or financial ledgers.
    this.version(23).stores({
      storeStockObservations: "id, businessProfileId, storeId, productId, [businessProfileId+storeId], observedAt",
    });
    // v24 transfer intentions only; never posts stock movements or sales.
    this.version(24).stores({ storeTransferRequests: "id, businessProfileId, sourceStoreId, destinationStoreId, status, createdAt, [businessProfileId+status]" });
    this.version(25).stores({ commerceOrders: "id, businessProfileId, status, createdAt, [businessProfileId+status]" });
    // Immutable evidence from this version onward. Legacy costs are never inferred.
    this.version(26).stores({ inventoryCostEvents: "id, businessProfileId, productId, [businessProfileId+productId], &[businessProfileId+productId+sequence], &[businessProfileId+sourceId], saleId, purchaseId, createdAt" });
    // Optional, explicitly attested supplier liability evidence. Historical purchases remain unclassified.
    this.version(27).stores({ supplierPayableEntries: "id, businessProfileId, purchaseId, supplierId, kind, createdAt, &[businessProfileId+submissionKey]" });
    // v28: strictly limited, immutable, offline cash partial-return journal.
    this.version(28).stores({ cashPartialReturns: "id, businessProfileId, originalSaleId, createdAt, &[originalSaleId+returnSequence], &[businessProfileId+submissionKey]" });
    // v29: index optional batch-to-purchase/cost provenance; legacy batch rows remain unchanged.
    this.version(29).stores({
      purchaseLines: "id, purchaseId, productId, businessProfileId, batchId",
      inventoryBatches: "id, businessProfileId, productId, expiryDate, createdAt, receiptCostEventId",
      inventoryCostEvents: "id, businessProfileId, productId, [businessProfileId+productId], &[businessProfileId+productId+sequence], &[businessProfileId+sourceId], saleId, purchaseId, batchId, createdAt",
    });
  }
}

export const db = new TallybookDB();

export async function initializeDatabase(database: TallybookDB = db): Promise<DatabaseReadiness> {
  if (typeof indexedDB === "undefined") {
    throw new Error("This browser does not provide the local database required by Tallybook.");
  }

  await database.open();
  const initializedAt = new Date().toISOString();

  await database.transaction("rw", database.appMeta, async () => {
    const createdRecord = await database.appMeta.get("databaseCreatedAt");
    if (!createdRecord) {
      await database.appMeta.put({ key: "databaseCreatedAt", value: initializedAt, updatedAt: initializedAt });
    }
    await database.appMeta.put({ key: "schemaVersion", value: String(DATABASE_SCHEMA_VERSION), updatedAt: initializedAt });
  });

  const activeRecord = await database.appMeta.get("activeBusinessProfileId");
  const activeId = activeRecord?.value ?? (await database.businessProfiles.get("primary"))?.id;
  if (activeId && activeId !== activeRecord?.value) await database.appMeta.put({ key: "activeBusinessProfileId", value: activeId, updatedAt: initializedAt });
  if (activeId) await loadActiveBusinessProfileId(database);
  const created = await database.appMeta.get("databaseCreatedAt");
  return { databaseName: database.name, schemaVersion: DATABASE_SCHEMA_VERSION, initializedAt: created?.value ?? initializedAt };
}
