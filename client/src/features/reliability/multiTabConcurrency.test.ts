/**
 * ST23-08 / ST24-07: two independent connections to the SAME IndexedDB database (stand-ins for two tabs)
 * write at the same time. Real browser tabs are not modelled here (the Web Locks shim in test/setup.ts is a
 * stand-in); this proves transaction-level atomicity of the services, not multi-process browser behaviour.
 */
import Dexie from 'dexie';
import { afterEach, expect, it, vi } from 'vitest';
import { TallybookDB, initializeDatabase } from '@/db/TallybookDB';
import { setActiveBusinessProfileId } from '@/features/business/activeCompany';
import { saveBusinessProfile } from '@/features/business/businessProfile';
import { createProduct, adjustStock } from '@/features/inventory/inventory';
import { completeSale } from '@/features/sales/sales';
import { createStaff, unlockStaff, openShift, lockStaff } from '@/features/staff/staff';
import { auditLocalIntegrity } from '@/features/reliability/integrity';

const opened: TallybookDB[] = []; const names = new Set<string>();
afterEach(async () => {
  lockStaff('primary'); vi.restoreAllMocks(); setActiveBusinessProfileId('primary');
  for (const d of opened.splice(0)) d.close();
  for (const n of names) await new Dexie(n).delete(); names.clear();
});
async function twoTabs(stock: string) {
  setActiveBusinessProfileId('primary');
  const name = `tabs-${crypto.randomUUID()}`; names.add(name);
  const a = new TallybookDB(name), b = new TallybookDB(name); opened.push(a, b);
  await initializeDatabase(a);
  await saveBusinessProfile({ name: 'Tabs shop', country: 'Ghana', currency: 'GHS', businessType: 'Retail' }, a);
  const owner = await createStaff('Owner', 'owner', '123456', a);
  await unlockStaff(owner.id, '123456', a); await openShift(0, a);
  const product = await createProduct({ name: 'Last units', categoryId: 'uncategorized', sellingPrice: '10', costPrice: '1', initialStock: stock, lowStockThreshold: '0' }, 'GHS', a);
  await initializeDatabase(b);
  return { a, b, product };
}
const sell = (db: TallybookDB, productId: string, key: string, qty = 1) => completeSale({ lines: [{ productId, quantity: qty }], discount: '0',
  paymentMethod: 'cash', amountPaid: String(10 * qty), currency: 'GHS', submissionKey: key }, db);

it('8 simultaneous sales across two connections for 3 units: exactly 3 succeed, stock is 0, nothing oversold', async () => {
  const { a, b, product } = await twoTabs('3');
  const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => sell(i % 2 ? a : b, product.id, `race-sale-key-${i}`)));
  const ok = results.filter(r => r.status === 'fulfilled'); const bad = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[];
  expect(ok.length).toBe(3);
  for (const r of bad) expect(String(r.reason?.message)).toMatch(/stock|available|insufficient|enough/i);
  expect((await a.products.get(product.id))!.stockQuantity).toBe(0);
  expect(await a.sales.count()).toBe(3); expect(await b.payments.count()).toBe(3);
  const moves = (await a.inventoryMovements.toArray()).filter(m => m.productId === product.id && m.quantityDelta < 0);
  expect(moves.reduce((n, m) => n + m.quantityDelta, 0)).toBe(-3);
  expect((await auditLocalIntegrity(a)).issues).toEqual([]);
});

it('the same submission key sent from both connections at once posts exactly once', async () => {
  const { a, b, product } = await twoTabs('10');
  const results = await Promise.allSettled([sell(a, product.id, 'dup-key-across-tabs'), sell(b, product.id, 'dup-key-across-tabs'),
    sell(a, product.id, 'dup-key-across-tabs'), sell(b, product.id, 'dup-key-across-tabs')]);
  const values = results.filter(r => r.status === 'fulfilled').map(r => (r as PromiseFulfilledResult<Awaited<ReturnType<typeof sell>>>).value.sale.id);
  expect(values.length).toBeGreaterThanOrEqual(1);
  expect(new Set(values).size).toBe(1);                       // every acknowledged retry names the same sale
  expect(await a.sales.count()).toBe(1);
  expect((await a.products.get(product.id))!.stockQuantity).toBe(9);   // charged once
});

it('concurrent stock adjustments from two connections never lose an update', async () => {
  const { a, b, product } = await twoTabs('0');
  const jobs = Array.from({ length: 10 }, (_, i) => adjustStock(product.id, { movementType: 'increase', quantity: '1', note: `n${i}` }, i % 2 ? a : b));
  const results = await Promise.allSettled(jobs);
  const applied = results.filter(r => r.status === 'fulfilled').length;
  const stock = (await a.products.get(product.id))!.stockQuantity;
  expect(stock).toBe(applied);                                 // each acknowledged adjustment is reflected exactly once
  const ledger = (await a.inventoryMovements.toArray()).filter(m => m.productId === product.id);
  expect(ledger.reduce((n, m) => n + m.quantityDelta, 0)).toBe(stock);   // movement ledger equals on-hand exactly
  expect((await auditLocalIntegrity(a)).issues).toEqual([]);
});
