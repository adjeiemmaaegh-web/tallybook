/** Tactile Ledger Stage 7: reports read immutable local facts; they never create, edit, or reinterpret business records as accounting profit. */
import { db, type TallybookDB } from "@/db/TallybookDB";
import type { Customer } from "@/features/customers/customers";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import type { DebtRepayment } from "@/features/credit/credit";
import { expenseCategories, expenseCategoryLabels, type ExpenseCategory } from "@/features/expenses/expenses";
import type { Product } from "@/features/inventory/inventory";
import { paymentMethodLabel, type Payment, type PaymentMethod, type Sale } from "@/features/sales/sales";

export const reportPeriods = ["today", "last7", "all"] as const;
export type ReportPeriod = (typeof reportPeriods)[number];

export interface DateRange { period: ReportPeriod; start?: Date; end: Date; label: string; }
export interface SalesReportRow { id: string; receiptNumber: string; createdAt: string; paymentMethod: Sale["paymentMethod"]; totalMinor: number; receivedMinor: number; outstandingMinor: number; customerName?: string; }
export interface PaymentReportRow { id: string; createdAt: string; source: "sale" | "repayment"; method: string; amountMinor: number; customerName?: string; }
export interface DebtReportRow { customerId: string; customerName: string; phone: string; salesOutstandingMinor: number; repaidMinor: number; outstandingMinor: number; }
export interface InventoryReportRow { productId: string; productName: string; stockQuantity: number; lowStockThreshold: number; isLowStock: boolean; sellingPriceMinor: number; }
export interface SalesTrendPoint { dateKey: string; label: string; salesMinor: number; transactions: number; }
export interface DashboardBestSeller { productId: string; productName: string; quantity: number; salesMinor: number; }
export interface DashboardActivity { id: string; type: "sale" | "repayment"; label: string; amountMinor: number; createdAt: string; }
const endOfDayPaymentMethods: readonly PaymentMethod[] = ["cash", "mobile", "card", "credit"];
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

function startOfLocalDay(value: Date) { const day = new Date(value); day.setHours(0, 0, 0, 0); return day; }
function endOfLocalDay(value: Date) { const day = startOfLocalDay(value); day.setDate(day.getDate() + 1); return day; }
function localDateKey(value: Date) { const offset = value.getTimezoneOffset() * 60_000; return new Date(value.getTime() - offset).toISOString().slice(0, 10); }
function readableDay(value: Date) { return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(value); }
function inRange(createdAt: string, range: DateRange) { const value = new Date(createdAt); return value >= (range.start ?? new Date(0)) && value < range.end; }
function expenseInRange(expenseDate: string, range: DateRange) {
  const startKey = range.start ? localDateKey(range.start) : undefined;
  const endKey = localDateKey(range.end);
  return (!startKey || expenseDate >= startKey) && expenseDate < endKey;
}

export function reportDateRange(period: ReportPeriod, now = new Date()): DateRange {
  const end = endOfLocalDay(now);
  if (period === "all") return { period, end, label: "All saved records" };
  if (period === "today") return { period, start: startOfLocalDay(now), end, label: "Today" };
  const start = startOfLocalDay(now); start.setDate(start.getDate() - 6);
  return { period, start, end, label: "Last 7 days" };
}

function customerMap(customers: Customer[]) { return new Map(customers.map((customer) => [customer.id, customer])); }
function salesRows(sales: Sale[], customerById: Map<string, Customer>): SalesReportRow[] {
  return sales.map((sale) => ({ id: sale.id, receiptNumber: sale.receiptNumber, createdAt: sale.createdAt, paymentMethod: sale.paymentMethod, totalMinor: sale.totalMinor, receivedMinor: sale.amountPaidMinor, outstandingMinor: sale.outstandingMinor, customerName: sale.customerId ? customerById.get(sale.customerId)?.name : undefined })).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}
function debtRows(sales: Sale[], repayments: DebtRepayment[], customers: Customer[]): DebtReportRow[] {
  return customers.filter((customer) => !customer.archivedAt).map((customer) => {
    const salesOutstandingMinor = sales.filter((sale) => sale.customerId === customer.id).reduce((sum, sale) => sum + sale.outstandingMinor, 0);
    const repaidMinor = repayments.filter((repayment) => repayment.customerId === customer.id).reduce((sum, repayment) => sum + repayment.amountMinor, 0);
    return { customerId: customer.id, customerName: customer.name, phone: customer.phone, salesOutstandingMinor, repaidMinor, outstandingMinor: Math.max(0, salesOutstandingMinor - repaidMinor) };
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
  const [allSales, allPayments, allRepayments, allCustomers, allProducts, allSaleLines, allExpenses] = await Promise.all([database.sales.toArray(), database.payments.toArray(), database.repayments.toArray(), database.customers.toArray(), database.products.toArray(), database.saleLines.toArray(), database.expenses.toArray()]);
  return { sales: allSales.filter((sale) => sale.businessProfileId === activeId), payments: allPayments.filter((payment) => payment.businessProfileId === activeId), repayments: allRepayments.filter((repayment) => repayment.businessProfileId === activeId), customers: allCustomers.filter((customer) => customer.businessProfileId === activeId), products: allProducts.filter((product) => product.businessProfileId === activeId), saleLines: allSaleLines.filter((line) => line.businessProfileId === activeId), expenses: allExpenses.filter((expense) => expense.businessProfileId === activeId) };
}

export async function getReportsSnapshot(period: ReportPeriod, now = new Date(), database: TallybookDB = db): Promise<ReportsSnapshot> {
  const range = reportDateRange(period, now);
  const { sales, payments, repayments, customers, products } = await sourceRecords(database);
  const customerById = customerMap(customers);
  const filteredSales = sales.filter((sale) => inRange(sale.createdAt, range));
  const filteredPayments = payments.filter((payment) => inRange(payment.createdAt, range));
  const filteredRepayments = repayments.filter((repayment) => inRange(repayment.createdAt, range));
  const debts = debtRows(sales, repayments, customers);
  const receivedMinor = [...filteredPayments, ...filteredRepayments].reduce((sum, payment) => sum + payment.amountMinor, 0);
  return { range, sales: salesRows(filteredSales, customerById), payments: paymentRows(filteredPayments, filteredRepayments, customerById), debts, inventory: inventoryRows(products), totals: { salesMinor: filteredSales.reduce((sum, sale) => sum + sale.totalMinor, 0), receivedMinor, outstandingDebtMinor: debts.reduce((sum, debt) => sum + debt.outstandingMinor, 0), transactionCount: filteredSales.length } };
}

export async function getDashboardSummary(now = new Date(), database: TallybookDB = db): Promise<DashboardSummary> {
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
    const day = startOfLocalDay(now); day.setDate(day.getDate() - (6 - index));
    const nextDay = endOfLocalDay(day);
    const daySales = sales.filter((sale) => { const createdAt = new Date(sale.createdAt); return createdAt >= day && createdAt < nextDay; });
    return { dateKey: localDateKey(day), label: readableDay(day), salesMinor: daySales.reduce((sum, sale) => sum + sale.totalMinor, 0), transactions: daySales.length };
  });
  return { generatedAt: now.toISOString(), todaySalesMinor: today.totals.salesMinor, todayMoneyReceivedMinor: today.totals.receivedMinor, outstandingDebtMinor: today.totals.outstandingDebtMinor, todayTransactions: today.totals.transactionCount, lowStockProducts: today.inventory.filter((product) => product.isLowStock), recentSales: today.sales.slice(0, 5), bestSeller, recentActivity, trend };
}

export async function getBusinessHealthSummary(period: ReportPeriod, now = new Date(), database: TallybookDB = db): Promise<BusinessHealthSummary> {
  const [reports, records] = await Promise.all([getReportsSnapshot(period, now, database), sourceRecords(database)]);
  const filteredExpenses = records.expenses.filter((expense) => expenseInRange(expense.expenseDate, reports.range));
  const expensesByCategory = expenseCategories.map((category) => {
    const categoryExpenses = filteredExpenses.filter((expense) => expense.category === category);
    return { category, label: expenseCategoryLabels[category], amountMinor: categoryExpenses.reduce((sum, expense) => sum + expense.amountMinor, 0), count: categoryExpenses.length };
  });
  return {
    generatedAt: now.toISOString(), range: reports.range, salesMinor: reports.totals.salesMinor, moneyCollectedMinor: reports.totals.receivedMinor,
    outstandingDebtMinor: reports.totals.outstandingDebtMinor, expensesMinor: filteredExpenses.reduce((sum, expense) => sum + expense.amountMinor, 0),
    expenseCount: filteredExpenses.length, expensesByCategory, lowStockProducts: reports.inventory.filter((product) => product.isLowStock),
  };
}

export async function getEndOfDaySummary(now = new Date(), database: TallybookDB = db): Promise<EndOfDaySummary> {
  const today = await getReportsSnapshot("today", now, database);
  const { sales, payments, repayments } = await sourceRecords(database);
  const todaySales = sales.filter((sale) => inRange(sale.createdAt, today.range));
  const todayPayments = payments.filter((payment) => inRange(payment.createdAt, today.range));
  const todayRepayments = repayments.filter((repayment) => inRange(repayment.createdAt, today.range));
  const methods = endOfDayPaymentMethods.map((method) => ({
    method,
    label: paymentMethodLabel(method),
    salesMinor: todaySales.filter((sale) => sale.paymentMethod === method).reduce((sum, sale) => sum + sale.totalMinor, 0),
    receivedMinor: method === "credit" ? 0 : todayPayments.filter((payment) => payment.method === method).reduce((sum, payment) => sum + payment.amountMinor, 0) + todayRepayments.filter((repayment) => repayment.method === method).reduce((sum, repayment) => sum + repayment.amountMinor, 0),
  }));
  return {
    generatedAt: now.toISOString(),
    dateLabel: new Intl.DateTimeFormat(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(now),
    salesMinor: today.totals.salesMinor,
    salesCount: todaySales.length,
    receivedMinor: todayPayments.reduce((sum, payment) => sum + payment.amountMinor, 0) + todayRepayments.reduce((sum, repayment) => sum + repayment.amountMinor, 0),
    unpaidFromTodaySalesMinor: todaySales.reduce((sum, sale) => sum + sale.outstandingMinor, 0),
    namedCustomersServed: new Set(todaySales.flatMap((sale) => sale.customerId ? [sale.customerId] : [])).size,
    lowStockProducts: today.inventory.filter((product) => product.isLowStock),
    methods,
  };
}
