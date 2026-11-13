/**
 * One-way browser retirement for an explicitly configured fresh-start release.
 * Runs before React, Dexie, Supabase, or the PWA registration can mount.
 * Never claim that this deletes offline copies on devices that do not revisit.
 */
const MARKER_PREFIX = 'tallybook.fresh-start.completed:';
const validEpoch = value => /^[a-zA-Z0-9][a-zA-Z0-9._-]{7,79}$/.test(value);

function deleteDatabase(factory, name) {
  return new Promise((resolve, reject) => {
    let request;
    try { request = factory.deleteDatabase(name); }
    catch (error) { reject(error); return; }
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? Error('Unable to retire old database'));
    request.onblocked = () => reject(Error('An older Tallybook tab is holding a database open. Close other tabs and reload.'));
  });
}

/**
 * All adapters are injectable so the same algorithm can be fault-tested by Node.
 * For a fresh start, failing to enumerate any old database MUST block app startup.
 */
export async function retirePriorBrowserData({
  epoch,
  local = globalThis.localStorage,
  session = globalThis.sessionStorage,
  databaseFactory = globalThis.indexedDB,
  cacheStore = globalThis.caches,
  workerContainer = globalThis.navigator?.serviceWorker,
  mandatoryOnlineAuth = false,
} = {}) {
  if (epoch === undefined || epoch === null || epoch === '') return 'not-requested';
  if (!validEpoch(epoch)) throw Error('Invalid Tallybook fresh-start release epoch');
  if (mandatoryOnlineAuth !== true) throw Error('Fresh-start reset requires mandatory online authentication');
  if (!local || !session || !databaseFactory ||
      typeof databaseFactory.databases !== 'function' ||
      typeof databaseFactory.deleteDatabase !== 'function')
    throw Error('This browser cannot safely enumerate all previous Tallybook databases. Clear site data manually and reload.');
  const marker = MARKER_PREFIX + epoch;
  if (local.getItem(marker) === 'complete') return 'already-complete';

  // Discover before changing anything: partial enumeration could leave legacy data behind.
  const discovered = await databaseFactory.databases();
  if (!Array.isArray(discovered) || discovered.some(row => !row || typeof row.name !== 'string' || !row.name))
    throw Error('Unable to enumerate previous Tallybook browser databases');
  const names = [...new Set(discovered.map(row => row.name))];

  // Revoke persisted browser tokens first. The epoch marker is committed last.
  local.clear();
  session.clear();
  for (const name of names) await deleteDatabase(databaseFactory, name);
  if (cacheStore) {
    if (typeof cacheStore.keys !== 'function' || typeof cacheStore.delete !== 'function')
      throw Error('Unable to enumerate previous Tallybook caches');
    for (const name of await cacheStore.keys()) {
      if (!await cacheStore.delete(name)) throw Error('Unable to retire previous Tallybook cache');
    }
  }
  if (workerContainer) {
    if (typeof workerContainer.getRegistrations !== 'function')
      throw Error('Unable to inspect previous Tallybook service workers');
    for (const registration of await workerContainer.getRegistrations()) {
      if (!await registration.unregister())
        throw Error('Unable to unregister an earlier Tallybook service worker');
    }
  }
  local.setItem(marker, 'complete');
  return 'cleared';
}
