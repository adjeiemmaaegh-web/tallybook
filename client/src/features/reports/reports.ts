import { requirePermission } from "@/features/staff/staff";
import { businessDayKey, businessDayStart, businessDayEnd, shiftBusinessDay, businessDateLabel, businessWeekdayLabel } from "@/features/business/businessCalendar.mjs";
/** Tactile Ledger Stage 7: reports read immutable local facts; they never create, edit, or reinterpret business records as accounting profit. */
import { db, type TallybookDB } from "@/db/TallybookDB";
import type { Customer } from "@/features/customers/customers";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import { assertCompanyScope } from "@/features/business/companyScope.mjs";
import type { DebtRepayment } from "@/features/credit/credit";
import { expenseCategories, expenseCategoryLabels, type ExpenseCategory } from "@/features/expenses/expenses";
import type { Product } from "@/features/inventory/inventory";
import { paymentMethodLabel, type Payment, type PaymentMethod, type Sale } from "@/features/sales/sales";
import type { SaleReversal } from "@/features/assistant/reversals";
import { reconcileCreditLedger } from "@/features/sales/creditLedger.mjs";
import {auditRun10CompanyReceivables} from "./run10ReceivablesAudit.mjs";

export const reportPeriods = ["today", "last7", "all"] as const;
export type ReportPeriod = (typeof reportPeriods)[number];

export interface DateRange { period: ReportPeriod; start?: Date; end: Date; label: string; country?: string; }
export interface SalesReportRow { id: string; receiptNumber: string; createdAt: string; paymentMethod: Sale["paymentMethod"]; totalMinor: number; receivedMinor: number; outstandingMinor: number; customerName?: string; }
export interface PaymentReportRow { id: string; createdAt: string; source: "sale" | "repayment"; method: string; amountMinor: number; customerName?: string; }
export interface DebtReportRow { customerId: string; customerName: string; phone: string; salesOutstandingMinor: number; repaidMinor: number; outstandingMinor: number; }
export interface InventoryReportRow { productId: string; productName: string; stockQuantity: number; lowStockThreshold: number; isLowStock: boolean; sellingPriceMinor: number; }
export interface SalesTrendPoint { dateKey: string; label: string; salesMinor: number; transactions: number; }
export interface DashboardBestSeller { productId: string; productName: string; quantity: number; salesMinor: number; }
export interface DashboardActivity { id: string; type: "sale" | "repayment"; label: string; amountMinor: number; createdAt: string; }
const endOfDayPaymentMethods: readonly PaymentMethod[] = ["cash", "mobile", "card", "credit", "split"];
export interface EndOfDayMethodTotal { method: PaymentMethod; label: string; salesMinor: number; receivedMinor: number; }
export interface EndOfDaySummary {
  generatedAt: string;
  dateLabel: string;
  salesMinor: number;
  salesCount: number;
  receivedMinor: number;
  unpaidFromTodaySalesMinor: number;
  namedCustomersServed: number;
  lowStockProducts: InventoryReportRow[];
  methods: EndOfDayMethodTotal[];
}
export interface DashboardSummary {
  generatedAt: string;
  todaySalesMinor: number;
  todayMoneyReceivedMinor: number;
  outstandingDebtMinor: number;
  todayTransactions: number;
  lowStockProducts: InventoryReportRow[];
  recentSales: SalesReportRow[];
  bestSeller?: DashboardBestSeller;
  recentActivity: DashboardActivity[];
  trend: SalesTrendPoint[];
}
export interface BusinessHealthExpenseCategory { category: ExpenseCategory; label: string; amountMinor: number; count: number; }
export interface BusinessHealthSummary {
  generatedAt: string;
  range: DateRange;
  salesMinor: number;
  moneyCollectedMinor: number;
  outstandingDebtMinor: number;
  expensesMinor: number;
  expenseCount: number;
  expensesByCategory: BusinessHealthExpenseCategory[];
  lowStockProducts: InventoryReportRow[];
}
export interface ReportsSnapshot { range: DateRange; sales: SalesReportRow[]; payments: PaymentReportRow[]; debts: DebtReportRow[]; inventory: InventoryReportRow[]; totals: { salesMinor: number; receivedMinor: number; outstandingDebtMinor: number; transactionCount: number; }; }

function inRange(createdAt: string, range: DateRange) { const value = new Date(createdAt); return value >= (range.start ?? new Date(0)) && value < range.end; }
function expenseInRange(expenseDate: string, range: DateRange) {
  const startKey = range.start ? businessDayKey(range.start, range.country) : undefined;
  const endKey = businessDayKey(range.end, range.country);
  return (!startKey || expenseDate >= startKey) && expenseDate < endKey;
}
export function reportDateRange(period: ReportPeriod, now = new Date(), country?: string): DateRange {
  const end = businessDayEnd(now, country);
  if (period === "all") return { period, end, label: "All saved records", country };
  if (period === "today") return { period, start: businessDayStart(now, country), end, label: "Today", country };
  return { period, start: shiftBusinessDay(now, -6, country), end, label: "Last 7 days", country };
}
function customerMap(customers: Customer[]) { return new Map(customers.map((customer) => [customer.id, customer])); }
function salesRows(sales: Sale[], customerById: Map<string, Customer>): SalesReportRow[] {
  return sales.map((sale) => ({ id: sale.id, receiptNumber: sale.receiptNumber, createdAt: sale.createdAt, paymentMethod: sale.paymentMethod, totalMinor: sale.totalMinor, receivedMinor: sale.amountPaidMinor - (sale.walletAppliedMinor ?? 0), outstandingMinor: sale.outstandingMinor, customerName: sale.customerId ? customerById.get(sale.customerId)?.name : undefined })).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}
function debtRows(sales: Sale[], repayments: DebtRepayment[], reversals: SaleReversal[], customers: Customer[]): DebtReportRow[] {
  return customers.filter((customer) => !customer.archivedAt).map((customer) => {
    const { salesOutstandingMinor, repaidMinor, outstandingMinor } = reconcileCreditLedger(
      sales.filter((sale) => sale.customerId === customer.id),
      reversals.filter((reversal) => reversal.customerId === customer.id),
      repayments.filter((repayment) => repayment.customerId === customer.id),
    );
    return { customerId: customer.id, customerName: customer.name, phone: customer.phone, salesOutstandingMinor, repaidMinor, outstandingMinor };
  }).filter((row) => row.salesOutstandingMinor > 0 || row.repaidMinor > 0).sort((left, right) => right.outstandingMinor - left.outstandingMinor || left.customerName.localeCompare(right.customerName));
}
function inventoryRows(products: Product[]): InventoryReportRow[] {
  return products.filter((product) => !product.archivedAt).map((product) => ({ productId: product.id, productName: product.name, stockQuantity: product.stockQuantity, lowStockThreshold: product.lowStockThreshold, isLowStock: product.stockQuantity <= product.lowStockThreshold, sellingPriceMinor: product.sellingPriceMinor })).sort((left, right) => Number(right.isLowStock) - Number(left.isLowStock) || left.productName.localeCompare(right.productName));
}
function paymentRows(payments: Payment[], repayments: DebtRepayment[], customerById: Map<string, Customer>): PaymentReportRow[] {
  return [
    ...payments.map((payment) => ({ id: `sale-${payment.id}`, createdAt: payment.createdAt, source: "sale" as const, method: payment.method, amountMinor: payment.amountMinor, customerName: payment.customerId ? customerById.get(payment.customerId)?.name : undefined })),
    ...repayments.map((repayment) => ({ id: `repayment-${repayment.id}`, createdAt: repayment.createdAt, source: "repayment" as const, method: repayment.method, amountMinor: repayment.amountMinor, customerName: customerById.get(repayment.customerId)?.name })),
  ].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

async function sourceRecords(database: TallybookDB) {
  const activeId = getActiveBusinessProfileId();
  const [allSales, allPayments, allRepayments, allReversals, allCustomers, allProducts, allSaleLines, allExpenses, allWalletTransfers] = await database.transaction("r", [database.sales, database.payments, database.repayments, database.saleReversals, database.customers, database.products, database.saleLines, database.expenses, database.walletTransfers], async () => Promise.all([database.sales.toArray(), database.payments.toArray(), database.repayments.toArray(), database.saleReversals.toArray(), database.customers.toArray(), database.products.toArray(), database.saleLines.toArray(), database.expenses.toArray(), database.walletTransfers.toArray()]));
  assertCompanyScope(activeId, getActiveBusinessProfileId());
  const snapshot={ sales: allSales.filter((sale) => sale.businessProfileId === activeId), payments: allPayments.filter((payment) => payment.businessProfileId === activeId), repayments: allRepayments.filter((repayment) => repayment.businessProfileId === activeId), reversals: allReversals.filter((reversal) => reversal.businessProfileId === activeId), customers: allCustomers.filter((customer) => customer.businessProfileId === activeId), products: allProducts.filter((product) => product.businessProfileId === activeId), saleLines: allSaleLines.filter((line) => line.businessProfileId === activeId), expenses: allExpenses.filter((expense) => expense.businessProfileId === activeId), walletTransfers: allWalletTransfers.filter((t) => t.businessProfileId === activeId) };
  // The dashboard, debt table and end-of-day report must not mask one
  // customer's overpayment behind another customer's unpaid credit.
  auditRun10CompanyReceivables({company:activeId,customers:snapshot.customers,
    sales:snapshot.sales,repayments:snapshot.repayments,
    reversals:snapshot.reversals});
  assertCompanyScope(activeId,getActiveBusinessProfileId());
  return snapshot;
}

export async function getReportsSnapshot(period: ReportPeriod, now = new Date(), database: TallybookDB = db): Promise<ReportsSnapshot> {
  const company = getActiveBusinessProfileId();
  await requirePermission("reports", database);
  const selectedProfile = await database.businessProfiles.get(company);
  assertCompanyScope(company, getActiveBusinessProfileId());
  const range = reportDateRange(period, now, selectedProfile?.country);
  const { sales, payments, repayments, reversals, customers, products, walletTransfers } = await sourceRecords(database);
  const customerById = customerMap(customers);
  const filteredSales = sales.filter((sale) => inRange(sale.createdAt, range));
  const filteredPayments = payments.filter((payment) => inRange(payment.createdAt, range));
  const filteredRepayments = repayments.filter((repayment) => inRange(repayment.createdAt, range));
  const filteredReversals = reversals.filter((reversal) => inRange(reversal.createdAt, range));
  const debts = debtRows(sales, repayments, reversals, customers);
  const receivedMinor = [...filteredPayments, ...filteredRepayments].reduce((sum, payment) => sum + payment.amountMinor, 0) + filteredReversals.reduce((sum, reversal) => sum + reversal.reversedReceivedMinor + (sales.find(sale => sale.id === reversal.originalSaleId)?.walletAppliedMinor ?? 0), 0) + walletTransfers.filter(t=>inRange(t.createdAt,range)).reduce((sum,t)=>sum+(t.kind==='deposit'?t.amountMinor:-t.amountMinor),0);
  assertCompanyScope(company, getActiveBusinessProfileId());
  await requirePermission("reports",database,company);
  return { range, sales: salesRows(filteredSales, customerById), payments: paymentRows(filteredPayments, filteredRepayments, customerById), debts, inventory: inventoryRows(products), totals: { salesMinor: filteredSales.reduce((sum, sale) => sum + sale.totalMinor, 0) + filteredReversals.reduce((sum, reversal) => sum + reversal.reversedSaleTotalMinor, 0), receivedMinor, outstandingDebtMinor: debts.reduce((sum, debt) => sum + debt.outstandingMinor, 0), transactionCount: filteredSales.length } };
}

export async function getDashboardSummary(now = new Date(), database: TallybookDB = db): Promise<DashboardSummary> {
  const company = getActiveBusinessProfileId();
  const today = await getReportsSnapshot("today", now, database);
  const { sales, repayments, customers, saleLines } = await sourceRecords(database);
  const customerById = customerMap(customers);
  const todaySaleIds = new Set(today.sales.map((sale) => sale.id));
  const bestSellerByProduct = new Map<string, DashboardBestSeller>();
  saleLines.filter((line) => todaySaleIds.has(line.saleId)).forEach((line) => {
    const current = bestSellerByProduct.get(line.productId);
    bestSellerByProduct.set(line.productId, current ? { ...current, quantity: current.quantity + line.quantity, salesMinor: current.salesMinor + line.lineTotalMinor } : { productId: line.productId, productName: line.productName, quantity: line.quantity, salesMinor: line.lineTotalMinor });
  });
  const bestSeller = Array.from(bestSellerByProduct.values()).sort((left, right) => right.quantity - left.quantity || right.salesMinor - left.salesMinor || left.productName.localeCompare(right.productName))[0];
  const recentActivity: DashboardActivity[] = [
    ...today.sales.map((sale) => ({ id: `sale-${sale.id}`, type: "sale" as const, label: sale.customerName ? `Sale to ${sale.customerName}` : "Walk-in sale", amountMinor: sale.totalMinor, createdAt: sale.createdAt })),
    ...repayments.filter((repayment) => inRange(repayment.createdAt, today.range)).map((repayment) => ({ id: `repayment-${repayment.id}`, type: "repayment" as const, label: `Payment from ${customerById.get(repayment.customerId)?.name ?? "customer"}`, amountMinor: repayment.amountMinor, createdAt: repayment.createdAt })),
  ].sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, 5);
  const trend: SalesTrendPoint[] = Array.from({ length: 7 }, (_, index) => {
    const day = shiftBusinessDay(now, index - 6, today.range.country);
    const nextDay = businessDayEnd(day, today.range.country);
    const daySales = sales.filter((sale) => { const createdAt = new Date(sale.createdAt); return createdAt >= day && createdAt < nextDay; });
    return { dateKey: businessDayKey(day, today.range.country), label: businessWeekdayLabel(day, today.range.country), salesMinor: daySales.reduce((sum, sale) => sum + sale.totalMinor, 0), transactions: daySales.length };
  });
  assertCompanyScope(company, getActiveBusinessProfileId());
  await requirePermission("reports",database,company);
  return { generatedAt: now.toISOString(), todaySalesMinor: today.totals.salesMinor, todayMoneyReceivedMinor: today.totals.receivedMinor, outstandingDebtMinor: today.totals.outstandingDebtMinor, todayTransactions: today.totals.transactionCount, lowStockProducts: today.inventory.filter((product) => product.isLowStock), recentSales: today.sales.slice(0, 5), bestSeller, recentActivity, trend };
}

export async function getBusinessHealthSummary(period: ReportPeriod, now = new Date(), database: TallybookDB = db): Promise<BusinessHealthSummary> {
  const company = getActiveBusinessProfileId();
  await requirePermission("reports", database);
  const [reports, records] = await Promise.all([getReportsSnapshot(period, now, database), sourceRecords(database)]);
  const filteredExpenses = records.expenses.filter((expense) => expenseInRange(expense.expenseDate, reports.range));
  const expensesByCategory = expenseCategories.map((category) => {
    const categoryExpenses = filteredExpenses.filter((expense) => expense.category === category);
    return { category, label: expenseCategoryLabels[category], amountMinor: categoryExpenses.reduce((sum, expense) => sum + expense.amountMinor, 0), count: categoryExpenses.length };
  });
  assertCompanyScope(company, getActiveBusinessProfileId());
  await requirePermission("reports",database,company);
  return {
    generatedAt: now.toISOString(), range: reports.range, salesMinor: reports.totals.salesMinor, moneyCollectedMinor: reports.totals.receivedMinor,
    outstandingDebtMinor: reports.totals.outstandingDebtMinor, expensesMinor: filteredExpenses.reduce((sum, expense) => sum + expense.amountMinor, 0),
    expenseCount: filteredExpenses.length, expensesByCategory, lowStockProducts: reports.inventory.filter((product) => product.isLowStock),
  };
}

export async function getEndOfDaySummary(now = new Date(), database: TallybookDB = db): Promise<EndOfDaySummary> {
  const company = getActiveBusinessProfileId();
  await requirePermission("reports", database);
  const today = await getReportsSnapshot("today", now, database);
  const { sales, payments, repayments, walletTransfers } = await sourceRecords(database);
  const todaySales = sales.filter((sale) => inRange(sale.createdAt, today.range));
  const todayPayments = payments.filter((payment) => inRange(payment.createdAt, today.range));
  const todayRepayments = repayments.filter((repayment) => inRange(repayment.createdAt, today.range));
  const methods = endOfDayPaymentMethods.map((method) => ({
    method,
    label: paymentMethodLabel(method),
    salesMinor: todaySales.filter((sale) => sale.paymentMethod === method).reduce((sum, sale) => sum + sale.totalMinor, 0),
    receivedMinor: method === "credit" ? 0 : todayPayments.filter((payment) => payment.method === method).reduce((sum, payment) => sum + payment.amountMinor, 0) + todayRepayments.filter((repayment) => repayment.method === method).reduce((sum, repayment) => sum + repayment.amountMinor, 0),
  }));
  assertCompanyScope(company, getActiveBusinessProfileId());
  await requirePermission("reports",database,company);
  return {
    generatedAt: now.toISOString(),
    dateLabel: businessDateLabel(now, today.range.country),
    salesMinor: today.totals.salesMinor,
    salesCount: todaySales.length,
    receivedMinor: todayPayments.reduce((sum, payment) => sum + payment.amountMinor, 0) + todayRepayments.reduce((sum, repayment) => sum + repayment.amountMinor, 0) + walletTransfers.filter(t=>inRange(t.createdAt,today.range)).reduce((sum,t)=>sum+(t.kind==='deposit'?t.amountMinor:-t.amountMinor),0),
    unpaidFromTodaySalesMinor: todaySales.reduce((sum, sale) => sum + sale.outstandingMinor, 0),
    namedCustomersServed: new Set(todaySales.flatMap((sale) => sale.customerId ? [sale.customerId] : [])).size,
    lowStockProducts: today.inventory.filter((product) => product.isLowStock),
    methods,
  };
}
