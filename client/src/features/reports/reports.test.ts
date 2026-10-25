/** Tactile Ledger Stage 7 regression: dashboard figures must reconcile to saved local records and never become a second mutable ledger. */
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { TallybookDB, initializeDatabase } from "@/db/TallybookDB";
import { createCustomer } from "@/features/customers/customers";
import { recordRepayment } from "@/features/credit/credit";
import { createExpense } from "@/features/expenses/expenses";
import { createProduct } from "@/features/inventory/inventory";
import { getBusinessHealthSummary, getDashboardSummary, getEndOfDaySummary, getReportsSnapshot, reportDateRange } from "@/features/reports/reports";
import { completeSale } from "@/features/sales/sales";
import { saveBusinessProfile } from "@/features/business/businessProfile";
import { createStaff, unlockStaff, openShift, lockStaff } from "@/features/staff/staff";

const names = new Set<string>();
const databases: Dexie[] = [];
let sequence = 0;
const today = new Date("2026-08-25T13:00:00.000Z");
const todayStamp = "2026-08-25T10:00:00.000Z";

function makeDatabase() { const database = new TallybookDB(`tallybook-reports-test-${Date.now()}-${++sequence}`); names.add(database.name); databases.push(database); return database; }
async function createFixture(database: TallybookDB) {
  await initializeDatabase(database);
  await saveBusinessProfile({ name: "Report test business", country: "Ghana", currency: "GHS", businessType: "Retail shop" }, database);
  const owner = await createStaff("Report test owner", "owner", "123456", database);
  await unlockStaff(owner.id, "123456", database);
  await openShift(0, database);
  const customer = await createCustomer({ name: "Report Customer", phone: "+233 20 000 7000", email: "", address: "", notes: "", status: "active" }, database);
  const cashProduct = await createProduct({ name: `Cash report item ${sequence}`, sku: "", categoryId: "uncategorized", sellingPrice: "10.00", costPrice: "", initialStock: "1", lowStockThreshold: "1" }, "GHS", database);
  const creditProduct = await createProduct({ name: `Credit report item ${sequence}`, sku: "", categoryId: "uncategorized", sellingPrice: "20.00", costPrice: "", initialStock: "4", lowStockThreshold: "1" }, "GHS", database);
  const cash = await completeSale({ lines: [{ productId: cashProduct.id, quantity: 1 }], discount: "0", paymentMethod: "cash", amountPaid: "10.00", currency: "GHS" }, database);
  const credit = await completeSale({ lines: [{ productId: creditProduct.id, quantity: 1 }], customerId: customer.id, discount: "0", paymentMethod: "credit", amountPaid: "0", currency: "GHS" }, database);
  await database.sales.update(cash.sale.id, { createdAt: todayStamp });
  await database.sales.update(credit.sale.id, { createdAt: todayStamp });
  await database.payments.where("saleId").equals(cash.sale.id).modify({ createdAt: todayStamp });
  const repayment = await recordRepayment({ customerId: customer.id, amount: "5.00", method: "mobile", currency: "GHS", submissionKey: `report-repayment-${sequence}` }, database);
  await database.repayments.update(repayment.id, { createdAt: todayStamp });
  return { customer, cashProduct, creditProduct, cash, credit, repayment };
}

afterEach(async () => { lockStaff("primary"); databases.splice(0).forEach((database) => database.close()); await Promise.all([...names].map((name) => new Dexie(name).delete())); names.clear(); });

describe("Stage 7 local reports", () => {
  it("reconciles today sales, money received, debt, low stock, and transaction count to local records", async () => {
    const database = makeDatabase();
    const { cashProduct, creditProduct, credit } = await createFixture(database);

    const snapshot = await getReportsSnapshot("today", today, database);
    const dashboard = await getDashboardSummary(today, database);

    expect(snapshot.totals).toEqual({ salesMinor: 3000, receivedMinor: 1500, outstandingDebtMinor: 1500, transactionCount: 2 });
    expect(snapshot.sales).toHaveLength(2);
    expect(snapshot.payments).toHaveLength(2);
    expect(snapshot.debts).toMatchObject([{ customerName: "Report Customer", salesOutstandingMinor: 2000, repaidMinor: 500, outstandingMinor: 1500 }]);
    expect(snapshot.inventory.find((product) => product.productId === cashProduct.id)).toMatchObject({ stockQuantity: 0, isLowStock: true });
    expect(dashboard).toMatchObject({ todaySalesMinor: 3000, todayMoneyReceivedMinor: 1500, outstandingDebtMinor: 1500, todayTransactions: 2, bestSeller: { productName: creditProduct.name, quantity: 1, salesMinor: 2000 } });
    expect(dashboard.recentActivity).toEqual(expect.arrayContaining([{ id: `sale-${credit.sale.id}`, type: "sale", label: "Sale to Report Customer", amountMinor: 2000, createdAt: todayStamp }, { id: expect.stringMatching(/^repayment-/), type: "repayment", label: "Payment from Report Customer", amountMinor: 500, createdAt: todayStamp }]));
    expect(dashboard.trend.at(-1)).toMatchObject({ dateKey: "2026-08-25", salesMinor: 3000, transactions: 2 });
  });

  it("uses local calendar boundaries for today and leaves historical cash sales out of today totals", async () => {
    const database = makeDatabase();
    const { creditProduct } = await createFixture(database);
    const oldSale = await completeSale({ lines: [{ productId: creditProduct.id, quantity: 1 }], discount: "0", paymentMethod: "cash", amountPaid: "20.00", currency: "GHS" }, database);
    await database.sales.update(oldSale.sale.id, { createdAt: "2026-08-18T10:00:00.000Z" });
    await database.payments.where("saleId").equals(oldSale.sale.id).modify({ createdAt: "2026-08-18T10:00:00.000Z" });

    const todayReport = await getReportsSnapshot("today", today, database);
    const sevenDayReport = await getReportsSnapshot("last7", today, database);

    expect(todayReport.totals).toMatchObject({ salesMinor: 3000, receivedMinor: 1500, transactionCount: 2 });
    expect(sevenDayReport.totals).toMatchObject({ salesMinor: 3000, receivedMinor: 1500, transactionCount: 2 });
    expect(reportDateRange("today", today).label).toBe("Today");
  });

  it("returns no best seller or activity before a completed sale or repayment is saved today", async () => {
    const database = makeDatabase();
    await initializeDatabase(database);

    const dashboard = await getDashboardSummary(today, database);

    expect(dashboard.bestSeller).toBeUndefined();
    expect(dashboard.recentActivity).toEqual([]);
  });

  it("separates recorded sales from money actually received without letting repayments rewrite today’s unpaid sale amount", async () => {
    const database = makeDatabase();
    const { creditProduct } = await createFixture(database);
    const card = await completeSale({ lines: [{ productId: creditProduct.id, quantity: 1 }], discount: "0", paymentMethod: "card", amountPaid: "20.00", currency: "GHS" }, database);
    await database.sales.update(card.sale.id, { createdAt: todayStamp });
    await database.payments.where("saleId").equals(card.sale.id).modify({ createdAt: todayStamp });

    const summary = await getEndOfDaySummary(today, database);
    const byMethod = Object.fromEntries(summary.methods.map((method) => [method.method, method]));

    expect(summary).toMatchObject({ salesMinor: 5000, salesCount: 3, receivedMinor: 3500, unpaidFromTodaySalesMinor: 2000, namedCustomersServed: 1 });
    expect(byMethod.cash).toMatchObject({ label: "Cash", salesMinor: 1000, receivedMinor: 1000 });
    expect(byMethod.mobile).toMatchObject({ label: "Mobile Money", salesMinor: 0, receivedMinor: 500 });
    expect(byMethod.card).toMatchObject({ label: "Card", salesMinor: 2000, receivedMinor: 2000 });
    expect(byMethod.credit).toMatchObject({ label: "Credit", salesMinor: 2000, receivedMinor: 0 });
    expect(summary.lowStockProducts).toHaveLength(1);
  });

  it("shows recorded expenses by local date and category without blending them into sales, collections, debt, or supplier stock history", async () => {
    const database = makeDatabase();
    await createFixture(database);
    await createExpense({ category: "transport", amount: "4.00", expenseDate: "2026-08-25", currency: "GHS", submissionKey: `report-expense-transport-${sequence}` }, database);
    await createExpense({ category: "rent", amount: "3.50", expenseDate: "2026-08-25", currency: "GHS", submissionKey: `report-expense-rent-${sequence}` }, database);
    await createExpense({ category: "other", amount: "8.00", expenseDate: "2026-08-10", currency: "GHS", submissionKey: `report-expense-old-${sequence}` }, database);

    const health = await getBusinessHealthSummary("today", today, database);
    const report = await getReportsSnapshot("today", today, database);
    const categories = Object.fromEntries(health.expensesByCategory.map((category) => [category.category, category]));

    expect(health).toMatchObject({ salesMinor: 3000, moneyCollectedMinor: 1500, outstandingDebtMinor: 1500, expensesMinor: 750, expenseCount: 2 });
    expect(categories.transport).toMatchObject({ label: "Transport", amountMinor: 400, count: 1 });
    expect(categories.rent).toMatchObject({ label: "Rent", amountMinor: 350, count: 1 });
    expect(categories.other).toMatchObject({ amountMinor: 0, count: 0 });
    expect(health.lowStockProducts).toHaveLength(1);
    expect(report.totals).toEqual({ salesMinor: 3000, receivedMinor: 1500, outstandingDebtMinor: 1500, transactionCount: 2 });
  });
});
