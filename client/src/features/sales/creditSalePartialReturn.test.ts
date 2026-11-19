/** ST22-02 increment: partial returns on customer credit / part-paid sales (debt reduced first). */
import Dexie from 'dexie';
import { afterEach, expect, it, vi } from 'vitest';
import { TallybookDB, initializeDatabase } from '@/db/TallybookDB';
import { setActiveBusinessProfileId } from '@/features/business/activeCompany';
import { saveBusinessProfile } from '@/features/business/businessProfile';
import { updateCompanyReturnPolicy } from '@/features/business/returnPolicySettings';
import { createProduct } from '@/features/inventory/inventory';
import { createCustomer } from '@/features/customers/customers';
import { getCustomerDebtSummary, getCustomerRepaymentTargets, recordRepayment } from '@/features/credit/credit';
import { completeSale, getCustomerSaleSummary } from '@/features/sales/sales';
import { executeLatestSaleReversal } from '@/features/assistant/reversals';
import { getReportsSnapshot } from '@/features/reports/reports';
import { getFinancialSummary } from '@/features/reports/financialIntelligence';
import { recordConfirmedCashPartialReturn } from './cashPartialReturnPosting';
import { getCashReturnReview } from './cashReturnReview.ts';
import { quoteReviewedCashReturn } from './cashReturnReview.mjs';
import { calculateTrackedShiftCash, createStaff, unlockStaff, openShift, lockStaff } from '@/features/staff/staff';
import { createBackup, parseBackup, restoreBackup } from '@/features/backup/backup';

const openDB: TallybookDB[] = [];
async function fixture(opts: { method: 'credit' | 'cash'; paid: string }) {
  setActiveBusinessProfileId('primary');
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-01-02T10:00:00Z'));
  const database = new TallybookDB(`credit-return-${crypto.randomUUID()}`); openDB.push(database);
  await initializeDatabase(database);
  await saveBusinessProfile({ name: 'Credit return test', country: 'Ghana', currency: 'GHS', businessType: 'Retail' }, database);
  const owner = await createStaff('Owner', 'owner', '123456', database);
  await unlockStaff(owner.id, '123456', database);
  await openShift(0, database);
  await updateCompanyReturnPolicy({ enabled: true, allowFullReversal: true, allowCashPartial: true, maxAgeDays: 30 }, 'fixture opt-in', database);
  const customer = await createCustomer({ name: 'Ama Credit', phone: '+233205550001', email: '', address: '', notes: '', status: 'active' }, database);
  const product = await createProduct({ name: 'Rice', categoryId: 'uncategorized', sellingPrice: '10', costPrice: '1', initialStock: '3', lowStockThreshold: '0' }, 'GHS', database);
  const original = await completeSale({ lines: [{ productId: product.id, quantity: 2 }], customerId: customer.id, discount: '0',
    paymentMethod: opts.method, amountPaid: opts.paid, currency: 'GHS', submissionKey: 'original-credit-1' }, database);
  vi.setSystemTime(new Date('2026-01-03T10:00:00Z'));
  await unlockStaff(owner.id, '123456', database);
  return { database, product, customer, original };
}
afterEach(async () => {
  lockStaff('primary'); vi.useRealTimers(); vi.restoreAllMocks(); setActiveBusinessProfileId('primary');
  for (const database of openDB.splice(0)) { database.close(); await new Dexie(database.name).delete(); }
});
const credit = (saleId: string, lineId: string, key: string, debt: number, refund = 0, extra: Record<string, unknown> = {}) =>
  ({ originalSaleId: saleId, submissionKey: key, lines: [{ saleLineId: lineId, quantity: 1 }], confirmedRefundMinor: refund,
     confirmedDebtReductionMinor: debt, disposition: 'restockable' as const, ...(refund > 0 ? { cashWasRefunded: true as const } : {}), ...extra });

it('credit sale: each return reduces the receivable only; no money moves; reports conserve', async () => {
  const { database, product, customer, original } = await fixture({ method: 'credit', paid: '0' });
  expect((await getCustomerDebtSummary(customer.id, 'GHS', database)).outstandingMinor).toBe(2000);
  const review = await getCashReturnReview(original.sale.id, database);
  expect(review).toMatchObject({ refundMethod: 'credit', stillOwedMinor: 2000 });
  expect(quoteReviewedCashReturn(review, original.lines[0].id, 1)).toMatchObject({ amountMinor: 1000, debtReducedMinor: 1000, refundMinor: 0 });

  const a = await recordConfirmedCashPartialReturn(credit(original.sale.id, original.lines[0].id, 'credit-ret-1', 1000), database);
  expect(a).toMatchObject({ refundMethod: 'credit', refundedMinor: 0, debtReducedMinor: 1000, customerId: customer.id, returnSequence: 1 });
  expect(a.disbursementEvidence).toBeUndefined();
  expect((await getCustomerDebtSummary(customer.id, 'GHS', database)).outstandingMinor).toBe(1000);
  expect((await getCustomerSaleSummary(customer.id, 'GHS', database)).outstandingMinor).toBe(1000);
  expect((await getReportsSnapshot('all', new Date(), database)).debts[0]).toMatchObject({ outstandingMinor: 1000 });
  const targets = await getCustomerRepaymentTargets(customer.id, 'GHS', database);
  expect(targets.targets[0].remainingMinor).toBe(1000);
  expect((await database.products.get(product.id))?.stockQuantity).toBe(2);
  // Independent oracle: revenue 2000-1000, collections 0, receivable 1000.
  expect(await getFinancialSummary('month', new Date(), undefined, undefined, database)).toMatchObject({ revenueMinor: 1000, collectionsMinor: 0, currentReceivablesMinor: 1000 });

  // Replay refused.
  await expect(recordConfirmedCashPartialReturn(credit(original.sale.id, original.lines[0].id, 'credit-ret-1', 1000), database)).rejects.toThrow(/already recorded/);
  const b = await recordConfirmedCashPartialReturn(credit(original.sale.id, original.lines[0].id, 'credit-ret-2', 1000), database);
  expect(b.returnSequence).toBe(2);
  expect((await getCustomerDebtSummary(customer.id, 'GHS', database)).outstandingMinor).toBe(0);
  await expect(recordConfirmedCashPartialReturn(credit(original.sale.id, original.lines[0].id, 'credit-ret-3', 1000), database)).rejects.toThrow(/quantity/);
  expect((await database.products.get(product.id))?.stockQuantity).toBe(3);
  // No cash drawer effect.
  const shift = (await database.staffShifts.toArray())[0];
  const cash = calculateTrackedShiftCash(shift, { sales: await database.sales.toArray(), payments: await database.payments.toArray(), repayments: [], transfers: [], reversals: [], cashReturns: await database.cashPartialReturns.toArray() } as never);
  expect(cash.cashPartialRefundsMinor).toBe(0);
  // Full reversal after partial returns is impossible.
  await expect(executeLatestSaleReversal('GHS', database, 'full-after-credit')).rejects.toThrow(/couldn't find/);
  // Backup round trip, tamper and restore.
  const backup = await createBackup(database);
  expect(parseBackup(JSON.stringify(backup)).records.cashPartialReturns).toHaveLength(2);
  const tampered = structuredClone(backup); tampered.records.cashPartialReturns[0].debtReducedMinor = 1500;
  expect(() => parseBackup(JSON.stringify(tampered))).toThrow();
  const restored = new TallybookDB(`credit-return-restore-${crypto.randomUUID()}`); openDB.push(restored);
  await initializeDatabase(restored); await restoreBackup(parseBackup(JSON.stringify(backup)), restored);
  expect(await restored.cashPartialReturns.get(a.id)).toEqual(a);
});

it('refuses wrong amounts, a refund on a pure-credit sale, and refunding customer repayments', async () => {
  const { database, product, customer, original } = await fixture({ method: 'credit', paid: '0' });
  await expect(recordConfirmedCashPartialReturn(credit(original.sale.id, original.lines[0].id, 'bad-1-key-0001', 500), database)).rejects.toThrow(/exact saved invoice/);
  await expect(recordConfirmedCashPartialReturn(credit(original.sale.id, original.lines[0].id, 'bad-2-key-0001', 0, 1000), database)).rejects.toThrow(/exact saved invoice/);
  // Customer repays 15.00 linked to this sale -> only 5.00 still owed; returning 10.00 of goods would refund repayments.
  await recordRepayment({ customerId: customer.id, amount: '15.00', method: 'cash', currency: 'GHS', submissionKey: 'repay-linked-001',
    saleAllocations: [{ saleId: original.sale.id, amountMinor: 1500 }] }, database);
  await expect(recordConfirmedCashPartialReturn(credit(original.sale.id, original.lines[0].id, 'bad-3-key-0001', 500, 500, { refundMethod: 'cash' }), database)).rejects.toThrow(/unpaid balance of a credit sale/);
  expect(await database.cashPartialReturns.count()).toBe(0);
  expect((await database.products.get(product.id))?.stockQuantity).toBe(1);
  expect((await getCustomerDebtSummary(customer.id, 'GHS', database)).outstandingMinor).toBe(500);
});

it('legacy unlinked repayments and rewards fail closed', async () => {
  const { database, customer, original } = await fixture({ method: 'credit', paid: '0' });
  await recordRepayment({ customerId: customer.id, amount: '3.00', method: 'cash', currency: 'GHS', submissionKey: 'repay-legacy-001' }, database);
  await expect(recordConfirmedCashPartialReturn(credit(original.sale.id, original.lines[0].id, 'legacy-1-key-0001', 1000), database)).rejects.toThrow(/not linked to individual sales/);
  expect(await database.cashPartialReturns.count()).toBe(0);
});

it('part-paid cash sale: debt is reduced first, only the remainder is refunded in cash and hits the drawer', async () => {
  const { database, customer, original } = await fixture({ method: 'cash', paid: '5' });
  expect((await getCustomerDebtSummary(customer.id, 'GHS', database)).outstandingMinor).toBe(1500);
  // Return 1 (value 1000): fully absorbed by the 1500 debt.
  const a = await recordConfirmedCashPartialReturn(credit(original.sale.id, original.lines[0].id, 'mixed-1-key-0001', 1000), database);
  expect(a).toMatchObject({ refundMethod: 'credit', debtReducedMinor: 1000, refundedMinor: 0 });
  // Return 2 (value 1000): 500 left owed -> 500 credit + 500 refunded in cash.
  await expect(recordConfirmedCashPartialReturn(credit(original.sale.id, original.lines[0].id, 'mixed-bad-key-0001', 1000, 0), database)).rejects.toThrow(/exact saved invoice/);
  const b = await recordConfirmedCashPartialReturn(credit(original.sale.id, original.lines[0].id, 'mixed-2-key-0001', 500, 500, { refundMethod: 'cash' }), database);
  expect(b).toMatchObject({ refundMethod: 'cash', debtReducedMinor: 500, refundedMinor: 500 });
  expect((await getCustomerDebtSummary(customer.id, 'GHS', database)).outstandingMinor).toBe(0);
  const shift = (await database.staffShifts.toArray())[0];
  const cash = calculateTrackedShiftCash(shift, { sales: await database.sales.toArray(), payments: await database.payments.toArray(), repayments: [], transfers: [], reversals: [], cashReturns: await database.cashPartialReturns.toArray() } as never);
  expect(cash.cashPartialRefundsMinor).toBe(-500);
  // Conservation oracle: paid 500 + debt 1500 = 2000 total; returned value 2000 = credit 1500 + cash 500.
  const rows = await database.cashPartialReturns.toArray();
  expect(rows.reduce((n, r) => n + r.refundedMinor + (r.debtReducedMinor ?? 0), 0)).toBe(2000);
  expect(await getFinancialSummary('month', new Date(), undefined, undefined, database)).toMatchObject({ revenueMinor: 0, currentReceivablesMinor: 0 });
});

it('rolls back stock, FIFO, journal and debt when the final write fails', async () => {
  const { database, product, customer, original } = await fixture({ method: 'credit', paid: '0' });
  const costs = await database.inventoryCostEvents.toArray();
  vi.spyOn(database.centralOperationalEvents, 'add').mockRejectedValueOnce(new Error('simulated event write failure'));
  await expect(recordConfirmedCashPartialReturn(credit(original.sale.id, original.lines[0].id, 'rb-1-key-0001', 1000), database)).rejects.toThrow(/event write failure/);
  expect(await database.cashPartialReturns.count()).toBe(0);
  expect((await database.products.get(product.id))?.stockQuantity).toBe(1);
  expect(await database.inventoryCostEvents.toArray()).toEqual(costs);
  expect((await getCustomerDebtSummary(customer.id, 'GHS', database)).outstandingMinor).toBe(2000);
});
