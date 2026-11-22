/**
 * ST25-04: server-style authorization is checked at the SERVICE layer, not the UI.
 * Every role x entry point pair is driven through the real functions against a real
 * IndexedDB. A denied call must (1) reject with a permission/lock error and (2) leave
 * every financial/inventory/staff table byte-identical. An allowed call must NOT fail
 * for permission reasons. The expectation comes from the declared policy table
 * (owner: all; supervisor: all but 'staff'; cashier: 'sell' only; locked: none).
 */
import Dexie from 'dexie';
import { afterEach, expect, it, vi } from 'vitest';
import { TallybookDB, initializeDatabase } from '@/db/TallybookDB';
import { setActiveBusinessProfileId } from '@/features/business/activeCompany';
import { saveBusinessProfile } from '@/features/business/businessProfile';
import { updateCompanyReturnPolicy } from '@/features/business/returnPolicySettings';
import { createProduct, createCategory, adjustStock } from '@/features/inventory/inventory';
import { createSupplier } from '@/features/purchases/purchases';
import { createExpense, listExpenses } from '@/features/expenses/expenses';
import { addMobileMoneyProvider } from '@/features/payments/mobileMoney';
import { createBackup } from '@/features/backup/backup';
import { completeSale } from '@/features/sales/sales';
import { recordConfirmedCashPartialReturn } from '@/features/sales/cashPartialReturnPosting';
import { executeLatestSaleReversal } from '@/features/assistant/reversals';
import { getFinancialSummary } from '@/features/reports/financialIntelligence';
import { getReportsSnapshot } from '@/features/reports/reports';
import { createStaff, changeStaffRole, setStaffPermissions, unlockStaff, lockStaff, openShift, rolePermissions, type StaffPermission } from './staff';
import { assertStaffAuthority, staffCredentialBinding, STAFF_ACTIONS } from './staffAuthority.mjs';

const openDB: TallybookDB[] = [];
afterEach(async () => {
  lockStaff('primary'); vi.useRealTimers(); vi.restoreAllMocks(); setActiveBusinessProfileId('primary');
  for (const database of openDB.splice(0)) { database.close(); await new Dexie(database.name).delete(); }
});
const policy: Record<string, readonly StaffPermission[]> = {
  owner: ['sell', 'refund', 'discount', 'inventory', 'reports', 'staff'],
  supervisor: ['sell', 'refund', 'discount', 'inventory', 'reports'],
  cashier: ['sell'], locked: [],
};
const MUTATED = ['products', 'categories', 'suppliers', 'expenses', 'sales', 'payments', 'cashPartialReturns', 'saleReversals', 'inventoryMovements',
  'mobileMoneyProviders', 'staffMembers', 'staffAudits'] as const;
const snapshot = async (db: TallybookDB) => JSON.stringify(await Promise.all(MUTATED.map(async t => [t, await (db as never as Record<string, { toArray(): Promise<unknown[]> }>)[t].toArray()])));

async function world() {
  setActiveBusinessProfileId('primary');
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-01-02T10:00:00Z'));
  const database = new TallybookDB(`perm-${crypto.randomUUID()}`); openDB.push(database);
  await initializeDatabase(database);
  await saveBusinessProfile({ name: 'Permission shop', country: 'Ghana', currency: 'GHS', businessType: 'Retail' }, database);
  const owner = await createStaff('Owner', 'owner', '123456', database);
  await unlockStaff(owner.id, '123456', database); await openShift(0, database);
  await updateCompanyReturnPolicy({ enabled: true, allowFullReversal: true, allowCashPartial: true, maxAgeDays: 30 }, 'fixture', database);
  const cashier = await createStaff('Cashier', 'cashier', '234567', database);
  const supervisor = await createStaff('Supervisor', 'supervisor', '345678', database);
  const product = await createProduct({ name: 'Rice', categoryId: 'uncategorized', sellingPrice: '10', costPrice: '1', initialStock: '50', lowStockThreshold: '0' }, 'GHS', database);
  const sale = await completeSale({ lines: [{ productId: product.id, quantity: 2 }], discount: '0', paymentMethod: 'cash', amountPaid: '20', currency: 'GHS', submissionKey: 'perm-sale-0001' }, database);
  lockStaff('primary'); vi.setSystemTime(new Date('2026-01-03T10:00:00Z'));
  return { database, owner, cashier, supervisor, product, sale };
}
const actAs = async (w: Awaited<ReturnType<typeof world>>, role: string) => {
  lockStaff('primary');
  if (role === 'locked') return;
  const who = { owner: [w.owner, '123456'], cashier: [w.cashier, '234567'], supervisor: [w.supervisor, '345678'] }[role] as [{ id: string }, string];
  await unlockStaff(who[0].id, who[1], w.database);
};
type Entry = { name: string; needs: StaffPermission; call: (w: Awaited<ReturnType<typeof world>>) => Promise<unknown> };
let n = 0; const key = () => `perm-key-${String(++n).padStart(6, '0')}`;
const entries: Entry[] = [
  { name: 'createProduct', needs: 'inventory', call: w => createProduct({ name: `P${key()}`, categoryId: 'uncategorized', sellingPrice: '5', costPrice: '1', initialStock: '1', lowStockThreshold: '0' }, 'GHS', w.database) },
  { name: 'createCategory', needs: 'inventory', call: w => createCategory({ name: `Cat ${key()}` }, w.database) },
  { name: 'adjustStock', needs: 'inventory', call: w => adjustStock(w.product.id, { movementType: 'increase', quantity: '1', note: 'matrix' }, w.database) },
  { name: 'createSupplier', needs: 'inventory', call: w => createSupplier({ name: `Sup ${key()}`, phone: '', email: '', address: '', notes: '' }, w.database) },
  { name: 'createExpense', needs: 'inventory', call: w => createExpense({ category: 'other' as never, amount: '1.00', expenseDate: '2026-01-03', note: 'matrix', currency: 'GHS', submissionKey: key() }, w.database) },
  { name: 'listExpenses', needs: 'reports', call: w => listExpenses(w.database) },
  { name: 'getFinancialSummary', needs: 'reports', call: w => getFinancialSummary('month', new Date(), undefined, undefined, w.database) },
  { name: 'getReportsSnapshot', needs: 'reports', call: w => getReportsSnapshot('all', new Date(), w.database) },
  { name: 'partialReturn', needs: 'refund', call: async w => { const lines = await w.database.saleLines.toArray();
      return recordConfirmedCashPartialReturn({ originalSaleId: w.sale.sale.id, submissionKey: key(), lines: [{ saleLineId: lines[0].id, quantity: 1 }],
        cashWasRefunded: true, confirmedRefundMinor: 1000, disposition: 'restockable' }, w.database); } },
  { name: 'fullReversal', needs: 'refund', call: w => executeLatestSaleReversal('GHS', w.database, key()) },
  { name: 'createBackup', needs: 'staff', call: w => createBackup(w.database) },
  { name: 'addMobileMoneyProvider', needs: 'staff', call: w => addMobileMoneyProvider({ name: `MoMo ${key()}` } as never, w.database) },
  { name: 'updateReturnPolicy', needs: 'staff', call: w => updateCompanyReturnPolicy({ enabled: true, allowFullReversal: false, allowCashPartial: true, maxAgeDays: 7 }, 'matrix', w.database) },
  { name: 'createStaff', needs: 'staff', call: w => createStaff(`Hire ${key()}`, 'cashier', '456789', w.database) },
  { name: 'changeStaffRole', needs: 'staff', call: w => changeStaffRole(w.cashier.id, 'supervisor', w.database) },
];
const isPermissionError = (e: unknown) => /permission denied|Staff access locked|Unlock the existing owner/i.test((e as Error)?.message ?? '');

for (const role of ['locked', 'cashier', 'supervisor', 'owner']) {
  it(`${role}: every entry point enforces the declared policy and denied calls change nothing`, async () => {
    const results: string[] = [];
    for (const entry of entries) {
      const w = await world();
      await actAs(w, role);
      const before = await snapshot(w.database);
      const allowed = policy[role].includes(entry.needs);
      let error: unknown;
      try { await entry.call(w); } catch (e) { error = e; }
      if (allowed) {
        if (error && isPermissionError(error)) throw new Error(`${role} was wrongly denied ${entry.name}: ${(error as Error).message}`);
      } else {
        if (!error || !isPermissionError(error)) throw new Error(`${role} was NOT denied ${entry.name} (needs ${entry.needs}); got: ${error ? (error as Error).message : 'success'}`);
        expect(await snapshot(w.database), `${role}/${entry.name} mutated state while denied`).toBe(before);
      }
      results.push(`${entry.name}:${allowed ? 'allowed' : 'denied'}`);
      lockStaff('primary'); w.database.close(); await new Dexie(w.database.name).delete();
    }
    expect(results).toHaveLength(entries.length);
  }, 120_000);
}

it('the two role tables (UI policy and service authority) cannot drift apart', () => {
  for (const role of ['owner', 'supervisor', 'cashier'] as const) {
    const member = { id: 'm1', businessProfileId: 'primary', role, pinHash: 'a'.repeat(64), salt: 's'.repeat(32) };
    const binding = staffCredentialBinding(member);
    const enforced = STAFF_ACTIONS.filter(action => {
      try { assertStaffAuthority({ member, companyId: 'primary', action: action as never, sessionId: 'm1', credentialBinding: binding }); return true; }
      catch { return false; }
    });
    expect(enforced.sort(), `role ${role}: service layer enforces a different set than the UI policy`).toEqual([...rolePermissions(role)].sort());
  }
});

it('an owner can narrow one supervisor below the role default and the service layer honours it', async () => {
  const w = await world();
  await unlockStaff(w.owner.id, '123456', w.database);
  await setStaffPermissions(w.supervisor.id, ['sell', 'reports'], w.database);
  lockStaff('primary'); await unlockStaff(w.supervisor.id, '345678', w.database);
  await expect(createProduct({ name: 'Blocked', categoryId: 'uncategorized', sellingPrice: '5', costPrice: '1', initialStock: '1', lowStockThreshold: '0' }, 'GHS', w.database)).rejects.toThrow(/permission denied|locked/i);
  const lines = await w.database.saleLines.toArray();
  await expect(recordConfirmedCashPartialReturn({ originalSaleId: w.sale.sale.id, submissionKey: 'narrow-ret-key-01', lines: [{ saleLineId: lines[0].id, quantity: 1 }],
    cashWasRefunded: true, confirmedRefundMinor: 1000, disposition: 'restockable' }, w.database)).rejects.toThrow(/permission denied|locked/i);
  expect(await w.database.cashPartialReturns.count()).toBe(0);
});

it('a disabled or demoted employee loses authority immediately without re-login', async () => {
  const w = await world();
  await unlockStaff(w.owner.id, '123456', w.database);
  const supervisorId = w.supervisor.id;
  lockStaff('primary'); await unlockStaff(supervisorId, '345678', w.database);
  await createCategory({ name: 'Allowed before demotion' }, w.database);
  // Owner demotes the supervisor in the database while the supervisor's session is still open.
  await w.database.staffMembers.update(supervisorId, { role: 'cashier' });
  await expect(createCategory({ name: 'Denied after demotion' }, w.database)).rejects.toThrow(/permission denied|locked/i);
});
