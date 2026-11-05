/** 2026-11-05: a new owner could fill a cart, press Complete sale, and only then learn every sale needs an unlocked
 * staff member with an open shift — and the refusal left the till stuck in "outcome uncertain" recovery. */
import Dexie from 'dexie';
import { webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { TallybookDB, initializeDatabase } from '@/db/TallybookDB';
import { saveBusinessProfile } from '@/features/business/businessProfile';
import { getActiveBusinessProfileId, setActiveBusinessProfileId } from '@/features/business/activeCompany';
import { closeShift, createStaff, lockStaff, openShift, unlockStaff } from '@/features/staff/staff';
import { SaleCompletionTimeoutError, withSaleCompletionTimeout } from './completion';
import { readSellerReadiness } from './useSellerReadiness';

if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
const databases: TallybookDB[] = [];
async function setup() {
  const database = new TallybookDB(`tallybook-seller-ready-${Date.now()}-${databases.length}`); databases.push(database);
  setActiveBusinessProfileId('primary');
  await initializeDatabase(database);
  await saveBusinessProfile({ name: 'Till Shop', country: 'Ghana', currency: 'GHS', businessType: 'Retail shop', phone: '', email: '', address: '' }, database);
  return database;
}
afterEach(async () => { lockStaff('primary'); for (const d of databases.splice(0)) { const name = d.name; d.close(); await new Dexie(name).delete(); } setActiveBusinessProfileId('primary'); });

describe('what the till needs before a sale', () => {
  it('walks a new owner through staff setup, unlock and shift', async () => {
    const database = await setup();
    const company = getActiveBusinessProfileId();
    expect(await readSellerReadiness(company, database)).toBe('no-staff');
    const owner = await createStaff('Owner', 'owner', '482915', database);
    lockStaff(company);
    expect(await readSellerReadiness(company, database)).toBe('locked');
    await unlockStaff(owner.id, '482915', database);
    expect(await readSellerReadiness(company, database)).toBe('no-shift');
    const shift = await openShift(5000, database);
    expect(await readSellerReadiness(company, database)).toBe('ready');
    await closeShift(shift.id, 5000, database);
    expect(await readSellerReadiness(company, database)).toBe('no-shift');
  });
});

describe('only a timeout leaves a checkout outcome unknown', () => {
  it('marks the timeout distinctly so a plain refusal can release the recovery lock', async () => {
    await expect(withSaleCompletionTimeout(new Promise<never>(() => {}), 1)).rejects.toBeInstanceOf(SaleCompletionTimeoutError);
    const refusal = withSaleCompletionTimeout(Promise.reject(new Error('Unlock your assigned staff account before completing a sale.')), 1_000);
    await expect(refusal).rejects.not.toBeInstanceOf(SaleCompletionTimeoutError);
  });
});
