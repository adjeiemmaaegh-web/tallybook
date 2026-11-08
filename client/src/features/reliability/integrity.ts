/** Stage 11 integrity audit: inspect local record relationships without mutating owner data. */
import { validateTaxSnapshot } from "@/features/sales/tax";
import { validateGhanaVatLineEvidence } from "@/features/sales/ghanaVat.mjs";
import { DATABASE_SCHEMA_VERSION, db, type TallybookDB } from "@/db/TallybookDB";
import { expenseCategories, localExpenseDate } from "@/features/expenses/expenses";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import { reconcileSupplierPayables } from "@/features/purchases/supplierPayables.mjs";
import { reconcilePrepaidLiability } from "@/features/reports/prepaidLiabilityReconciliation.mjs";
import { auditReceivableRecords } from "./receivableAudit.mjs";
import { auditStoreRecords } from "@/features/stores/storeIntegrity.mjs";
import { reconcileCashPartialReturns } from "@/features/sales/cashPartialReturn.mjs";
import { assertCashReturnLedgerLinks } from "@/features/sales/cashReturnStockLinks.mjs";
import type { InventoryBatch } from "@/features/inventory/stage2Inventory";

export type IntegrityIssueCode =
  | "business-profile-count"
  | "metadata-schema-version"
  | "sale-total"
  | "sale-outstanding"
  | "sale-line-orphan"
  | "sale-line-subtotal"
  | "sale-customer-orphan"
  | "payment-orphan"
  | "payment-amount"
  | "receipt-orphan"
  | "receipt-count"
  | "receipt-number"
  | "activity-orphan"
  | "repayment-orphan"
  | "repayment-amount"
  | "receivable-customer"
  | "receivable-sale"
  | "receivable-reversal"
  | "receivable-repayment"
  | "receivable-allocation"
  | "receivable-currency"
  | "receivable-balance"
  | "cash-partial-return-integrity"
  | "cash-partial-return-stock-integrity"
  | "movement-orphan"
  | "purchase-supplier-orphan"
  | "purchase-line-orphan"
  | "purchase-line-total"
  | "purchase-total"
  | "supplier-payable-integrity"
  | "prepaid-wallet-integrity"
  | "store-location-invalid"
  | "store-reference-invalid"
  | "store-assignment-invalid"
  | "store-observation-invalid"
  | "store-transfer-invalid"
  | "purchase-movement-missing"
  | "purchase-movement-orphan"
  | "inventory-batch-integrity"
  | "inventory-batch-cost-link"
  | "inventory-batch-allocation"
  | "mobile-money-provider-orphan"
  | "mobile-money-details"
  | "expense-business-profile-orphan"
  | "expense-category"
  | "expense-amount"
  | "expense-date"
  | "expense-created-at"
  | "expense-submission-key";

export interface IntegrityIssue { code: IntegrityIssueCode; recordId?: string; message: string; }
export interface IntegrityAudit { checkedAt: string; recordsChecked: number; issues: IntegrityIssue[]; status: "clear" | "attention"; }

const issue = (code: IntegrityIssueCode, message: string, recordId?: string): IntegrityIssue => ({ code, message, recordId });

export async function auditLocalIntegrity(database: TallybookDB = db): Promise<IntegrityAudit> {
  const activeId = getActiveBusinessProfileId();
  return database.transaction("r", [database.appMeta, database.businessProfiles, database.products, database.inventoryMovements, database.inventoryCostEvents, database.inventoryBatches, database.customers, database.sales, database.saleLines, database.payments, database.receipts, database.customerActivities, database.repayments, database.saleReversals, database.cashPartialReturns, database.mobileMoneyProviders, database.suppliers, database.purchases, database.purchaseLines, database.supplierPayableEntries, database.walletTransfers, database.customerBenefits, database.expenses, database.storeLocations, database.storeAssignments, database.storeStockObservations, database.storeTransferRequests, database.staffMembers], async () => {
    const [schemaMeta, allBusinesses, allProducts, allCustomers, allSales, allLines, allPayments, allReceipts, allActivities, allRepayments, allReversals, allCashPartialReturns, allMovements, allCostEvents, allBatches, allMobileMoneyProviders, allSuppliers, allPurchases, allPurchaseLines, allExpenses, allSupplierPayableEntries, allStores, allStoreAssignments, allStoreObservations, allStoreRequests, allStaffMembers, allWalletTransfers, allCustomerBenefits] = await Promise.all([
      database.appMeta.get("schemaVersion"), database.businessProfiles.toArray(), database.products.toArray(), database.customers.toArray(), database.sales.toArray(), database.saleLines.toArray(), database.payments.toArray(), database.receipts.toArray(), database.customerActivities.toArray(), database.repayments.toArray(), database.saleReversals.toArray(), database.cashPartialReturns.toArray(), database.inventoryMovements.toArray(), database.inventoryCostEvents.toArray(), database.inventoryBatches.toArray(), database.mobileMoneyProviders.toArray(), database.suppliers.toArray(), database.purchases.toArray(), database.purchaseLines.toArray(), database.expenses.toArray(), database.supplierPayableEntries.toArray(), database.storeLocations.toArray(), database.storeAssignments.toArray(), database.storeStockObservations.toArray(), database.storeTransferRequests.toArray(), database.staffMembers.toArray(), database.walletTransfers.toArray(), database.customerBenefits.toArray(),
    ]);
    if (getActiveBusinessProfileId() !== activeId) throw new Error("Company changed during integrity audit.");
    const scoped = <T extends { businessProfileId: string }>(records: T[]) => records.filter((record) => record.businessProfileId === activeId);
    const businesses = allBusinesses.filter((business) => business.id === activeId);
    const products = scoped(allProducts); const customers = scoped(allCustomers); const sales = scoped(allSales); const lines = scoped(allLines); const payments = scoped(allPayments); const receipts = scoped(allReceipts); const activities = scoped(allActivities); const repayments = scoped(allRepayments); const reversals = scoped(allReversals); const cashPartialReturns = scoped(allCashPartialReturns); const movements = scoped(allMovements); const costEvents = scoped(allCostEvents); const batches = scoped(allBatches); const mobileMoneyProviders = scoped(allMobileMoneyProviders); const suppliers = scoped(allSuppliers); const purchases = scoped(allPurchases); const purchaseLines = scoped(allPurchaseLines); const expenses = scoped(allExpenses); const supplierPayableEntries = scoped(allSupplierPayableEntries); const stores = scoped(allStores); const storeAssignments = scoped(allStoreAssignments); const storeObservations = scoped(allStoreObservations); const storeRequests = scoped(allStoreRequests); const staffMembers = scoped(allStaffMembers); const walletTransfers = scoped(allWalletTransfers); const customerBenefits = scoped(allCustomerBenefits);
    const issues: IntegrityIssue[] = [];
    const saleIds = new Set(sales.map((sale) => sale.id)); const productIds = new Set(products.map((product) => product.id)); const customerIds = new Set(customers.map((customer) => customer.id)); const mobileMoneyProviderIds = new Set(mobileMoneyProviders.map((provider) => provider.id)); const supplierIds = new Set(suppliers.map((supplier) => supplier.id)); const purchaseIds = new Set(purchases.map((purchase) => purchase.id)); const businessIds = new Set(businesses.map((business) => business.id)); const expenseSubmissionKeys = new Set<string>();
    const batchById = new Map(batches.map(batch => [batch.id, batch])); const costEventById = new Map(costEvents.map(event => [event.id, event]));
    const linesBySale = new Map<string, typeof lines>(); const paymentsBySale = new Map<string, typeof payments>(); const receiptsBySale = new Map<string, typeof receipts>(); const linesByPurchase = new Map<string, typeof purchaseLines>(); const movementsByPurchase = new Map<string, typeof movements>();
    for (const line of lines) linesBySale.set(line.saleId, [...(linesBySale.get(line.saleId) ?? []), line]);
    for (const payment of payments) paymentsBySale.set(payment.saleId, [...(paymentsBySale.get(payment.saleId) ?? []), payment]);
    for (const receipt of receipts) receiptsBySale.set(receipt.saleId, [...(receiptsBySale.get(receipt.saleId) ?? []), receipt]);
    for (const purchaseLine of purchaseLines) linesByPurchase.set(purchaseLine.purchaseId, [...(linesByPurchase.get(purchaseLine.purchaseId) ?? []), purchaseLine]);
    for (const movement of movements) if (movement.purchaseId) movementsByPurchase.set(movement.purchaseId, [...(movementsByPurchase.get(movement.purchaseId) ?? []), movement]);

    if (schemaMeta?.value !== String(DATABASE_SCHEMA_VERSION)) issues.push(issue("metadata-schema-version", "The local schema marker does not match the current app version. Reopen the app; if this remains, make a backup before seeking help."));

    for (const sale of sales) {
      const saleLines = linesBySale.get(sale.id) ?? []; const salePayments = paymentsBySale.get(sale.id) ?? []; const saleReceipts = receiptsBySale.get(sale.id) ?? [];
      const lineSubtotal = saleLines.reduce((sum, line) => sum + line.lineTotalMinor, 0); const paid = salePayments.reduce((sum, payment) => sum + payment.amountMinor, 0);
      if (!saleLines.length) issues.push(issue("sale-line-subtotal", `Sale ${sale.receiptNumber} has no saved line records.`, sale.id));
      if (lineSubtotal !== sale.subtotalMinor) issues.push(issue("sale-line-subtotal", `Sale ${sale.receiptNumber} line total does not match its saved subtotal.`, sale.id));
      try {
        validateTaxSnapshot(sale);
        validateGhanaVatLineEvidence(sale, saleLines);
        if (sale.totalMinor !== (sale.tax?.totalMinor ?? sale.subtotalMinor - sale.discountMinor)) throw new Error("total mismatch");
      } catch { issues.push(issue("sale-total", `Sale ${sale.receiptNumber} total does not reconcile with discounts and recorded tax.`, sale.id)); }
      if (sale.outstandingMinor !== sale.totalMinor - sale.amountPaidMinor || sale.outstandingMinor < 0) issues.push(issue("sale-outstanding", `Sale ${sale.receiptNumber} has an inconsistent outstanding amount.`, sale.id));
      if (paid !== sale.amountPaidMinor - (sale.walletAppliedMinor ?? 0)) issues.push(issue("payment-amount", `Sale ${sale.receiptNumber} payment records do not match its saved amount paid.`, sale.id));
      if (sale.customerId && !customerIds.has(sale.customerId)) issues.push(issue("sale-customer-orphan", `Sale ${sale.receiptNumber} refers to a missing customer record.`, sale.id));
      if (saleReceipts.length !== 1) issues.push(issue("receipt-count", `Sale ${sale.receiptNumber} has ${saleReceipts.length} receipt records; exactly one is expected.`, sale.id));
      if (saleReceipts.some((receipt) => receipt.receiptNumber !== sale.receiptNumber)) issues.push(issue("receipt-number", `A receipt number does not match sale ${sale.receiptNumber}.`, sale.id));
    }
    for (const line of lines) { if (!saleIds.has(line.saleId) || !productIds.has(line.productId) || line.lineTotalMinor !== line.quantity * line.unitPriceMinor) issues.push(issue("sale-line-orphan", `A sale line refers to a missing record or has an invalid line total.`, line.id)); }
    for (const payment of payments) {
      if (!saleIds.has(payment.saleId) || (payment.customerId && !customerIds.has(payment.customerId))) issues.push(issue("payment-orphan", "A payment refers to a missing sale or customer record.", payment.id));
      if (payment.method !== "mobile" && (payment.mobileMoneyProviderId || payment.mobileMoneyProviderName || payment.mobileMoneyReference)) issues.push(issue("mobile-money-details", "A non-Mobile Money payment contains Mobile Money details.", payment.id));
      if (payment.method === "mobile" && payment.mobileMoneyProviderId && (!mobileMoneyProviderIds.has(payment.mobileMoneyProviderId) || !payment.mobileMoneyProviderName)) issues.push(issue("mobile-money-provider-orphan", "A Mobile Money payment refers to a missing provider or lacks its saved provider name.", payment.id));
    }
    for (const receipt of receipts) { if (!saleIds.has(receipt.saleId)) issues.push(issue("receipt-orphan", "A receipt refers to a missing sale record.", receipt.id)); }
    for (const activity of activities) { if (!saleIds.has(activity.saleId) || !customerIds.has(activity.customerId)) issues.push(issue("activity-orphan", "A customer activity refers to a missing sale or customer record.", activity.id)); }
    for (const repayment of repayments) { if (!customerIds.has(repayment.customerId)) issues.push(issue("repayment-orphan", "A repayment refers to a missing customer record.", repayment.id)); if (!Number.isInteger(repayment.amountMinor) || repayment.amountMinor <= 0) issues.push(issue("repayment-amount", "A repayment has an invalid saved amount.", repayment.id)); }
    for (const finding of auditReceivableRecords(activeId, customers, sales, reversals, repayments)) {
      issues.push(issue(finding.code, "Customer receivable history needs review: stored debt, reversals, repayment allocations or currency evidence do not reconcile.", finding.recordId));
    }
    try { reconcileCashPartialReturns(sales, lines, payments, cashPartialReturns, reversals); }
    catch { issues.push(issue("cash-partial-return-integrity", "Saved partial cash-return quantity, tax or tender evidence does not reconcile; do not issue another refund.")); }
    try { assertCashReturnLedgerLinks(sales, lines, cashPartialReturns, movements, costEvents); }
    catch { issues.push(issue("cash-partial-return-stock-integrity", "Saved cash returns do not match original physical stock movements and FIFO restoration events; preserve the ledger and do not issue another refund.")); }
    for (const purchase of purchases) { const purchaseRecordLines = linesByPurchase.get(purchase.id) ?? []; const purchaseMovements = movementsByPurchase.get(purchase.id) ?? []; if (!supplierIds.has(purchase.supplierId)) issues.push(issue("purchase-supplier-orphan", "A purchase refers to a missing supplier record.", purchase.id)); if (!purchaseRecordLines.length) issues.push(issue("purchase-total", "A purchase has no saved line records.", purchase.id)); if (purchaseRecordLines.reduce((sum, line) => sum + line.lineTotalMinor, 0) !== purchase.totalCostMinor) issues.push(issue("purchase-total", "A purchase total does not match its saved purchase lines.", purchase.id)); for (const line of purchaseRecordLines) { const linkedMovement = purchaseMovements.find((movement) => movement.productId === line.productId && movement.movementType === "purchase" && movement.quantityDelta === line.quantity); if (!linkedMovement) issues.push(issue("purchase-movement-missing", "A purchase line is missing its matching stock-in movement.", line.id)); } }
    for (const purchaseLine of purchaseLines) { if (!purchaseIds.has(purchaseLine.purchaseId) || !productIds.has(purchaseLine.productId)) issues.push(issue("purchase-line-orphan", "A purchase line refers to a missing purchase or product record.", purchaseLine.id)); if (!Number.isInteger(purchaseLine.quantity) || purchaseLine.quantity <= 0 || !Number.isInteger(purchaseLine.unitCostMinor) || purchaseLine.unitCostMinor < 0 || purchaseLine.lineTotalMinor !== purchaseLine.quantity * purchaseLine.unitCostMinor) issues.push(issue("purchase-line-total", "A purchase line has an invalid quantity or cost total.", purchaseLine.id)); }
    for (const movement of movements) { if (!productIds.has(movement.productId)) issues.push(issue("movement-orphan", "An inventory movement refers to a missing product record.", movement.id)); if (movement.purchaseId && (!purchaseIds.has(movement.purchaseId) || movement.movementType !== "purchase" || movement.quantityDelta <= 0)) issues.push(issue("purchase-movement-orphan", "A purchase stock movement refers to a missing purchase or has invalid stock-in details.", movement.id)); }
    for (const batch of batches) {
      if (!productIds.has(batch.productId) || typeof batch.batchCode !== "string" || !batch.batchCode.trim() || !Number.isSafeInteger(batch.quantity) || batch.quantity < 0 || (batch.startingQuantity !== undefined && (!Number.isSafeInteger(batch.startingQuantity) || batch.startingQuantity <= 0 || batch.quantity > batch.startingQuantity))) issues.push(issue("inventory-batch-integrity", "An inventory batch has invalid product, code, or quantity evidence.", batch.id));
      if (batch.receiptCostEventId) {
        const event = costEventById.get(batch.receiptCostEventId); const linkedLine = purchaseLines.find(line => line.batchId === batch.id);
        if (!event || !linkedLine || event.kind !== "receipt" || event.batchId !== batch.id || event.productId !== batch.productId || event.purchaseId !== linkedLine.purchaseId || event.quantityDelta !== linkedLine.quantity || event.unitCostMinor !== linkedLine.unitCostMinor || event.quantityDelta !== batch.startingQuantity || linkedLine.batchCode !== batch.batchCode || linkedLine.expiryDate !== batch.expiryDate) issues.push(issue("inventory-batch-cost-link", "A batch receipt does not match its purchase line and immutable FIFO cost event.", batch.id));
      }
    }
    for (const event of costEvents) if (event.batchId) { const batch = batchById.get(event.batchId); if (!batch || batch.receiptCostEventId !== event.id) issues.push(issue("inventory-batch-cost-link", "A FIFO batch cost event refers to a missing or different physical batch.", event.id)); }
    for (const line of purchaseLines) if (line.batchId) { const batch = batchById.get(line.batchId); if (!batch || batch.productId !== line.productId || batch.businessProfileId !== activeId) issues.push(issue("inventory-batch-cost-link", "A purchase line refers to a missing or foreign batch.", line.id)); }
    for (const product of products) { const productBatches = batches.filter(batch => batch.productId === product.id); if (productBatches.length && productBatches.reduce((sum, batch) => sum + batch.quantity, 0) !== product.stockQuantity) issues.push(issue("inventory-batch-allocation", "Tracked batch quantities do not equal on-hand stock; sales remain blocked until reconciled.", product.id)); }
    for (const line of lines) if (line.batchAllocations !== undefined) {
      const allocations = line.batchAllocations; const total = Array.isArray(allocations) ? allocations.reduce((sum, allocation) => sum + allocation.quantity, 0) : NaN;
      if (!Array.isArray(allocations) || total !== line.quantity || allocations.some(allocation => !Number.isSafeInteger(allocation.quantity) || allocation.quantity <= 0 || batchById.get(allocation.batchId)?.productId !== line.productId)) issues.push(issue("inventory-batch-allocation", "A sale line's expiry-batch allocations do not reconcile with its product quantity.", line.id));
    }
    try {
      const purchasesById = new Map(purchases.map(purchase => [purchase.id, purchase]));
      for (const payable of supplierPayableEntries) {
        const purchase = purchasesById.get(payable.purchaseId);
        if (!purchase || !purchase.currency || payable.currency !== purchase.currency) throw new Error("Wrong supplier payable currency or purchase link.");
      }
      reconcileSupplierPayables(purchases, supplierPayableEntries);
    } catch { issues.push(issue("supplier-payable-integrity", "Supplier payable records cannot be reconciled safely; do not trust these liabilities.")); }
    try {
      reconcilePrepaidLiability({transfers:walletTransfers,benefits:customerBenefits,
        sales,reversals},businesses[0]?.currency);
    } catch {
      issues.push(issue("prepaid-wallet-integrity", "Prepaid transfers, wallet benefit entries, wallet sale spending or reversal credits do not reconcile. Do not rely on the stored prepaid liability."));
    }
    for (const finding of auditStoreRecords(activeId, stores, storeAssignments, storeObservations, storeRequests, products, staffMembers)) {
      issues.push(issue(finding.code, "Local store directory, assignment, observation or transfer request does not reconcile. Store observations and requests do not establish actual stock balances.", finding.recordId));
    }
    for (const expense of expenses) { if (!businessIds.has(expense.businessProfileId)) issues.push(issue("expense-business-profile-orphan", "An expense refers to a missing business profile.", expense.id)); if (!(expenseCategories as readonly string[]).includes(expense.category)) issues.push(issue("expense-category", "An expense has an invalid category.", expense.id)); if (!Number.isInteger(expense.amountMinor) || expense.amountMinor <= 0) issues.push(issue("expense-amount", "An expense has an invalid saved amount.", expense.id)); if (!/^\d{4}-\d{2}-\d{2}$/.test(expense.expenseDate) || expense.expenseDate > localExpenseDate()) issues.push(issue("expense-date", "An expense has an invalid or future saved date.", expense.id)); if (Number.isNaN(Date.parse(expense.createdAt))) issues.push(issue("expense-created-at", "An expense is missing a valid saved creation time.", expense.id)); if (expenseSubmissionKeys.has(expense.submissionKey) || expense.submissionKey.length < 8) issues.push(issue("expense-submission-key", "An expense has a repeated or invalid save key.", expense.id)); expenseSubmissionKeys.add(expense.submissionKey); }
    if (getActiveBusinessProfileId() !== activeId) throw new Error("Company changed during integrity audit.");
    return { checkedAt: new Date().toISOString(), recordsChecked: businesses.length + products.length + customers.length + sales.length + lines.length + payments.length + receipts.length + activities.length + repayments.length + reversals.length + cashPartialReturns.length + movements.length + costEvents.length + batches.length + mobileMoneyProviders.length + suppliers.length + purchases.length + purchaseLines.length + expenses.length + supplierPayableEntries.length + walletTransfers.length + customerBenefits.length + stores.length + storeAssignments.length + storeObservations.length + storeRequests.length + staffMembers.length, issues, status: issues.length ? "attention" : "clear" };
  });
}
