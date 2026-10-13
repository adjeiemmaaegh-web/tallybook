/**
 * Origin-wide Web Locks coordination for the two local IndexedDB databases.
 * Exclusive destructive operations and ordinary assistant mutations share a
 * single fixed lock name across tabs, even if companies differ: IDs and the
 * recovery marker are globally indexed, not per-company namespaces.
 *
 * Web Locks are advisory: every cooperating writer must opt in. Main retail
 * writers and raw IndexedDB access are NOT globally serialized by this helper.
 * Unsupported browsers may still use ordinary offline assistant writes, but
 * restore/company clear/recovery fail closed without an exclusive lock.
 */
export const TWO_DATABASE_LOCK_NAME = 'tallybook-v19:retail-assistant-recovery';

export async function withCrossTabDataLock(mode, work, manager = globalThis.navigator?.locks) {
  if ((mode !== 'shared' && mode !== 'exclusive') || typeof work !== 'function')
    throw new Error('Invalid two-database lock operation.');
  if (!manager || typeof manager.request !== 'function') {
    if (mode === 'exclusive')
      throw new Error('Safe backup restore, company clear and recovery require browser Web Locks support. Preserve this device and use a supported browser.');
    // Preserve offline assistant functionality in browsers without Web Locks;
    // such browsers cannot perform potentially destructive multi-DB changes.
    return work();
  }
  // Never wait behind a tab that may be stuck mid-recovery. An operator can
  // explicitly retry after the other tab finishes; no ad-hoc lease can expire
  // while a legitimate IndexedDB commit is still running.
  return manager.request(TWO_DATABASE_LOCK_NAME, { mode, ifAvailable: true }, async lock => {
    if (!lock) throw new Error('Another tab is editing assistant data or recovering Tallybook. Close that operation and retry; no data was changed.');
    return work();
  });
}
