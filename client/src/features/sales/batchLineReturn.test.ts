/** ST22-02 / ST23: partial returns of lines sold from expiry/batch-tracked stock go back to their SOURCE batches. */
import Dexie from 'dexie';
import {afterEach, expect, it, vi} from 'vitest';
import {TallybookDB, initializeDatabase} from '@/db/TallybookDB';
import {setActiveBusinessProfileId} from '@/features/business/activeCompany';
import {saveBusinessProfile} from '@/features/business/businessProfile';
import {updateCompanyReturnPolicy} from '@/features/business/returnPolicySettings';
import {createProduct} from '@/features/inventory/inventory';
import {registerBatch} from '@/features/inventory/stage2Inventory';
import {completeSale} from '@/features/sales/sales';
import {recordConfirmedCashPartialReturn} from './cashPartialReturnPosting';
import {reconcileCashPartialReturns} from './cashPartialReturn.mjs';
import {getCashReturnReview} from './cashReturnReview.ts';
import {createStaff, unlockStaff, openShift, lockStaff} from '@/features/staff/staff';
import {auditLocalIntegrity} from '@/features/reliability/integrity';
import {createBackup, parseBackup, restoreBackup} from '@/features/backup/backup';

const open: TallybookDB[] = [];
async function fixture(opts: {batchesBeforeSale?: boolean} = {}) {
  setActiveBusinessProfileId('primary');
  vi.useFakeTimers({toFake: ['Date']}); vi.setSystemTime(new Date('2026-01-02T10:00:00Z'));
  const database = new TallybookDB(`batch-return-${crypto.randomUUID()}`); open.push(database);
  await initializeDatabase(database);
  await saveBusinessProfile({name: 'Batch return test', country: 'Ghana', currency: 'GHS', businessType: 'Retail'}, database);
  const owner = await createStaff('Owner', 'owner', '123456', database);
  await unlockStaff(owner.id, '123456', database);
  await openShift(0, database);
  await updateCompanyReturnPolicy({enabled: true, allowFullReversal: true, allowCashPartial: true, maxAgeDays: 30}, 'fixture opt-in', database);
  const product = await createProduct({name: 'Milk', categoryId: 'uncategorized', sellingPrice: '10', costPrice: '4', initialStock: '7', lowStockThreshold: '0'}, 'GHS', database);
  let early, late;
  if (opts.batchesBeforeSale !== false) {
    early = await registerBatch(product.id, 'LOT-EARLY', 3, '2027-01-31', database);
    late = await registerBatch(product.id, 'LOT-LATE', 4, '2027-06-30', database);
  }
  const original = await completeSale({lines: [{productId: product.id, quantity: 5}], discount: '0', paymentMethod: 'cash', amountPaid: '50', currency: 'GHS', submissionKey: 'batch-sale-0001'}, database);
  vi.setSystemTime(new Date('2026-01-03T10:00:00Z'));
  await unlockStaff(owner.id, '123456', database);
  return {database, product, original, early, late};
}
afterEach(async () => {
  lockStaff('primary'); vi.useRealTimers(); vi.restoreAllMocks(); setActiveBusinessProfileId('primary');
  for (const d of open.splice(0)) { d.close(); await new Dexie(d.name).delete(); }
});
const ret = (saleId: string, lineId: string, qty: number, key: string) => ({originalSaleId: saleId, submissionKey: key, lines: [{saleLineId: lineId, quantity: qty}],
  confirmedRefundMinor: qty * 1000, cashWasRefunded: true, disposition: 'restockable' as const, refundMethod: 'cash' as const});
const batchQty = async (db: TallybookDB, id: string) => (await db.inventoryBatches.get(id))!.quantity;
const batchIssues = async (db: TallybookDB) => (await auditLocalIntegrity(db)).issues.filter(i => /batch|stock|cash-return|return/i.test(i.code));

it('sale allocates by expiry; returns go back to the source batches newest-allocation first, never beyond what each batch supplied', async () => {
  const {database: db, product, original, early, late} = await fixture();
  expect(original.lines[0].batchAllocations).toEqual([{batchId: early!.id, quantity: 3}, {batchId: late!.id, quantity: 2}]);
  expect([await batchQty(db, early!.id), await batchQty(db, late!.id)]).toEqual([0, 2]);
  const review = await getCashReturnReview(original.sale.id, db);
  expect(review.options).toEqual([{saleLineId: original.lines[0].id, productName: 'Milk', remainingQuantity: 5}]);    // offered, not refused

  const r1 = await recordConfirmedCashPartialReturn(ret(original.sale.id, original.lines[0].id, 1, 'batch-ret-0001'), db);
  expect(r1.lines[0].batchRestorations).toEqual([{batchId: late!.id, quantity: 1}]);
  expect([await batchQty(db, early!.id), await batchQty(db, late!.id)]).toEqual([0, 3]);
  const r2 = await recordConfirmedCashPartialReturn(ret(original.sale.id, original.lines[0].id, 2, 'batch-ret-0002'), db);
  expect(r2.lines[0].batchRestorations).toEqual([{batchId: late!.id, quantity: 1}, {batchId: early!.id, quantity: 1}]);   // LATE had room for 1 only
  expect([await batchQty(db, early!.id), await batchQty(db, late!.id)]).toEqual([1, 4]);
  expect((await db.products.get(product.id))!.stockQuantity).toBe(5);
  expect(await batchIssues(db)).toEqual([]);
  const r3 = await recordConfirmedCashPartialReturn(ret(original.sale.id, original.lines[0].id, 2, 'batch-ret-0003'), db);
  expect(r3.lines[0].batchRestorations).toEqual([{batchId: early!.id, quantity: 2}]);
  expect([await batchQty(db, early!.id), await batchQty(db, late!.id)]).toEqual([3, 4]);                  // exactly as before the sale
  expect((await db.products.get(product.id))!.stockQuantity).toBe(7);
  await expect(recordConfirmedCashPartialReturn(ret(original.sale.id, original.lines[0].id, 1, 'batch-ret-0004'), db)).rejects.toThrow();
  expect(await batchIssues(db)).toEqual([]);
});

it('the journal audit refuses forged batch evidence (missing, foreign batch, not adding up, over-restoring, on a non-batch line)', async () => {
  const {database: db, original, early, late} = await fixture();
  await recordConfirmedCashPartialReturn(ret(original.sale.id, original.lines[0].id, 2, 'batch-ret-0101'), db);
  const [sales, lines, payments, returns] = await Promise.all([db.sales.toArray(), db.saleLines.toArray(), db.payments.toArray(), db.cashPartialReturns.toArray()]);
  expect(() => reconcileCashPartialReturns(sales, lines, payments, returns)).not.toThrow();
  const forge = (mut: (r: typeof returns[0]) => void) => { const c = structuredClone(returns); mut(c[0]); return () => reconcileCashPartialReturns(sales, lines, payments, c); };
  expect(forge(r => { delete r.lines[0].batchRestorations; })).toThrow(/batch restorations/);
  expect(forge(r => { r.lines[0].batchRestorations = [{batchId: 'foreign-batch', quantity: 2}]; })).toThrow(/batch/);
  expect(forge(r => { r.lines[0].batchRestorations = [{batchId: late!.id, quantity: 1}]; })).toThrow(/add up/);
  expect(forge(r => { r.lines[0].batchRestorations = [{batchId: late!.id, quantity: 3}]; r.lines[0].quantity = 3; })).toThrow();
  expect(forge(r => { r.lines[0].batchRestorations = [{batchId: late!.id, quantity: 1}, {batchId: late!.id, quantity: 1}]; })).toThrow(/malformed/);
  expect(forge(r => { (r.lines[0].batchRestorations![0] as Record<string, unknown>).note = 'x'; })).toThrow(/malformed/);
  // Over-restoring LATE across returns: it supplied 2 to this line.
  const two = structuredClone(returns); two.push({...structuredClone(returns[0]), id: 'forged-second', submissionKey: 'forged', returnSequence: 2,
    lines: [{...returns[0].lines[0], movementId: 'm-forged', costEventId: 'c-forged', quantity: 1, batchRestorations: [{batchId: late!.id, quantity: 1}]}], refundedMinor: 1000});
  expect(() => reconcileCashPartialReturns(sales, lines, payments, two)).toThrow(/more to a batch/);
  void early;
});

it('a batch-tracked product sold BEFORE batches were registered (no allocation) is refused instead of guessing', async () => {
  const {database: db, product, original} = await fixture({batchesBeforeSale: false});
  expect(original.lines[0].batchAllocations).toBeUndefined();
  await registerBatch(product.id, 'LOT-AFTER', 2, '2027-03-01', db);
  await expect(recordConfirmedCashPartialReturn(ret(original.sale.id, original.lines[0].id, 1, 'batch-ret-0201'), db)).rejects.toThrow(/no batch allocation/);
  expect((await db.products.get(product.id))!.stockQuantity).toBe(2);
});

it('batch restorations survive backup and restore with a clean integrity audit', async () => {
  const {database: db, original, early, late} = await fixture();
  await recordConfirmedCashPartialReturn(ret(original.sale.id, original.lines[0].id, 3, 'batch-ret-0301'), db);
  const text = JSON.stringify(await createBackup(db));
  const parsed = parseBackup(text);
  expect(parsed.records.cashPartialReturns[0].lines[0].batchRestorations).toEqual([{batchId: late!.id, quantity: 2}, {batchId: early!.id, quantity: 1}]);
  const target = new TallybookDB(`batch-restore-${crypto.randomUUID()}`); open.push(target); await initializeDatabase(target);
  await restoreBackup(parsed, target);
  expect([await batchQty(target, early!.id), await batchQty(target, late!.id)]).toEqual([1, 4]);
  expect(await batchIssues(target)).toEqual([]);
});
