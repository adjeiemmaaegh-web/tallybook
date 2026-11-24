/** ST22-02: returns on sales partly paid with loyalty points give back the SPENT points for the returned share (business policy). */
import Dexie from 'dexie';
import {afterEach, expect, it, vi} from 'vitest';
import {TallybookDB, initializeDatabase} from '@/db/TallybookDB';
import {setActiveBusinessProfileId} from '@/features/business/activeCompany';
import {saveBusinessProfile} from '@/features/business/businessProfile';
import {updateCompanyReturnPolicy} from '@/features/business/returnPolicySettings';
import {createProduct} from '@/features/inventory/inventory';
import {createCustomer} from '@/features/customers/customers';
import {getCustomerBenefits, setCustomerPolicy, recordCustomerBenefit} from '@/features/customers/customerBenefits';
import {completeSale} from '@/features/sales/sales';
import {recordConfirmedCashPartialReturn} from './cashPartialReturnPosting';
import {getCashReturnReview} from './cashReturnReview.ts';
import {quoteReviewedCashReturn} from './cashReturnReview.mjs';
import {reconcileCashPartialReturns} from './cashPartialReturn.mjs';
import {reconcileLoyaltyReturns} from './loyaltyReturnAudit.mjs';
import {createStaff, unlockStaff, openShift, lockStaff} from '@/features/staff/staff';
import {auditLocalIntegrity} from '@/features/reliability/integrity';
import {createBackup, parseBackup, restoreBackup} from '@/features/backup/backup';

const open: TallybookDB[] = [];
async function fixture(policy: 'restore' | 'forfeit' | undefined = undefined) {
  setActiveBusinessProfileId('primary');
  vi.useFakeTimers({toFake: ['Date']}); vi.setSystemTime(new Date('2026-01-02T10:00:00Z'));
  const database = new TallybookDB(`redeemed-return-${crypto.randomUUID()}`); open.push(database);
  await initializeDatabase(database);
  await saveBusinessProfile({name: 'Points return test', country: 'Ghana', currency: 'GHS', businessType: 'Retail'}, database);
  const owner = await createStaff('Owner', 'owner', '123456', database);
  await unlockStaff(owner.id, '123456', database);
  await openShift(0, database);
  await updateCompanyReturnPolicy({enabled: true, allowFullReversal: true, allowCashPartial: true, maxAgeDays: 30, ...(policy ? {redeemedPointsOnReturn: policy} : {})}, 'fixture opt-in', database);
  const customer = await createCustomer({name: 'Ama', phone: '0240000001', email: '', address: '', notes: '', status: 'active'}, database);
  await setCustomerPolicy(customer.id, {loyaltySpendMinorPerPoint: 100, loyaltyPointValueMinor: 10}, database);
  await recordCustomerBenefit({customerId: customer.id, kind: 'points', delta: 50, reason: 'opening points', submissionKey: 'opening-points-0001'}, database);
  const product = await createProduct({name: 'Rice', categoryId: 'uncategorized', sellingPrice: '10', costPrice: '1', initialStock: '10', lowStockThreshold: '0'}, 'GHS', database);
  // 2 x 10.00 = 20.00; 20 points x 0.10 = 2.00 loyalty discount; customer pays 18.00 cash and earns floor(1800/100) = 18 points.
  const original = await completeSale({lines: [{productId: product.id, quantity: 2}], customerId: customer.id, discount: '0', redeemPoints: 20,
    paymentMethod: 'cash', amountPaid: '18', currency: 'GHS', submissionKey: 'points-sale-0001'}, database);
  vi.setSystemTime(new Date('2026-01-03T10:00:00Z'));
  await unlockStaff(owner.id, '123456', database);
  return {database, customer, product, original};
}
afterEach(async () => {
  lockStaff('primary'); vi.useRealTimers(); vi.restoreAllMocks(); setActiveBusinessProfileId('primary');
  for (const d of open.splice(0)) { d.close(); await new Dexie(d.name).delete(); }
});
const ret = (saleId: string, lineId: string, key: string) => ({originalSaleId: saleId, submissionKey: key, lines: [{saleLineId: lineId, quantity: 1}],
  confirmedRefundMinor: 900, cashWasRefunded: true, disposition: 'restockable' as const, refundMethod: 'cash' as const});
const points = async (f: Awaited<ReturnType<typeof fixture>>) => (await getCustomerBenefits(f.customer.id, f.database)).points;

it('default policy: each returned item gives back its share of the spent points, earned points are taken back, and the balance ends where it started', async () => {
  const f = await fixture();
  expect(f.original.sale).toMatchObject({loyaltyRedeemedPoints: 20, loyaltyRedeemedMinor: 200, discountMinor: 200, amountPaidMinor: 1800});
  expect(await points(f)).toBe(50 - 20 + 18);
  const review = await getCashReturnReview(f.original.sale.id, f.database);
  const q = quoteReviewedCashReturn(review, f.original.lines[0].id, 1);
  expect(q).toMatchObject({refundMinor: 900, discountMinor: 100, restoredPoints: 10});
  const r1 = await recordConfirmedCashPartialReturn(ret(f.original.sale.id, f.original.lines[0].id, 'points-ret-0001'), f.database);
  expect(r1.redeemed).toEqual({policy: 'restore', redeemedPoints: 20, pointsRestored: 10});
  expect(r1.loyalty).toMatchObject({pointsReversed: 9});
  expect(await points(f)).toBe(48 + 10 - 9);
  const r2 = await recordConfirmedCashPartialReturn(ret(f.original.sale.id, f.original.lines[0].id, 'points-ret-0002'), f.database);
  expect(r2.redeemed?.pointsRestored).toBe(10);
  expect(await points(f)).toBe(50);                                         // all spent points back, all earned points gone
  expect((await auditLocalIntegrity(f.database)).issues.filter(i => /loyalty|return|points/i.test(i.code))).toEqual([]);
});

it("'forfeit' policy: spent points are not given back, and the return still records that decision", async () => {
  const f = await fixture('forfeit');
  const review = await getCashReturnReview(f.original.sale.id, f.database);
  expect(quoteReviewedCashReturn(review, f.original.lines[0].id, 1).restoredPoints).toBe(0);
  const r = await recordConfirmedCashPartialReturn(ret(f.original.sale.id, f.original.lines[0].id, 'points-ret-0101'), f.database);
  expect(r.redeemed).toEqual({policy: 'forfeit', redeemedPoints: 20, pointsRestored: 0});
  expect(await points(f)).toBe(48 - 9);
  expect((await f.database.customerBenefits.toArray()).some(b => b.submissionKey.startsWith('return-redeemed-'))).toBe(false);
});

it('the audits refuse forged spent-points evidence and forged or orphaned restore entries', async () => {
  const f = await fixture();
  await recordConfirmedCashPartialReturn(ret(f.original.sale.id, f.original.lines[0].id, 'points-ret-0201'), f.database);
  const [sales, lines, payments, returns, benefits] = await Promise.all([f.database.sales.toArray(), f.database.saleLines.toArray(), f.database.payments.toArray(), f.database.cashPartialReturns.toArray(), f.database.customerBenefits.toArray()]);
  expect(() => reconcileCashPartialReturns(sales, lines, payments, returns)).not.toThrow();
  expect(() => reconcileLoyaltyReturns({sales, benefits, returns})).not.toThrow();
  const journal = (mut: (r: typeof returns[0]) => void) => { const c = structuredClone(returns); mut(c[0]); return () => reconcileCashPartialReturns(sales, lines, payments, c); };
  expect(journal(r => { delete r.redeemed; })).toThrow(/spent on the sale/);
  expect(journal(r => { r.redeemed!.pointsRestored = 20; })).toThrow(/different number of spent points/);
  expect(journal(r => { r.redeemed!.redeemedPoints = 25; })).toThrow(/spent on the sale/);
  expect(journal(r => { (r.redeemed as Record<string, unknown>).extra = 1; })).toThrow(/spent on the sale/);
  expect(journal(r => { r.redeemed!.policy = 'forfeit'; })).toThrow(/different number/);
  const ledger = (mut: (b: typeof benefits) => typeof benefits) => () => reconcileLoyaltyReturns({sales, benefits: mut(structuredClone(benefits)), returns});
  expect(ledger(b => b.map(x => x.submissionKey.startsWith('return-redeemed-') ? {...x, delta: 15} : x))).toThrow(/spent-points refund/);
  expect(ledger(b => b.filter(x => !x.submissionKey.startsWith('return-redeemed-')))).toThrow(/spent-points refund/);
  expect(ledger(b => [...b, {...b.find(x => x.submissionKey.startsWith('return-redeemed-'))!, id: 'orphan', submissionKey: 'return-redeemed-nope'}])).toThrow(/no matching return/);
});

it('a cash sale with spent points but no customer is impossible to return through this lane; backup and restore keep the evidence', async () => {
  const f = await fixture();
  await recordConfirmedCashPartialReturn(ret(f.original.sale.id, f.original.lines[0].id, 'points-ret-0301'), f.database);
  const parsed = parseBackup(JSON.stringify(await createBackup(f.database)));
  expect(parsed.records.cashPartialReturns[0].redeemed).toEqual({policy: 'restore', redeemedPoints: 20, pointsRestored: 10});
  const target = new TallybookDB(`redeemed-restore-${crypto.randomUUID()}`); open.push(target); await initializeDatabase(target);
  await restoreBackup(parsed, target);
  expect((await auditLocalIntegrity(target)).issues.filter(i => /loyalty|return|points/i.test(i.code))).toEqual([]);
});
