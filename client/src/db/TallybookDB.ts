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
export const DATABASE_SCHEMA_VERSION = 39;

export interface AppMetaRecord {
  key: "databaseCreatedAt" | "schemaVersion" | "lastBackupAt" | "lastBackupCompanyId" | "activeBusinessProfileId" | "restoreRecoveryJournal" | "verifiedBackupReceiptV2";
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
  noSaleEvents!: Table<import("@/features/drawer/noSaleEvent.ts").NoSaleEvent, string>;
  walletTransfers!: Table<import("@/features/customers/walletTransfers").WalletTransfer, string>;
  syncConsents!: Table<import("@/features/sync/syncFoundation").SyncConsent, string>;
  syncOutbox!: Table<import("@/features/sync/syncFoundation").SyncOutboxEvent, string>;
  centralSaleEvents!: Table<import("@/features/sync/centralSaleEvent").CentralSaleEvent, string>;
  centralOperationalEvents!: Table<import("@/features/sync/centralOperationalEvent").CentralOperationalEvent, string>;
  qaSaleClaimInbox!: Table<import("@/features/sync/qaSaleClaimInbox").QaSaleClaimRecord, string>;
  qaSaleClaimCursors!: Table<import("@/features/sync/qaSaleClaimInbox").QaSaleClaimCursor, string>;
  syncConflicts!: Table<import("@/features/sync/reconciliation").SyncConflict, string>;
  syncDevices!: Table<import("@/features/sync/deviceRegistry").LocalSyncDevice, string>;
  syncReplicaOutbox!: Table<import("@/features/sync/run14LocalRelay").Run14QueuedEnvelope, string>;
  syncReplicaInbox!: Table<import("@/features/sync/run14LocalRelay").Run14InboxCopy, string>;
  syncReplicaCursors!: Table<import("@/features/sync/run14LocalRelay").Run14Cursor, string>;
  syncReplicaConflicts!: Table<import("@/features/sync/run14RelayTransport").Run14RelayConflict, string>;
  paymentSandboxIntents!: Table<import("@/features/payments/run15MockContract.mjs").Run15MockIntent, string>;
  paymentSandboxEvents!: Table<import("@/features/payments/run15MockContract.mjs").Run15MockEvent, string>;

  storeLocations!: Table<import("@/features/stores/storeDirectory").StoreLocation, string>;
  storeAssignments!: Table<import("@/features/stores/storeDirectory").StoreAssignment, string>;
  storeTransferRequests!: Table<import("@/features/stores/storeTransfers").StoreTransferRequest, string>;
  storeStockObservations!: Table<import("@/features/stores/storeStockCounts").StoreStockObservation, string>;
  storeStockModes!: Table<import("@/features/stores/storeStockLedger").StoreStockMode, string>;
  storeStockEntries!: Table<import("@/features/stores/storeStockLedger").StoreStockEntry, string>;

  commerceOrders!: Table<import("@/features/commerce/commerce").CommerceOrder, string>;
  commerceHolds!: Table<import("@/features/commerce/run16Rules.mjs").Run16CommerceHold, string>;
  commerceDeliveryEvents!: Table<import("@/features/commerce/run16Rules.mjs").Run16OrderEvent, string>;
  run17ReviewEvents!: Table<import("@/features/insights/run17ReviewAudit.mjs").Run17ReviewEvent, string>;

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
    // Run 13: migration adds tables only; no historical store allocations are inferred.
    this.version(29).stores({
      storeStockModes: "businessProfileId, activatedAt", storeStockEntries: "id, businessProfileId, productId, storeId, kind, sourceId, transferId, createdAt, &[businessProfileId+submissionKey], [businessProfileId+productId], &[businessProfileId+productId+sequence]", storeTransferRequests: "id, businessProfileId, sourceStoreId, destinationStoreId, status, createdAt, [businessProfileId+status], &[businessProfileId+submissionKey], &[businessProfileId+dispatchKey], &[businessProfileId+completionKey], &[businessProfileId+returnProofKey], &[businessProfileId+reversesRequestId]",
      purchaseLines: "id, purchaseId, productId, businessProfileId, batchId",
      inventoryBatches: "id, businessProfileId, productId, expiryDate, createdAt, receiptCostEventId",
      inventoryCostEvents: "id, businessProfileId, productId, [businessProfileId+productId], &[businessProfileId+productId+sequence], &[businessProfileId+sourceId], saleId, purchaseId, batchId, createdAt"
    });
    // v30: quarantined, independently encrypted, opt-in replica envelopes only.
    this.version(30).stores({
      noSaleEvents: "id, businessProfileId, storeId, staffId, shiftId, createdAt, &[businessProfileId+operationKey]",
      syncReplicaOutbox:"id, businessProfileId, deviceId, operationId, status, [businessProfileId+status], &[businessProfileId+deviceId+sequence], &[businessProfileId+operationId]",
      syncReplicaInbox:"id, businessProfileId, serverCursor, receivedAt, &[businessProfileId+serverCursor]",
      syncReplicaCursors:"businessProfileId, updatedAt",
      syncReplicaConflicts:"id, businessProfileId, eventId, status, detectedAt, [businessProfileId+status]"
    });
    // v31: simulated-only merchant-side payment QA evidence. NEVER receipts or cash.
    this.version(31).stores({
      paymentSandboxIntents:"id, businessProfileId, submissionKey, status, createdAt, &[businessProfileId+submissionKey]",
      paymentSandboxEvents:"id, businessProfileId, intentId, createdAt, [businessProfileId+intentId], &[businessProfileId+intentId+sequence]"
    });
    // Run 16: never reassign historical orders or claim prior stock reservations.
    this.version(32).stores({
      commerceHolds:"id, businessProfileId, orderId, productId, storeId, status, expiresAt, &[businessProfileId+submissionKey], &[businessProfileId+orderId+productId], [businessProfileId+productId]",
      commerceDeliveryEvents:"id, businessProfileId, orderId, action, createdAt, &[businessProfileId+submissionKey], [businessProfileId+orderId], &[businessProfileId+orderId+sequence]"
    });
    // Run 17: append-only human advisory-review evidence, never retail mutation.
    this.version(33).stores({
      run17ReviewEvents:"id, businessProfileId, findingId, staffId, action, createdAt, &[businessProfileId+submissionKey], [businessProfileId+findingId], &[businessProfileId+findingId+sequence]"
    });
    // Stage 22: financial retry keys are unique PER COMPANY, not globally.
    // Index-only upgrade preserves immutable sales, repayments, purchases,
    // expenses, reversals, wallet transfers and benefit rows without rewriting
    // any money, currency snapshots, supplier or customer relationships.
    this.version(34).stores({
      walletTransfers:"id, businessProfileId, customerId, kind, createdAt, submissionKey, &[businessProfileId+submissionKey]",
      sales:"id, businessProfileId, customerId, receiptNumber, createdAt, outstandingMinor, paymentMethod, submissionKey, &[businessProfileId+submissionKey]",
      repayments:"id, businessProfileId, customerId, createdAt, method, submissionKey, &[businessProfileId+submissionKey]",
      purchases:"id, businessProfileId, supplierId, purchaseDate, createdAt, submissionKey, &[businessProfileId+submissionKey]",
      expenses:"id, businessProfileId, expenseDate, category, createdAt, submissionKey, &[businessProfileId+submissionKey]",
      saleReversals:"id, businessProfileId, originalSaleId, customerId, createdAt, submissionKey, &[businessProfileId+submissionKey]",
      customerBenefits:"id, businessProfileId, customerId, kind, createdAt, submissionKey, &[businessProfileId+submissionKey]"
    });
    // Reconcile the local v29/v30 line with the cloud v29-v34 line. Add indexes
    // and the append-only drawer table without rewriting historical rows.
    this.version(35).stores({
      purchaseLines: "id, purchaseId, productId, businessProfileId, batchId",
      inventoryBatches: "id, businessProfileId, productId, expiryDate, createdAt, receiptCostEventId",
      inventoryCostEvents: "id, businessProfileId, productId, [businessProfileId+productId], &[businessProfileId+productId+sequence], &[businessProfileId+sourceId], saleId, purchaseId, batchId, createdAt",
      noSaleEvents: "id, businessProfileId, storeId, staffId, shiftId, createdAt, &[businessProfileId+operationKey]"
    });
    // A company that has ever enrolled local staff must not silently return to
    // legacy open access if its staff rows are later missing. Financial rows are
    // untouched; only the owning business profile gains a durable marker.
    this.version(36).stores({}).upgrade(async transaction => {
      const members = await transaction.table("staffMembers").toArray() as Array<{ businessProfileId?: string }>;
      for (const companyId of new Set(members.map(member => member.businessProfileId).filter((id): id is string => typeof id === "string" && !!id))) {
        const profile = await transaction.table("businessProfiles").get(companyId);
        if (profile && profile.staffGovernanceEnabled !== true)
          await transaction.table("businessProfiles").update(companyId, { staffGovernanceEnabled: true });
      }
    });
    // v37 is additive. Historical sales keep unknown provenance; only newly
    // committed checkouts write full local event evidence atomically.
    this.version(37).stores({ centralSaleEvents: 'id, businessProfileId, &[businessProfileId+operationId], entityId, createdAt' });
    // v38 is additive. It does not manufacture refund evidence for historical rows.
    this.version(38).stores({ centralOperationalEvents: 'id, businessProfileId, &[businessProfileId+operationId], entityId, kind, createdAt' });
    // v39 only stores remote QA claims in device-local quarantine. No historic
    // ledger row is rewritten and no cloud claim is posted as a sale.
    this.version(39).stores({
      qaSaleClaimInbox: 'id, businessProfileId, cloudCompanyId, receivedAtUtc, &[businessProfileId+cloudCompanyId+operationId]',
      qaSaleClaimCursors: 'id, businessProfileId, cloudCompanyId, deviceId'
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
