/** ST22-02: split-tender returns go back through the ORIGINAL tenders; loyalty points earned by the returned value are reversed.
 *  Business choices: allocation (proportional | reverse-order) and loyalty (reverse | keep). Defaults: proportional, reverse. */
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
import {reconcileCashPartialReturns} from './cashPartialReturn.mjs';
import {quoteReviewedCashReturn} from './cashReturnReview.mjs';
import {calculateTrackedShiftCash, createStaff, unlockStaff, openShift, lockStaff} from '@/features/staff/staff';
import {getFinancialSummary} from '@/features/reports/financialIntelligence';
import {auditLocalIntegrity} from '@/features/reliability/integrity';
import {createBackup, parseBackup, restoreBackup} from '@/features/backup/backup';

const open: TallybookDB[] = [];
interface Opts { allocation?: 'proportional' | 'reverse-order'; loyalty?: 'reverse' | 'keep'; customer?: boolean; points?: boolean; tender?: 'split' | 'cash' | 'credit' }
async function fixture(o: Opts = {}) {
  setActiveBusinessProfileId('primary');
  vi.useFakeTimers({toFake: ['Date']}); vi.setSystemTime(new Date('2026-01-02T10:00:00Z'));
  const database = new TallybookDB(`split-return-${crypto.randomUUID()}`); open.push(database);
  await initializeDatabase(database);
  await saveBusinessProfile({name: 'Split return test', country: 'Ghana', currency: 'GHS', businessType: 'Retail'}, database);
  const owner = await createStaff('Owner', 'owner', '123456', database);
  await unlockStaff(owner.id, '123456', database);
  await openShift(0, database);
  await updateCompanyReturnPolicy({enabled: true, allowFullReversal: true, allowCashPartial: true, maxAgeDays: 30,
    ...(o.allocation ? {refundAllocation: o.allocation} : {}), ...(o.loyalty ? {loyaltyOnReturn: o.loyalty} : {})}, 'fixture opt-in', database);
  const customer = o.customer === false ? undefined : await createCustomer({name: 'Ama', phone: '0240000001', email: '', address: '', notes: '', status: 'active'}, database);
  if (customer && o.points !== false) await setCustomerPolicy(customer.id, {loyaltySpendMinorPerPoint: 100, loyaltyPointValueMinor: 10}, database);
  const product = await createProduct({name: 'Rice', categoryId: 'uncategorized', sellingPrice: '10', costPrice: '1', initialStock: '10', lowStockThreshold: '0'}, 'GHS', database);
  const tender = o.tender ?? 'split';
  const base = {lines: [{productId: product.id, quantity: 2}], ...(customer ? {customerId: customer.id} : {}), discount: '0', currency: 'GHS', submissionKey: 'original-sale-0001'};
  const original = await completeSale(tender === 'split'
    ? {...base, paymentMethod: 'split', amountPaid: '20', splitTenders: [{method: 'cash', amount: '8'}, {method: 'card', amount: '12', reference: 'TERM-2026-001'}]}
    : tender === 'cash' ? {...base, paymentMethod: 'cash', amountPaid: '20'}
    : {...base, paymentMethod: 'cash', amountPaid: '6'}, database); // part-paid cash sale: pays 6.00 now, owes the rest
  vi.setSystemTime(new Date('2026-01-03T10:00:00Z'));
  await unlockStaff(owner.id, '123456', database);
  return {database, customer, product, original, owner};
}
afterEach(async () => {
  lockStaff('primary'); vi.useRealTimers(); vi.restoreAllMocks(); setActiveBusinessProfileId('primary');
  for (const d of open.splice(0)) { d.close(); await new Dexie(d.name).delete(); }
});
type Leg = {method: 'cash' | 'mobile' | 'card'; amountMinor: number};
const post = async (f: Awaited<ReturnType<typeof fixture>>, key: string, extra: Record<string, unknown> = {}) => {
  const review = await getCashReturnReview(f.original.sale.id, f.database);
  const q = quoteReviewedCashReturn(review, f.original.lines[0].id, 1);
  const isSplit = review.refundMethod === 'split';
  return {review, q, result: await recordConfirmedCashPartialReturn({originalSaleId: f.original.sale.id, submissionKey: key,
    lines: [{saleLineId: f.original.lines[0].id, quantity: 1}], disposition: 'restockable',
    confirmedRefundMinor: q.refundMinor, confirmedDebtReductionMinor: q.debtReducedMinor,
    ...(q.refundMinor > 0 ? {cashWasRefunded: true} : {}),
    ...(isSplit && q.refundMinor > 0 ? {refundMethod: 'split' as const, confirmedLegs: q.legs as Leg[]} : review.refundMethod === 'credit' || q.refundMinor === 0 ? {} : {refundMethod: review.refundMethod as 'cash'}),
    ...extra}, f.database)};
};

it('proportional (default): each return is split across the original tenders exactly, to the last minor unit', async () => {
  const f = await fixture({customer: false});
  const a = await post(f, 'split-ret-0001');
  expect(a.q.legs).toEqual([{method: 'cash', amountMinor: 400}, {method: 'card', amountMinor: 600}]);
  expect(a.result).toMatchObject({refundMethod: 'split', refundedMinor: 1000, allocationPolicy: 'proportional', disbursementEvidence: 'staff_confirmed_manual_unverified'});
  const b = await post(f, 'split-ret-0002');
  expect(b.result.legs).toEqual([{method: 'cash', amountMinor: 400}, {method: 'card', amountMinor: 600}]);
  const totals = (await f.database.cashPartialReturns.toArray()).flatMap(r => r.legs ?? []).reduce((m, l) => ({...m, [l.method]: (m[l.method] ?? 0) + l.amountMinor}), {} as Record<string, number>);
  expect(totals).toEqual({cash: 800, card: 1200}); // exactly what was paid through each, no more
  await expect(post(f, 'split-ret-0003')).rejects.toThrow(/quantity|Select/);
  expect((await f.database.products.get(f.product.id))?.stockQuantity).toBe(10);
});

it('business choice reverse-order: the last tender used (card) is refunded first, then the one before', async () => {
  const f = await fixture({customer: false, allocation: 'reverse-order'});
  expect((await post(f, 'rev-ret-0001')).result.legs).toEqual([{method: 'card', amountMinor: 1000}]);
  const second = await post(f, 'rev-ret-0002');
  expect(second.result).toMatchObject({allocationPolicy: 'reverse-order', legs: [{method: 'cash', amountMinor: 800}, {method: 'card', amountMinor: 200}]});
});

it('the cashier must confirm exactly the policy split; any other leg set, method or missing legs is refused and nothing is written', async () => {
  const f = await fixture({customer: false});
  const review = await getCashReturnReview(f.original.sale.id, f.database);
  const q = quoteReviewedCashReturn(review, f.original.lines[0].id, 1);
  const base = {originalSaleId: f.original.sale.id, lines: [{saleLineId: f.original.lines[0].id, quantity: 1}], disposition: 'restockable' as const, confirmedRefundMinor: q.refundMinor, cashWasRefunded: true as const};
  for (const [key, extra, re] of [
    ['bad-legs-0001', {refundMethod: 'split', confirmedLegs: [{method: 'cash', amountMinor: 1000}]}, /do not match the exact split/],
    ['bad-legs-0002', {refundMethod: 'split', confirmedLegs: [{method: 'cash', amountMinor: 500}, {method: 'card', amountMinor: 500}]}, /do not match the exact split/],
    ['bad-legs-0003', {refundMethod: 'split', confirmedLegs: [{method: 'card', amountMinor: 600}]}, /do not match the exact split/],
    ['bad-legs-0004', {refundMethod: 'cash'}, /original tenders|review the refund legs/],
    ['bad-legs-0005', {}, /original tenders|review the refund legs/],
    ['bad-legs-0006', {refundMethod: 'split'}, /Confirm/],
    ['bad-legs-0007', {refundMethod: 'split', confirmedLegs: q.legs, manualReference: 'REF-1'}, /Confirm/],
    ['bad-legs-0008', {refundMethod: 'cash', confirmedLegs: q.legs}, /Confirm/],
  ] as const) await expect(recordConfirmedCashPartialReturn({...base, submissionKey: key, ...(extra as object)} as never, f.database), key).rejects.toThrow(re);
  expect(await f.database.cashPartialReturns.count()).toBe(0);
  expect((await f.database.products.get(f.product.id))?.stockQuantity).toBe(8);
});

it('only the CASH leg of a split refund leaves the drawer; reports and the integrity audit stay consistent', async () => {
  const f = await fixture({customer: false});
  await post(f, 'drawer-ret-0001');
  const shift = (await f.database.staffShifts.toArray())[0];
  const rows = {sales: await f.database.sales.toArray(), payments: await f.database.payments.toArray(), repayments: [], transfers: [], reversals: [], cashReturns: await f.database.cashPartialReturns.toArray()};
  expect(calculateTrackedShiftCash(shift, rows as never)).toMatchObject({cashSalesMinor: 800, cashPartialRefundsMinor: -400, expectedCashMinor: 400});
  const summary = await getFinancialSummary('month', new Date(), undefined, undefined, f.database);
  expect(summary.revenueMinor).toBe(1000); expect(summary.collectionsMinor).toBe(1000);
  expect((await auditLocalIntegrity(f.database)).issues.filter(i => /return|wallet|split|loyalty/i.test(String(i.code)))).toEqual([]);
});

it('loyalty (default): the points the returned value earned are taken back, exactly and cumulatively', async () => {
  const f = await fixture();
  expect((await getCustomerBenefits(f.customer!.id, f.database)).points).toBe(20); // 2000 minor / 100 per point
  const a = await post(f, 'loy-ret-0001');
  expect(a.q.points).toMatchObject({reverse: 10, shortfall: 0});
  expect(a.result.loyalty).toEqual({policy: 'reverse', earnedPoints: 20, pointsReversed: 10, pointsShortfall: 0});
  expect((await f.database.customerBenefits.toArray()).find(e => e.submissionKey === `return-points-${a.result.id}`)).toMatchObject({kind: 'points', delta: -10});
  expect((await getCustomerBenefits(f.customer!.id, f.database)).points).toBe(10);
  await post(f, 'loy-ret-0002');
  expect((await getCustomerBenefits(f.customer!.id, f.database)).points).toBe(0);
  expect((await auditLocalIntegrity(f.database)).issues.filter(i => /loyalty/i.test(String(i.code)))).toEqual([]);
});

it('points the customer has already spent are never driven negative: the unrecoverable part is recorded as a shortfall', async () => {
  const f = await fixture();
  await recordCustomerBenefit({customerId: f.customer!.id, kind: 'points', delta: -15, reason: 'Spent elsewhere', submissionKey: 'spend-points-0001'}, f.database);
  expect((await getCustomerBenefits(f.customer!.id, f.database)).points).toBe(5);
  const a = await post(f, 'shortfall-0001');
  expect(a.result.loyalty).toMatchObject({pointsReversed: 5, pointsShortfall: 5});
  expect((await getCustomerBenefits(f.customer!.id, f.database)).points).toBe(0);
  expect((await auditLocalIntegrity(f.database)).issues.filter(i => /loyalty/i.test(String(i.code)))).toEqual([]);
});

it("business choice 'keep': points stay with the customer and the decision is recorded as evidence", async () => {
  const f = await fixture({loyalty: 'keep'});
  const a = await post(f, 'keep-ret-0001');
  expect(a.q.points).toMatchObject({reverse: 0});
  expect(a.result.loyalty).toEqual({policy: 'keep', earnedPoints: 20, pointsReversed: 0, pointsShortfall: 0});
  expect((await getCustomerBenefits(f.customer!.id, f.database)).points).toBe(20);
  expect((await f.database.customerBenefits.toArray()).some(e => e.submissionKey.startsWith('return-points-'))).toBe(false);
});

it('a fully paid single-tender customer sale (previously unsupported) can now be returned, reversing its points', async () => {
  const f = await fixture({tender: 'cash'});
  const a = await post(f, 'cash-cust-0001');
  expect(a.result).toMatchObject({refundMethod: 'cash', refundedMinor: 1000, customerId: f.customer!.id, loyalty: {pointsReversed: 10}});
  expect((await getCustomerBenefits(f.customer!.id, f.database)).points).toBe(10);
});

it('a part-paid sale: debt is reduced first; only the tender portion reverses points', async () => {
  const f = await fixture({tender: 'credit'});          // total 2000, paid 600 (earns 6 points), owes 1400
  expect((await getCustomerBenefits(f.customer!.id, f.database)).points).toBe(6);
  const a = await post(f, 'credit-pts-0001');           // 1000 returned: all goes to the debt, nothing refunded
  expect(a.result).toMatchObject({refundMethod: 'credit', refundedMinor: 0, debtReducedMinor: 1000});
  expect(a.result.loyalty).toMatchObject({pointsReversed: 0});
  expect((await getCustomerBenefits(f.customer!.id, f.database)).points).toBe(6);
  const b = await post(f, 'credit-pts-0002');           // 400 more debt, then 600 refunded through the original tender -> all 6 points
  expect(b.result).toMatchObject({debtReducedMinor: 400, refundedMinor: 600});
  expect(b.result.loyalty).toMatchObject({pointsReversed: 6});
  expect((await getCustomerBenefits(f.customer!.id, f.database)).points).toBe(0);
});

it('a sale that redeemed loyalty points is still refused (restoring redeemed points is not built), with a clear message', async () => {
  const f = await fixture({tender: 'cash'});
  await f.database.sales.update(f.original.sale.id, {loyaltyRedeemedPoints: 1, loyaltyRedeemedMinor: 10});
  await expect(getCashReturnReview(f.original.sale.id, f.database)).rejects.toThrow();
});

it('rolls back the journal, stock, legs and points together if the final write fails', async () => {
  const f = await fixture();
  vi.spyOn(f.database.centralOperationalEvents, 'add').mockRejectedValueOnce(new Error('simulated event write failure'));
  await expect(post(f, 'rollback-0001')).rejects.toThrow(/event write failure/);
  expect(await f.database.cashPartialReturns.count()).toBe(0);
  expect((await getCustomerBenefits(f.customer!.id, f.database)).points).toBe(20);
  expect((await f.database.products.get(f.product.id))?.stockQuantity).toBe(8);
});

it('backup round-trips split and loyalty returns, and refuses a forged leg total, a removed points deduction or an inflated one', async () => {
  const f = await fixture();
  const a = await post(f, 'backup-ret-0001');
  const backup = await createBackup(f.database);
  expect(parseBackup(JSON.stringify(backup)).records.cashPartialReturns).toHaveLength(1);
  const forge = (edit: (b: typeof backup) => void) => { const c = structuredClone(backup); edit(c); return () => parseBackup(JSON.stringify(c)); };
  expect(forge(b => { b.records.cashPartialReturns[0].legs![0].amountMinor += 1; })).toThrow();
  expect(forge(b => { b.records.cashPartialReturns[0].legs = undefined; })).toThrow();
  // Same total, but more refunded through cash than the customer paid in cash (800): only the per-tender cap can catch this.
  expect(forge(b => { b.records.cashPartialReturns[0].legs = [{method: 'cash', amountMinor: 900}, {method: 'card', amountMinor: 100}]; })).toThrow();
  // A leg for a tender the sale never used.
  expect(forge(b => { b.records.cashPartialReturns[0].legs = [{method: 'mobile', amountMinor: 1000}]; })).toThrow();
  expect(forge(b => { b.records.cashPartialReturns[0].refundMethod = 'cash'; })).toThrow();
  expect(forge(b => { b.records.customerBenefits = b.records.customerBenefits.filter((e: {submissionKey: string}) => e.submissionKey !== `return-points-${a.result.id}`); })).toThrow();
  expect(forge(b => { b.records.customerBenefits.find((e: {submissionKey: string}) => e.submissionKey === `return-points-${a.result.id}`)!.delta = -11; })).toThrow();
  expect(forge(b => { b.records.cashPartialReturns[0].loyalty!.pointsReversed = 9; })).toThrow();
  const restored = new TallybookDB(`split-return-restore-${crypto.randomUUID()}`); open.push(restored);
  await initializeDatabase(restored); await restoreBackup(parseBackup(JSON.stringify(backup)), restored);
  expect(await restored.cashPartialReturns.get(a.result.id)).toEqual(a.result);
});

it('older policy revisions without the new choices mean the defaults; changing only the window keeps what the business chose', async () => {
  const f = await fixture({allocation: 'reverse-order', loyalty: 'keep'});
  await updateCompanyReturnPolicy({enabled: true, allowFullReversal: true, allowCashPartial: true, maxAgeDays: 60}, 'only the window', f.database);
  const profile = (await f.database.businessProfiles.toArray())[0];
  const last = profile.returnPolicyHistory!.at(-1)!;
  expect([last.refundAllocation, last.loyaltyOnReturn, last.maxAgeDays]).toEqual(['reverse-order', 'keep', 60]);
  const legacy = {...profile, returnPolicyHistory: profile.returnPolicyHistory!.map(({refundAllocation, loyaltyOnReturn, ...rest}) => rest)};
  const {companyReturnChoices} = await import('@/features/business/returnPolicy.mjs');
  expect(companyReturnChoices(legacy.returnPolicyHistory as never)).toEqual({refundAllocation: 'proportional', loyaltyOnReturn: 'reverse'});
});

it('the journal validator itself refuses refunding more through a tender than was paid through it (cap), and a tender the sale never used', async () => {
  const f = await fixture({customer: false});
  const a = await post(f, 'cap-ret-0001');
  const sales = await f.database.sales.toArray(), lines = await f.database.saleLines.toArray(), payments = await f.database.payments.toArray();
  expect(() => reconcileCashPartialReturns(sales, lines, payments, [a.result], [])).not.toThrow();
  const overCash = {...a.result, legs: [{method: 'cash', amountMinor: 900}, {method: 'card', amountMinor: 100}]};
  expect(() => reconcileCashPartialReturns(sales, lines, payments, [overCash as never], [])).toThrow(/more through a tender than the customer paid/);
  const unused = {...a.result, legs: [{method: 'mobile', amountMinor: 1000}]};
  expect(() => reconcileCashPartialReturns(sales, lines, payments, [unused as never], [])).toThrow(/more through a tender than the customer paid/);
  const twice = {...a.result, legs: [{method: 'cash', amountMinor: 500}, {method: 'cash', amountMinor: 500}]};
  expect(() => reconcileCashPartialReturns(sales, lines, payments, [twice as never], [])).toThrow(/malformed/);
});
