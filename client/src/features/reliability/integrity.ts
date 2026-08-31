/** Stage 11 integrity audit: inspect local record relationships without mutating owner data. */
import { DATABASE_SCHEMA_VERSION, db, type TallybookDB } from "@/db/TallybookDB";
import { expenseCategories, localExpenseDate } from "@/features/expenses/expenses";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";

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
  | "movement-orphan"
  | "purchase-supplier-orphan"
  | "purchase-line-orphan"
  | "purchase-line-total"
  | "purchase-total"
  | "purchase-movement-missing"
  | "purchase-movement-orphan"
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
  return database.transaction("r", [database.appMeta, database.businessProfiles, database.products, database.inventoryMovements, database.customers, database.sales, database.saleLines, database.payments, database.receipts, database.customerActivities, database.repayments, database.mobileMoneyProviders, database.suppliers, database.purchases, database.purchaseLines, database.expenses], async () => {
    const [schemaMeta, allBusinesses, allProducts, allCustomers, allSales, allLines, allPayments, allReceipts, allActivities, allRepayments, allMovements, allMobileMoneyProviders, allSuppliers, allPurchases, allPurchaseLines, allExpenses] = await Promise.all([
      database.appMeta.get("schemaVersion"), database.businessProfiles.toArray(), database.products.toArray(), database.customers.toArray(), database.sales.toArray(), database.saleLines.toArray(), database.payments.toArray(), database.receipts.toArray(), database.customerActivities.toArray(), database.repayments.toArray(), database.inventoryMovements.toArray(), database.mobileMoneyProviders.toArray(), database.suppliers.toArray(), database.purchases.toArray(), database.purchaseLines.toArray(), database.expenses.toArray(),
    ]);
    const activeId = getActiveBusinessProfileId();
    const scoped = <T extends { businessProfileId: string }>(records: T[]) => records.filter((record) => record.businessProfileId === activeId);
    const businesses = allBusinesses.filter((business) => business.id === activeId);
    const products = scoped(allProducts); const customers = scoped(allCustomers); const sales = scoped(allSales); const lines = scoped(allLines); const payments = scoped(allPayments); const receipts = scoped(allReceipts); const activities = scoped(allActivities); const repayments = scoped(allRepayments); const movements = scoped(allMovements); const mobileMoneyProviders = scoped(allMobileMoneyProviders); const suppliers = scoped(allSuppliers); const purchases = scoped(allPurchases); const purchaseLines = scoped(allPurchaseLines); const expenses = scoped(allExpenses);
    const issues: IntegrityIssue[] = [];
    const saleIds = new Set(sales.map((sale) => sale.id)); const productIds = new Set(products.map((product) => product.id)); const customerIds = new Set(customers.map((customer) => customer.id)); const mobileMoneyProviderIds = new Set(mobileMoneyProviders.map((provider) => provider.id)); const supplierIds = new Set(suppliers.map((supplier) => supplier.id)); const purchaseIds = new Set(purchases.map((purchase) => purchase.id)); const businessIds = new Set(businesses.map((business) => business.id)); const expenseSubmissionKeys = new Set<string>();
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
      if (sale.totalMinor !== sale.subtotalMinor - sale.discountMinor) issues.push(issue("sale-total", `Sale ${sale.receiptNumber} total does not match subtotal minus discount.`, sale.id));
      if (sale.outstandingMinor !== sale.totalMinor - sale.amountPaidMinor || sale.outstandingMinor < 0) issues.push(issue("sale-outstanding", `Sale ${sale.receiptNumber} has an inconsistent outstanding amount.`, sale.id));
      if (paid !== sale.amountPaidMinor) issues.push(issue("payment-amount", `Sale ${sale.receiptNumber} payment records do not match its saved amount paid.`, sale.id));
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
    for (const purchase of purchases) { const purchaseRecordLines = linesByPurchase.get(purchase.id) ?? []; const purchaseMovements = movementsByPurchase.get(purchase.id) ?? []; if (!supplierIds.has(purchase.supplierId)) issues.push(issue("purchase-supplier-orphan", "A purchase refers to a missing supplier record.", purchase.id)); if (!purchaseRecordLines.length) issues.push(issue("purchase-total", "A purchase has no saved line records.", purchase.id)); if (purchaseRecordLines.reduce((sum, line) => sum + line.lineTotalMinor, 0) !== purchase.totalCostMinor) issues.push(issue("purchase-total", "A purchase total does not match its saved purchase lines.", purchase.id)); for (const line of purchaseRecordLines) { const linkedMovement = purchaseMovements.find((movement) => movement.productId === line.productId && movement.movementType === "purchase" && movement.quantityDelta === line.quantity); if (!linkedMovement) issues.push(issue("purchase-movement-missing", "A purchase line is missing its matching stock-in movement.", line.id)); } }
    for (const purchaseLine of purchaseLines) { if (!purchaseIds.has(purchaseLine.purchaseId) || !productIds.has(purchaseLine.productId)) issues.push(issue("purchase-line-orphan", "A purchase line refers to a missing purchase or product record.", purchaseLine.id)); if (!Number.isInteger(purchaseLine.quantity) || purchaseLine.quantity <= 0 || !Number.isInteger(purchaseLine.unitCostMinor) || purchaseLine.unitCostMinor < 0 || purchaseLine.lineTotalMinor !== purchaseLine.quantity * purchaseLine.unitCostMinor) issues.push(issue("purchase-line-total", "A purchase line has an invalid quantity or cost total.", purchaseLine.id)); }
    for (const movement of movements) { if (!productIds.has(movement.productId)) issues.push(issue("movement-orphan", "An inventory movement refers to a missing product record.", movement.id)); if (movement.purchaseId && (!purchaseIds.has(movement.purchaseId) || movement.movementType !== "purchase" || movement.quantityDelta <= 0)) issues.push(issue("purchase-movement-orphan", "A purchase stock movement refers to a missing purchase or has invalid stock-in details.", movement.id)); }
    for (const expense of expenses) { if (!businessIds.has(expense.businessProfileId)) issues.push(issue("expense-business-profile-orphan", "An expense refers to a missing business profile.", expense.id)); if (!(expenseCategories as readonly string[]).includes(expense.category)) issues.push(issue("expense-category", "An expense has an invalid category.", expense.id)); if (!Number.isInteger(expense.amountMinor) || expense.amountMinor <= 0) issues.push(issue("expense-amount", "An expense has an invalid saved amount.", expense.id)); if (!/^\d{4}-\d{2}-\d{2}$/.test(expense.expenseDate) || expense.expenseDate > localExpenseDate()) issues.push(issue("expense-date", "An expense has an invalid or future saved date.", expense.id)); if (Number.isNaN(Date.parse(expense.createdAt))) issues.push(issue("expense-created-at", "An expense is missing a valid saved creation time.", expense.id)); if (expenseSubmissionKeys.has(expense.submissionKey) || expense.submissionKey.length < 8) issues.push(issue("expense-submission-key", "An expense has a repeated or invalid save key.", expense.id)); expenseSubmissionKeys.add(expense.submissionKey); }
    return { checkedAt: new Date().toISOString(), recordsChecked: businesses.length + products.length + customers.length + sales.length + lines.length + payments.length + receipts.length + activities.length + repayments.length + movements.length + mobileMoneyProviders.length + suppliers.length + purchases.length + purchaseLines.length + expenses.length, issues, status: issues.length ? "attention" : "clear" };
  });
}
