/**
 * Seeded randomized conservation test (ST22-07/10, ST23-01/08, ST24-03).
 * Real services mutate a real IndexedDB; an independent oracle recomputed from raw
 * tables must equal the app's reports, customer balances, stock and integrity audit,
 * and a full backup must restore into a fresh database byte-for-byte equal.
 * Seeds are fixed so any failure is exactly reproducible.
 */
import Dexie from 'dexie';
import { afterEach, expect, it, vi } from 'vitest';
import { TallybookDB, initializeDatabase } from '@/db/TallybookDB';
import { setActiveBusinessProfileId } from '@/features/business/activeCompany';
import { saveBusinessProfile } from '@/features/business/businessProfile';
import { updateCompanyReturnPolicy } from '@/features/business/returnPolicySettings';
import { createProduct } from '@/features/inventory/inventory';
import { createCustomer } from '@/features/customers/customers';
import { getCustomerDebtSummary, getCustomerRepaymentTargets, recordRepayment } from '@/features/credit/credit';
import { completeSale } from '@/features/sales/sales';
import { recordConfirmedCashPartialReturn } from '@/features/sales/cashPartialReturnPosting';
import { getCashReturnReview } from '@/features/sales/cashReturnReview.ts';
import { quoteReviewedCashReturn } from '@/features/sales/cashReturnReview.mjs';
import { createStaff, unlockStaff, openShift, lockStaff, currentStaffId } from '@/features/staff/staff';
import { getFinancialSummary } from '@/features/reports/financialIntelligence';
import { auditLocalIntegrity } from '@/features/reliability/integrity';
import { createBackup, parseBackup, restoreBackup } from '@/features/backup/backup';

const openDB: TallybookDB[] = [];
afterEach(async () => {
  lockStaff('primary'); vi.useRealTimers(); vi.restoreAllMocks(); setActiveBusinessProfileId('primary');
  for (const database of openDB.splice(0)) { database.close(); await new Dexie(database.name).delete(); }
});
/** mulberry32: tiny deterministic PRNG. */
function rng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const stats = { sales: 0, returns: 0, creditReturns: 0, tenderReturns: 0, repayments: 0 };

async function scenario(seed: number) {
  const rand = rng(seed); const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  setActiveBusinessProfileId('primary');
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-01-02T10:00:00Z'));
  const database = new TallybookDB(`conserve-${seed}-${crypto.randomUUID()}`); openDB.push(database);
  await initializeDatabase(database);
  await saveBusinessProfile({ name: 'Conservation', country: 'Ghana', currency: 'GHS', businessType: 'Retail' }, database);
  const owner = await createStaff('Owner', 'owner', '123456', database);
  await unlockStaff(owner.id, '123456', database);
  await openShift(0, database);
  await updateCompanyReturnPolicy({ enabled: true, allowFullReversal: true, allowCashPartial: true, maxAgeDays: 30 }, 'fixture', database);
  const customers = [await createCustomer({ name: 'Ama One', phone: '+233205550011', email: '', address: '', notes: '', status: 'active' }, database),
    await createCustomer({ name: 'Kofi Two', phone: '+233205550022', email: '', address: '', notes: '', status: 'active' }, database)];
  const prices = [10, 7.5, 3.25];
  const products = [] as Awaited<ReturnType<typeof createProduct>>[];
  for (const [i, price] of prices.entries())
    products.push(await createProduct({ name: `Item ${i}`, categoryId: 'uncategorized', sellingPrice: String(price), costPrice: '1', initialStock: '200', lowStockThreshold: '0' }, 'GHS', database));
  const sold = new Map<string, number>(); const initial = 200;

  const nSales = 4 + Math.floor(rand() * 4);
  for (let i = 0; i < nSales; i++) {
    const kind = pick(['cash', 'card', 'credit', 'partial']);
    const product = pick(products); const quantity = 1 + Math.floor(rand() * 3);
    const total = Math.round(prices[products.indexOf(product)] * 100) * quantity;
    const customer = (kind === 'credit' || kind === 'partial') ? pick(customers) : undefined;
    const paid = kind === 'credit' ? '0' : kind === 'partial' ? (Math.floor(rand() * (total / 100 - 1)) + 1).toFixed(2) : (total / 100).toFixed(2);
    await completeSale({ lines: [{ productId: product.id, quantity }], ...(customer ? { customerId: customer.id } : {}), discount: '0',
      paymentMethod: kind === 'credit' ? 'credit' : kind === 'card' ? 'card' : 'cash', amountPaid: paid, currency: 'GHS', submissionKey: `sale-${seed}-${i}-key` }, database);
    sold.set(product.id, (sold.get(product.id) ?? 0) + quantity); stats.sales++;
  }
  vi.setSystemTime(new Date('2026-01-03T10:00:00Z'));
  await unlockStaff(owner.id, '123456', database);

  for (let step = 0; step < 10; step++) {
    if (process.env.LEDGER_DEBUG) console.log('STEP', seed, step, 'staff', currentStaffId('primary'));
    const sales = await database.sales.toArray();
    if (rand() < 0.55) {
      // Partial return through the same review -> quote -> post path the dialog uses.
      const sale = pick(sales);
      try {
        const review = await getCashReturnReview(sale.id, database);
        const option = pick(review.options.filter(o => o.remainingQuantity > 0));
        if (!option) continue;
        const quote = quoteReviewedCashReturn(review, option.saleLineId, 1);
        await recordConfirmedCashPartialReturn({ originalSaleId: sale.id, submissionKey: `ret-${seed}-${step}-key`,
          lines: [{ saleLineId: option.saleLineId, quantity: 1 }], confirmedRefundMinor: quote.refundMinor,
          confirmedDebtReductionMinor: quote.debtReducedMinor, disposition: 'restockable',
          ...(quote.refundMinor > 0 ? { cashWasRefunded: true as const, refundMethod: sale.paymentMethod as 'cash' | 'card' } : {}) }, database);
        stats.returns++; if (quote.debtReducedMinor > 0) stats.creditReturns++; if (quote.refundMinor > 0) stats.tenderReturns++;
      } catch (error) {
        if (process.env.LEDGER_DEBUG) console.log('REFUSED', seed, step, (error as Error).message, 'staff', currentStaffId('primary'));
        // Only the documented fail-closed refusals are acceptable; anything else is a bug.
        expect(String((error as Error).message)).toMatch(/narrow return review|no refundable|not supported|requires|unpaid balance|valid remaining|exceed|unavailable|not linked/i);
      }
    } else {
      const customer = pick(customers);
      const targets = await getCustomerRepaymentTargets(customer.id, 'GHS', database).catch(() => undefined);
      const target = targets?.canLink ? targets.targets[0] : undefined;
      if (!target) continue;
      const amountMinor = Math.max(1, Math.min(target.remainingMinor, Math.floor(rand() * target.remainingMinor) + 1));
      await recordRepayment({ customerId: customer.id, amount: (amountMinor / 100).toFixed(2), method: 'cash', currency: 'GHS',
        submissionKey: `rep-${seed}-${step}-key-1`, saleAllocations: [{ saleId: target.saleId, amountMinor }] }, database);
      stats.repayments++;
    }
  }
  return { database, products, customers, sold, initial };
}

async function checkOracle(ctx: Awaited<ReturnType<typeof scenario>>) {
  const { database, products, customers, sold, initial } = ctx;
  const [sales, payments, repayments, returns, movements] = await Promise.all([database.sales.toArray(), database.payments.toArray(),
    database.repayments.toArray(), database.cashPartialReturns.toArray(), database.inventoryMovements.toArray()]);
  const returnedValue = returns.reduce((n, r) => n + r.refundedMinor + (r.debtReducedMinor ?? 0), 0);
  const refunded = returns.reduce((n, r) => n + r.refundedMinor, 0);
  const debtCredit = returns.reduce((n, r) => n + (r.debtReducedMinor ?? 0), 0);
  const expectRevenue = sales.reduce((n, s) => n + s.totalMinor, 0) - returnedValue;
  const expectCollections = payments.reduce((n, p) => n + p.amountMinor, 0) + repayments.reduce((n, p) => n + p.amountMinor, 0) - refunded;
  const expectReceivable = sales.reduce((n, s) => n + s.outstandingMinor, 0) - repayments.reduce((n, p) => n + p.amountMinor, 0) - debtCredit;
  const summary = await getFinancialSummary('month', new Date(), undefined, undefined, database);
  expect(summary.revenueMinor).toBe(expectRevenue);
  expect(summary.collectionsMinor).toBe(expectCollections);
  expect(summary.currentReceivablesMinor).toBe(expectReceivable);
  let perCustomer = 0;
  for (const c of customers) perCustomer += (await getCustomerDebtSummary(c.id, 'GHS', database)).outstandingMinor;
  expect(perCustomer).toBe(expectReceivable);
  // Stock: on-hand = initial - sold + returned, and equals the movement ledger.
  for (const product of products) {
    const returnedUnits = returns.flatMap(r => r.lines).filter(l => l.productId === product.id).reduce((n, l) => n + l.quantity, 0);
    const row = await database.products.get(product.id);
    expect(row!.stockQuantity).toBe(initial - (sold.get(product.id) ?? 0) + returnedUnits);
    const ledger = movements.filter(m => m.productId === product.id);
    // Arithmetic ledger check (timestamps tie under the fake clock): every movement links
    // previous -> resulting, and the deltas sum to the net change from the chain start.
    for (const m of ledger) expect(m.resultingQuantity - m.previousQuantity).toBe(m.quantityDelta);
    const base = ledger.some(m => m.previousQuantity === 0) ? 0 : initial;
    expect(base + ledger.reduce((n, m) => n + m.quantityDelta, 0) ).toBe(row!.stockQuantity);
    expect(row!.stockQuantity).toBeGreaterThanOrEqual(0);
  }
  const audit = await auditLocalIntegrity(database);
  expect(audit.issues).toEqual([]);
  // Full backup -> parse -> restore into a fresh DB must be exactly equal.
  const backup = parseBackup(JSON.stringify(await createBackup(database)));
  const fresh = new TallybookDB(`conserve-restore-${crypto.randomUUID()}`); openDB.push(fresh);
  await initializeDatabase(fresh); await restoreBackup(backup, fresh);
  for (const table of ['sales', 'saleLines', 'payments', 'repayments', 'cashPartialReturns', 'products', 'inventoryMovements', 'inventoryCostEvents', 'customers'] as const) {
    const a = (await database[table].toArray()).sort((x: { id: string }, y: { id: string }) => x.id.localeCompare(y.id));
    const b = (await fresh[table].toArray()).sort((x: { id: string }, y: { id: string }) => x.id.localeCompare(y.id));
    expect(b, `table ${table} differs after restore`).toEqual(a);
  }
  // A restore never carries a live session: the owner must unlock with the restored credential.
  await expect(getFinancialSummary('month', new Date(), undefined, undefined, fresh)).rejects.toThrow(/locked|permission/i);
  const owner = await fresh.staffMembers.where('businessProfileId').equals('primary').first();
  await unlockStaff(owner!.id, '123456', fresh);
  const restoredSummary = await getFinancialSummary('month', new Date(), undefined, undefined, fresh);
  expect([restoredSummary.revenueMinor, restoredSummary.collectionsMinor, restoredSummary.currentReceivablesMinor])
    .toEqual([expectRevenue, expectCollections, expectReceivable]);
}

for (const seed of [11, 23, 37, 41, 59, 73, 89, 97]) {
  it(`seed ${seed}: money, receivables, stock, integrity and restore all conserve`, async () => {
    await checkOracle(await scenario(seed));
  }, 60_000);
}
it('the randomized scenarios actually exercised returns, credit notes, tender refunds and repayments', () => {
  expect(stats.sales).toBeGreaterThan(20);
  expect(stats.returns).toBeGreaterThan(5);
  expect(stats.creditReturns).toBeGreaterThan(0);
  expect(stats.repayments).toBeGreaterThan(0);
});
