/** ST22-02 increment: partial return of a WALLET-PAID sale credits the customer's prepaid wallet; no drawer cash moves. */
import Dexie from 'dexie';
import {afterEach, expect, it, vi} from 'vitest';
import {TallybookDB, initializeDatabase} from '@/db/TallybookDB';
import {setActiveBusinessProfileId} from '@/features/business/activeCompany';
import {saveBusinessProfile} from '@/features/business/businessProfile';
import {updateCompanyReturnPolicy} from '@/features/business/returnPolicySettings';
import {createProduct} from '@/features/inventory/inventory';
import {createCustomer} from '@/features/customers/customers';
import {getCustomerBenefits} from '@/features/customers/customerBenefits';
import {recordWalletTransfer} from '@/features/customers/walletTransfers';
import {completeSale} from '@/features/sales/sales';
import {recordConfirmedCashPartialReturn} from './cashPartialReturnPosting';
import {calculateTrackedShiftCash, createStaff, unlockStaff, openShift, lockStaff} from '@/features/staff/staff';
import {getFinancialSummary} from '@/features/reports/financialIntelligence';
import {auditLocalIntegrity} from '@/features/reliability/integrity';
import {createBackup, parseBackup, restoreBackup} from '@/features/backup/backup';

const open: TallybookDB[] = [];
async function fixture(opts: {tender?: 'wallet' | 'cash'} = {}) {
  setActiveBusinessProfileId('primary');
  vi.useFakeTimers({toFake: ['Date']}); vi.setSystemTime(new Date('2026-01-02T10:00:00Z'));
  const database = new TallybookDB(`wallet-return-${crypto.randomUUID()}`); open.push(database);
  await initializeDatabase(database);
  await saveBusinessProfile({name: 'Wallet return test', country: 'Ghana', currency: 'GHS', businessType: 'Retail'}, database);
  const owner = await createStaff('Owner', 'owner', '123456', database);
  await unlockStaff(owner.id, '123456', database);
  await openShift(0, database);
  await updateCompanyReturnPolicy({enabled: true, allowFullReversal: true, allowCashPartial: true, maxAgeDays: 30}, 'fixture opt-in', database);
  const customer = await createCustomer({name: 'Ama', phone: '0240000001', email: '', address: '', notes: '', status: 'active'}, database);
  const product = await createProduct({name: 'Rice', categoryId: 'uncategorized', sellingPrice: '10', costPrice: '1', initialStock: '5', lowStockThreshold: '0'}, 'GHS', database);
  await recordWalletTransfer({customerId: customer.id, kind: 'deposit', amountMinor: 3000, method: 'cash', reference: 'cash-01', submissionKey: 'deposit-wallet-ret-1'}, database);
  const original = await completeSale({lines: [{productId: product.id, quantity: 2}], customerId: customer.id, discount: '0',
    paymentMethod: opts.tender ?? 'wallet', amountPaid: '20', currency: 'GHS', submissionKey: 'wallet-sale-ret-1'}, database);
  vi.setSystemTime(new Date('2026-01-03T10:00:00Z'));
  await unlockStaff(owner.id, '123456', database);
  return {database, customer, product, original, owner};
}
afterEach(async () => {
  lockStaff('primary'); vi.useRealTimers(); vi.restoreAllMocks(); setActiveBusinessProfileId('primary');
  for (const d of open.splice(0)) { d.close(); await new Dexie(d.name).delete(); }
});
const req = (saleId: string, lineId: string, key: string, extra: Record<string, unknown> = {}) =>
  ({originalSaleId: saleId, submissionKey: key, lines: [{saleLineId: lineId, quantity: 1}], confirmedRefundMinor: 1000,
    disposition: 'restockable' as const, refundMethod: 'wallet' as const, ...extra});

it('credits the wallet exactly once per return, restores FIFO stock, and never touches the cash drawer', async () => {
  const {database, customer, product, original} = await fixture();
  expect((await getCustomerBenefits(customer.id, database)).walletMinor).toBe(1000);       // 3000 deposited - 2000 spent
  const a = await recordConfirmedCashPartialReturn(req(original.sale.id, original.lines[0].id, 'wallet-ret-0001'), database);
  expect(a).toMatchObject({refundMethod: 'wallet', refundedMinor: 1000, returnSequence: 1, customerId: customer.id});
  expect(a).not.toHaveProperty('disbursementEvidence');
  const credit = (await database.customerBenefits.toArray()).find(e => e.submissionKey === `return-wallet-${a.id}`)!;
  expect(credit).toMatchObject({kind: 'wallet', delta: 1000, customerId: customer.id});
  expect((await getCustomerBenefits(customer.id, database)).walletMinor).toBe(2000);
  await expect(recordConfirmedCashPartialReturn(req(original.sale.id, original.lines[0].id, 'wallet-ret-0001'), database)).rejects.toThrow(/already recorded/);
  const b = await recordConfirmedCashPartialReturn(req(original.sale.id, original.lines[0].id, 'wallet-ret-0002'), database);
  expect(b.returnSequence).toBe(2);
  await expect(recordConfirmedCashPartialReturn(req(original.sale.id, original.lines[0].id, 'wallet-ret-0003'), database)).rejects.toThrow(/quantity/);
  expect((await getCustomerBenefits(customer.id, database)).walletMinor).toBe(3000);       // everything came back, nothing extra
  expect((await database.products.get(product.id))?.stockQuantity).toBe(5);
  // Drawer: only the cash deposit counts; wallet returns are not cash movements.
  const shift = (await database.staffShifts.toArray())[0];
  const cash = calculateTrackedShiftCash(shift, {sales: await database.sales.toArray(), payments: await database.payments.toArray(), repayments: [],
    transfers: await database.walletTransfers.toArray(), reversals: [], cashReturns: await database.cashPartialReturns.toArray()} as never);
  expect(cash).toMatchObject({cashPartialRefundsMinor: 0, cashSalesMinor: 0, prepaidCashMinor: 3000, expectedCashMinor: 3000});
});

it('reports conserve: collections stay at the real cash deposit, revenue returns to zero, wallet liability equals the credited balance', async () => {
  const {database, original} = await fixture();
  await recordConfirmedCashPartialReturn(req(original.sale.id, original.lines[0].id, 'wallet-ret-rep-1'), database);
  const summary = await getFinancialSummary('month', new Date(), undefined, undefined, database);
  expect(summary.collectionsMinor).toBe(3000);                    // the wallet deposit only; the wallet refund is not a cash outflow
  expect(summary.revenueMinor).toBe(1000);                        // 2000 sold - 1000 returned
  expect(summary.prepaidLiabilityMinor ?? (summary as unknown as {prepaidLiability?: {liabilityMinor: number}}).prepaidLiability?.liabilityMinor).toBe(2000);
  expect((await auditLocalIntegrity(database)).issues.filter(i => /prepaid|return|wallet/i.test(i.code ?? i.message ?? ''))).toEqual([]);
});

it('a wallet-paid sale can only be refunded to its wallet, and only a wallet sale can be refunded to a wallet', async () => {
  const {database, original} = await fixture();
  for (const [key, extra, re] of [
    ['bad-wallet-1', {refundMethod: 'cash', cashWasRefunded: true}, /prepaid wallet/],
    ['bad-wallet-2', {refundMethod: undefined, cashWasRefunded: true}, /prepaid wallet/],
    ['bad-wallet-3', {cashWasRefunded: true}, /Confirm/],                     // wallet refund is not "cash handed back"
    ['bad-wallet-4', {manualReference: 'REF-1'}, /Confirm/],
    ['bad-wallet-5', {confirmedDebtReductionMinor: 100}, /Confirm/],
    ['bad-wallet-6', {confirmedRefundMinor: 999}, /exact saved invoice return amount/],
  ] as const) await expect(recordConfirmedCashPartialReturn(req(original.sale.id, original.lines[0].id, key, extra as never), database), key).rejects.toThrow(re);
  expect(await database.cashPartialReturns.count()).toBe(0);
  const cash = await fixture({tender: 'cash'});
  await expect(recordConfirmedCashPartialReturn(req(cash.original.sale.id, cash.original.lines[0].id, 'wallet-on-cash-1'), cash.database)).rejects.toThrow(/Confirm|Only a wallet-paid sale|fully paid customer sale/);
  expect(await cash.database.cashPartialReturns.count()).toBe(0);
});

it('rolls back the journal, stock and wallet credit together if the final write fails', async () => {
  const {database, customer, product, original} = await fixture();
  vi.spyOn(database.centralOperationalEvents, 'add').mockRejectedValueOnce(new Error('simulated event write failure'));
  await expect(recordConfirmedCashPartialReturn(req(original.sale.id, original.lines[0].id, 'wallet-rollback-1'), database)).rejects.toThrow(/event write failure/);
  expect(await database.cashPartialReturns.count()).toBe(0);
  expect((await getCustomerBenefits(customer.id, database)).walletMinor).toBe(1000);
  expect((await database.products.get(product.id))?.stockQuantity).toBe(3);
});

it('backup round-trips wallet returns and rejects a forged journal or a removed/inflated wallet credit', async () => {
  const {database, customer, original, owner} = await fixture();
  const a = await recordConfirmedCashPartialReturn(req(original.sale.id, original.lines[0].id, 'wallet-backup-1'), database);
  const backup = await createBackup(database);
  expect(parseBackup(JSON.stringify(backup)).records.cashPartialReturns).toHaveLength(1);
  const noCredit = structuredClone(backup); noCredit.records.customerBenefits = noCredit.records.customerBenefits.filter((e: {submissionKey: string}) => e.submissionKey !== `return-wallet-${a.id}`);
  expect(() => parseBackup(JSON.stringify(noCredit))).toThrow();
  const inflated = structuredClone(backup); inflated.records.customerBenefits.find((e: {submissionKey: string}) => e.submissionKey === `return-wallet-${a.id}`)!.delta = 5000;
  expect(() => parseBackup(JSON.stringify(inflated))).toThrow();
  const asCash = structuredClone(backup); asCash.records.cashPartialReturns[0].refundMethod = 'cash';
  expect(() => parseBackup(JSON.stringify(asCash))).toThrow();
  const restored = new TallybookDB(`wallet-return-restore-${crypto.randomUUID()}`); open.push(restored);
  await initializeDatabase(restored); await restoreBackup(parseBackup(JSON.stringify(backup)), restored);
  await unlockStaff(owner.id, '123456', restored); // restore locks the session by design
  expect((await getCustomerBenefits(customer.id, restored)).walletMinor).toBe(2000);
});
