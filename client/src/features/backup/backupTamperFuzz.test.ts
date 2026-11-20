/**
 * ST24-03/08: a backup that cannot be restored, or that restores altered money, does not satisfy recovery.
 * A populated backup (cash, card, credit, part-paid sales, linked repayment, credit-note and tender returns)
 * is attacked three ways. parseBackup must either THROW or return data identical to the original.
 *  1. every numeric money field in every financial table changed by +1 (one at a time)
 *  2. truncation at many offsets
 *  3. seeded random byte flips
 * It also proves a rejected/failed restore leaves the target database unchanged.
 */
import Dexie from 'dexie';
import { afterEach, expect, it, vi } from 'vitest';
import { TallybookDB, initializeDatabase } from '@/db/TallybookDB';
import { setActiveBusinessProfileId } from '@/features/business/activeCompany';
import { saveBusinessProfile } from '@/features/business/businessProfile';
import { updateCompanyReturnPolicy } from '@/features/business/returnPolicySettings';
import { createProduct } from '@/features/inventory/inventory';
import { createCustomer } from '@/features/customers/customers';
import { getCustomerRepaymentTargets, recordRepayment } from '@/features/credit/credit';
import { completeSale } from '@/features/sales/sales';
import { recordConfirmedCashPartialReturn } from '@/features/sales/cashPartialReturnPosting';
import { createStaff, unlockStaff, openShift, lockStaff } from '@/features/staff/staff';
import { createBackup, parseBackup, restoreBackup } from './backup';

const openDB: TallybookDB[] = [];
afterEach(async () => {
  lockStaff('primary'); vi.useRealTimers(); vi.restoreAllMocks(); setActiveBusinessProfileId('primary');
  for (const database of openDB.splice(0)) { database.close(); await new Dexie(database.name).delete(); }
});

async function populated() {
  setActiveBusinessProfileId('primary');
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-01-02T10:00:00Z'));
  const database = new TallybookDB(`tamper-${crypto.randomUUID()}`); openDB.push(database);
  await initializeDatabase(database);
  await saveBusinessProfile({ name: 'Tamper shop', country: 'Ghana', currency: 'GHS', businessType: 'Retail' }, database);
  const owner = await createStaff('Owner', 'owner', '123456', database);
  await unlockStaff(owner.id, '123456', database); await openShift(0, database);
  await updateCompanyReturnPolicy({ enabled: true, allowFullReversal: true, allowCashPartial: true, maxAgeDays: 30 }, 'fixture', database);
  const customer = await createCustomer({ name: 'Ama Tamper', phone: '+233205550099', email: '', address: '', notes: '', status: 'active' }, database);
  const product = await createProduct({ name: 'Rice', categoryId: 'uncategorized', sellingPrice: '10', costPrice: '1', initialStock: '50', lowStockThreshold: '0' }, 'GHS', database);
  const sale = (extra: object) => completeSale({ lines: [{ productId: product.id, quantity: 2 }], discount: '0', currency: 'GHS', ...extra } as never, database);
  const cash = await sale({ paymentMethod: 'cash', amountPaid: '20', submissionKey: 'tamper-cash-key01' });
  await sale({ paymentMethod: 'card', amountPaid: '20', cardReference: 'TERM-0001', submissionKey: 'tamper-card-key01' });
  const credit = await sale({ paymentMethod: 'credit', amountPaid: '0', customerId: customer.id, submissionKey: 'tamper-cred-key01' });
  const part = await sale({ paymentMethod: 'cash', amountPaid: '5', customerId: customer.id, submissionKey: 'tamper-part-key01' });
  vi.setSystemTime(new Date('2026-01-03T10:00:00Z')); await unlockStaff(owner.id, '123456', database);
  const targets = await getCustomerRepaymentTargets(customer.id, 'GHS', database);
  const t = targets.targets.find(x => x.saleId === part.sale.id)!;
  await recordRepayment({ customerId: customer.id, amount: '4.00', method: 'cash', currency: 'GHS', submissionKey: 'tamper-repay-key1', saleAllocations: [{ saleId: part.sale.id, amountMinor: 400 }] }, database);
  void t;
  const ret = (s: { sale: { id: string }; lines: { id: string }[] }, key: string, debt: number, refund: number, method?: string) =>
    recordConfirmedCashPartialReturn({ originalSaleId: s.sale.id, submissionKey: key, lines: [{ saleLineId: s.lines[0].id, quantity: 1 }],
      confirmedRefundMinor: refund, confirmedDebtReductionMinor: debt, disposition: 'restockable',
      ...(refund > 0 ? { cashWasRefunded: true as const, refundMethod: method as 'cash' } : {}) }, database);
  await ret(cash, 'tamper-ret-cash-01', 0, 1000, 'cash');
  await ret(credit, 'tamper-ret-cred-01', 1000, 0);
  return { database, original: parseBackup(JSON.stringify(await createBackup(database))) };
}

const MONEY_TABLES = ['sales', 'payments', 'repayments', 'cashPartialReturns', 'saleLines', 'customers', 'inventoryCostEvents', 'inventoryMovements', 'products'] as const;
function numericPaths(row: unknown, prefix = ''): string[] {
  if (typeof row === 'number') return Number.isInteger(row) ? [prefix] : [];
  if (Array.isArray(row)) return row.flatMap((v, i) => numericPaths(v, `${prefix}[${i}]`));
  if (row && typeof row === 'object') return Object.entries(row).flatMap(([k, v]) => numericPaths(v, prefix ? `${prefix}.${k}` : k));
  return [];
}
function bump(root: unknown, path: string) {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let cur = root as Record<string, unknown>;
  for (const p of parts.slice(0, -1)) cur = cur[p] as Record<string, unknown>;
  const last = parts.at(-1)!; cur[last] = (cur[last] as number) + 1;
}

it('every single-field +1 change to a money/quantity field is rejected or identical', async () => {
  const { original } = await populated();
  const text = JSON.stringify(original);
  const survivors: string[] = []; let attempts = 0;
  for (const table of MONEY_TABLES) {
    const rows = (original.records as Record<string, unknown[]>)[table];
    for (const [index, row] of rows.entries()) {
      for (const path of numericPaths(row)) {
        // Timestamps/sequence-like fields are covered by their own validators; every integer is attacked anyway.
        const copy = JSON.parse(text); bump(copy.records[table][index], path); attempts++;
        let accepted = false;
        try { parseBackup(JSON.stringify(copy)); accepted = true; } catch { /* rejected: good */ }
        if (accepted) survivors.push(`${table}[${index}].${path}`);
      }
    }
  }
  expect(attempts).toBeGreaterThan(100);
  // Fields the backup format deliberately does not cross-check are reported, not hidden.
  // Documented limitation: no embedded digest exists, so MUTABLE catalogue fields (price, cost, reorder level)
  // cannot be cross-checked against the ledger and are protected only by the optional external SHA-256 file receipt.
  // Every ledger-conserved field must be rejected; this pins the accepted set so any change is noticed.
  const acceptedFields = [...new Set(survivors.map(s => s.replace(/\[\d+\]/g, '')))].sort();
  expect(acceptedFields).toEqual(['products.costPriceMinor', 'products.lowStockThreshold', 'products.sellingPriceMinor']);
}, 120_000);

it('truncation at many offsets and seeded random byte flips never yield different data', async () => {
  const { original } = await populated();
  const text = JSON.stringify(original);
  const canonical = JSON.stringify(parseBackup(text));
  for (let i = 1; i <= 40; i++) {
    const cut = Math.floor((text.length * i) / 41);
    expect(() => parseBackup(text.slice(0, cut)), `truncated at ${cut}`).toThrow();
  }
  let seed = 12345; const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  let accepted = 0, rejected = 0;
  for (let i = 0; i < 400; i++) {
    const pos = Math.floor(rnd() * text.length); const chars = text.split('');
    const flip = '0123456789abcdefXYZ{}[]":,'; chars[pos] = flip[Math.floor(rnd() * flip.length)];
    const mutated = chars.join('');
    if (mutated === text) continue;
    try { const out = JSON.stringify(parseBackup(mutated)); accepted++; expect(out, `byte flip at ${pos} changed restored data silently`).toBe(canonical); }
    catch { rejected++; }
  }
  console.log(`byte flips accepted-identical=${accepted} rejected=${rejected}`);
  expect(rejected).toBeGreaterThan(300);
}, 120_000);

const LEDGER_TABLES = ['products', 'sales', 'saleLines', 'payments', 'repayments', 'cashPartialReturns', 'customers', 'inventoryMovements', 'inventoryCostEvents', 'staffMembers', 'appMeta'] as const;
const dump = async (db: TallybookDB) => JSON.stringify(await Promise.all(LEDGER_TABLES.map(async t =>
  [t, (await (db as never as Record<string, { toArray(): Promise<{ id?: string; key?: string }[]> }>)[t].toArray()).sort((x, y) => String(x.id ?? x.key).localeCompare(String(y.id ?? y.key)))])));

it('an interrupted restore of a newer backup rolls back to the previously restored ledger exactly', async () => {
  const { original: backup1, database: source } = await populated();
  // Source ledger moves on: a newer valid backup exists.
  const product = (await source.products.toArray())[0];
  await completeSale({ lines: [{ productId: product.id, quantity: 1 }], discount: '0', paymentMethod: 'cash', amountPaid: '10', currency: 'GHS', submissionKey: 'tamper-newer-sale-01' }, source);
  const backup2 = parseBackup(JSON.stringify(await createBackup(source)));
  expect(backup2.records.sales.length).toBe(backup1.records.sales.length + 1);

  const target = new TallybookDB(`tamper-target-${crypto.randomUUID()}`); openDB.push(target);
  await initializeDatabase(target);
  await restoreBackup(backup1, target);
  const unlockOwner = async () => unlockStaff((await target.staffMembers.where('businessProfileId').equals('primary').first())!.id, '123456', target);
  await unlockOwner();
  const state1 = await dump(target);
  expect((await target.sales.count())).toBe(backup1.records.sales.length);

  // Fault: the write of cashPartialReturns fails part-way through the single restore transaction.
  const proto = Object.getPrototypeOf(target.cashPartialReturns) as { bulkPut: (...a: unknown[]) => Promise<unknown>; name?: string };
  const original = proto.bulkPut; let fired = false;
  const spy = vi.spyOn(proto, 'bulkPut').mockImplementation(function (this: { name: string }, ...args: unknown[]) {
    if (this.name === 'cashPartialReturns') { fired = true; return Promise.reject(new Error('simulated crash mid-restore')); }
    return original.apply(this, args);
  });
  const state1AfterUnlock = await dump(target);
  await expect(restoreBackup(backup2, target)).rejects.toThrow(/simulated crash|restore failed/i);
  spy.mockRestore();
  expect(fired, 'the injected fault must actually fire').toBe(true);
  expect(await target.appMeta.get('restoreRecoveryJournal')).toBeUndefined();
  await unlockOwner();
  expect(await dump(target)).toBe(state1AfterUnlock); // not one row of backup2 leaked in, none of backup1 lost
  // The target is still a valid, restorable ledger: restoring backup2 now succeeds.
  await unlockOwner();
  await restoreBackup(backup2, target);
  expect(await target.sales.count()).toBe(backup2.records.sales.length);
});

it('a tampered backup is rejected before any write to the target', async () => {
  const { original } = await populated();
  const target = new TallybookDB(`tamper-target2-${crypto.randomUUID()}`); openDB.push(target);
  await initializeDatabase(target);
  const before = await dump(target);
  const bad = JSON.parse(JSON.stringify(original)); bad.records.cashPartialReturns[1].debtReducedMinor += 1;
  expect(() => parseBackup(JSON.stringify(bad))).toThrow();
  expect(await dump(target)).toBe(before);
});
