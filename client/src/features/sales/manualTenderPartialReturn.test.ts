/** ST22-02 increment: single-tender Mobile Money / card partial returns are MANUAL, unverified evidence. */
import Dexie from 'dexie';
import { afterEach, expect, it, vi } from 'vitest';
import { TallybookDB, initializeDatabase } from '@/db/TallybookDB';
import { setActiveBusinessProfileId } from '@/features/business/activeCompany';
import { saveBusinessProfile } from '@/features/business/businessProfile';
import { updateCompanyReturnPolicy } from '@/features/business/returnPolicySettings';
import { createProduct } from '@/features/inventory/inventory';
import { addMobileMoneyProvider } from '@/features/payments/mobileMoney';
import { completeSale } from '@/features/sales/sales';
import { recordConfirmedCashPartialReturn } from './cashPartialReturnPosting';
import { calculateTrackedShiftCash, createStaff, unlockStaff, openShift, lockStaff } from '@/features/staff/staff';
import { getFinancialSummary } from '@/features/reports/financialIntelligence';
import { createBackup, parseBackup, restoreBackup } from '@/features/backup/backup';

const openDB: TallybookDB[] = [];
async function fixture(tender: 'cash' | 'card' | 'mobile') {
  setActiveBusinessProfileId('primary');
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-01-02T10:00:00Z'));
  const database = new TallybookDB(`manual-tender-${crypto.randomUUID()}`); openDB.push(database);
  await initializeDatabase(database);
  await saveBusinessProfile({ name: 'Tender return test', country: 'Ghana', currency: 'GHS', businessType: 'Retail' }, database);
  const owner = await createStaff('Owner', 'owner', '123456', database);
  await unlockStaff(owner.id, '123456', database);
  await openShift(0, database);
  await updateCompanyReturnPolicy({ enabled: true, allowFullReversal: true, allowCashPartial: true, maxAgeDays: 30 }, 'fixture opt-in', database);
  const product = await createProduct({ name: 'Rice', categoryId: 'uncategorized', sellingPrice: '10', costPrice: '1', initialStock: '3', lowStockThreshold: '0' }, 'GHS', database);
  const provider = tender === 'mobile' ? await addMobileMoneyProvider({ name: 'Test MoMo' } as never, database) : undefined;
  const original = await completeSale({
    lines: [{ productId: product.id, quantity: 2 }], discount: '0', paymentMethod: tender, amountPaid: '20', currency: 'GHS',
    submissionKey: `original-${tender}-1`,
    ...(provider ? { mobileMoneyProviderId: provider.id, mobileMoneyReference: 'MOMO-REF-0001' } : {}),
    ...(tender === 'card' ? { cardReference: 'CARD-TERM-0001' } : {}),
  }, database);
  vi.setSystemTime(new Date('2026-01-03T10:00:00Z'));
  await unlockStaff(owner.id, '123456', database);
  return { database, product, original };
}
afterEach(async () => {
  lockStaff('primary'); vi.useRealTimers(); vi.restoreAllMocks(); setActiveBusinessProfileId('primary');
  for (const database of openDB.splice(0)) { database.close(); await new Dexie(database.name).delete(); }
});
const req = (saleId: string, lineId: string, key: string, extra: Record<string, unknown> = {}) =>
  ({ originalSaleId: saleId, submissionKey: key, lines: [{ saleLineId: lineId, quantity: 1 }], cashWasRefunded: true as const,
     confirmedRefundMinor: 1000, disposition: 'restockable' as const, ...extra });

for (const tender of ['mobile', 'card'] as const) {
  it(`${tender}: two partial returns post once each, restore FIFO stock, and never touch the cash drawer`, async () => {
    const { database, product, original } = await fixture(tender);
    const a = await recordConfirmedCashPartialReturn(req(original.sale.id, original.lines[0].id, `ret-${tender}-1`, { refundMethod: tender, manualReference: 'MANUAL-REF-1' }), database);
    expect(a).toMatchObject({ refundMethod: tender, refundedMinor: 1000, returnSequence: 1, disbursementEvidence: 'staff_confirmed_manual_unverified', manualReference: 'MANUAL-REF-1' });
    // Replay of the same key must be refused, not re-paid.
    await expect(recordConfirmedCashPartialReturn(req(original.sale.id, original.lines[0].id, `ret-${tender}-1`, { refundMethod: tender }), database)).rejects.toThrow(/already recorded/);
    const b = await recordConfirmedCashPartialReturn(req(original.sale.id, original.lines[0].id, `ret-${tender}-2`, { refundMethod: tender }), database);
    expect(b.returnSequence).toBe(2);
    // Over-refund: all units already returned.
    await expect(recordConfirmedCashPartialReturn(req(original.sale.id, original.lines[0].id, `ret-${tender}-3`, { refundMethod: tender }), database)).rejects.toThrow(/quantity/);
    expect((await database.products.get(product.id))?.stockQuantity).toBe(3);
    expect(await database.cashPartialReturns.count()).toBe(2);
    expect(await database.centralOperationalEvents.where('kind').equals('sale.cash_partial_refund_recorded').count()).toBe(2);
    expect(await getFinancialSummary('month', new Date(), undefined, undefined, database)).toMatchObject({ revenueMinor: 0, cogsMinor: 0 });
    // Shift drawer: non-cash tender returns are excluded from expected physical cash.
    const shift = (await database.staffShifts.toArray())[0];
    const rows = { sales: await database.sales.toArray(), payments: await database.payments.toArray(), repayments: [], transfers: [], reversals: [], cashReturns: await database.cashPartialReturns.toArray() };
    const cash = calculateTrackedShiftCash(shift, rows as never);
    expect(cash.cashPartialRefundsMinor).toBe(0);
    expect(cash.cashSalesMinor).toBe(0);
    // Backup round trip + tamper detection.
    const backup = await createBackup(database);
    expect(parseBackup(JSON.stringify(backup)).records.cashPartialReturns).toHaveLength(2);
    const forged = structuredClone(backup); forged.records.cashPartialReturns[0].refundMethod = 'cash';
    expect(() => parseBackup(JSON.stringify(forged))).toThrow();
    const noEvidence = structuredClone(backup); delete (noEvidence.records.cashPartialReturns[0] as { disbursementEvidence?: string }).disbursementEvidence;
    expect(() => parseBackup(JSON.stringify(noEvidence))).toThrow();
    const restored = new TallybookDB(`manual-tender-restore-${crypto.randomUUID()}`); openDB.push(restored);
    await initializeDatabase(restored); await restoreBackup(parseBackup(JSON.stringify(backup)), restored);
    expect(await restored.cashPartialReturns.get(a.id)).toEqual(a);
  });
}

it('refuses a refund through a different tender than the original sale and unsupported manual references', async () => {
  const { database, product, original } = await fixture('card');
  await expect(recordConfirmedCashPartialReturn(req(original.sale.id, original.lines[0].id, 'wrong-tender-1', { refundMethod: 'cash' }), database)).rejects.toThrow(/original single tender/);
  await expect(recordConfirmedCashPartialReturn(req(original.sale.id, original.lines[0].id, 'wrong-tender-2', { refundMethod: 'mobile' }), database)).rejects.toThrow(/original single tender/);
  await expect(recordConfirmedCashPartialReturn(req(original.sale.id, original.lines[0].id, 'bad-method-1', { refundMethod: 'wallet' }), database)).rejects.toThrow(/Confirm/);
  await expect(recordConfirmedCashPartialReturn(req(original.sale.id, original.lines[0].id, 'bad-ref-1', { refundMethod: 'card', manualReference: 'x'.repeat(65) }), database)).rejects.toThrow(/Confirm/);
  expect(await database.cashPartialReturns.count()).toBe(0);
  expect((await database.products.get(product.id))?.stockQuantity).toBe(1);
});

it('mobile: rolls back stock, FIFO and journal when the final write fails', async () => {
  const { database, product, original } = await fixture('mobile');
  const beforeCosts = await database.inventoryCostEvents.toArray();
  vi.spyOn(database.centralOperationalEvents, 'add').mockRejectedValueOnce(new Error('simulated event write failure'));
  await expect(recordConfirmedCashPartialReturn(req(original.sale.id, original.lines[0].id, 'rollback-momo-1', { refundMethod: 'mobile' }), database)).rejects.toThrow(/event write failure/);
  expect(await database.cashPartialReturns.count()).toBe(0);
  expect((await database.products.get(product.id))?.stockQuantity).toBe(1);
  expect(await database.inventoryCostEvents.toArray()).toEqual(beforeCosts);
});

it('cash returns on a non-cash original sale cannot enter the drawer calculation', () => {
  const shift = { id: 's', businessProfileId: 'primary', staffId: 'o', openedAt: '2026-01-01', openingFloatMinor: 0 };
  const snap = { sales: [{ id: 's1', businessProfileId: 'primary', shiftId: 's', paymentMethod: 'card' }], payments: [{ saleId: 's1', method: 'card', amountMinor: 2000 }],
    repayments: [], transfers: [], reversals: [], cashReturns: [{ originalSaleId: 's1', shiftId: 's', refundedMinor: 1000 }] };
  expect(() => calculateTrackedShiftCash(shift, snap)).toThrow(/different original tender/);
  expect(calculateTrackedShiftCash(shift, { ...snap, cashReturns: [{ ...snap.cashReturns[0], refundMethod: 'card' }] }).cashPartialRefundsMinor).toBe(0);
});
