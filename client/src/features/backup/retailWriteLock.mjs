import { withCrossTabDataLock } from './crossTabDataLock.mjs';

/**
 * Hold the same origin-wide shared lock as assistant writes around a retail
 * mutation, always outside the IndexedDB write transaction. Callers must pass
 * whether they are already inside a Dexie transaction: awaiting Web Locks at
 * that point could close the live IndexedDB transaction. An existing outer
 * transaction is responsible for its own shared lock.
 *
 * The no-Web-Locks offline behavior is inherited from withCrossTabDataLock:
 * ordinary writes remain possible, destructive two-database actions fail shut.
 */
export function withRetailWriteLock(work, inExistingTransaction = false, manager) {
  if (typeof work !== 'function' || typeof inExistingTransaction !== 'boolean')
    throw new Error('Invalid retail write coordination request.');
  if (inExistingTransaction) {
    try { return Promise.resolve(work()); }
    catch (error) { return Promise.reject(error); }
  }
  return withCrossTabDataLock('shared', work, manager);
}
