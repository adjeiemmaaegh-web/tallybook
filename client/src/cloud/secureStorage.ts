/**
 * Browser wiring for confidential offline data (PRD R1).
 *
 * Threat model in one paragraph: this protects shop records at rest in the
 * browser profile (copied storage, backups of the profile, a stranger reading
 * localStorage). It does NOT protect against someone using an already unlocked
 * device or against malicious code running in this origin. The AES-256-GCM key
 * is generated on the device as a NON-EXTRACTABLE CryptoKey and kept in
 * IndexedDB, so raw key bytes never exist in JavaScript or in any export. If
 * the browser profile or key is lost, sealed records cannot be read. Queued
 * sales are then shown as "needs review" and are never silently deleted.
 */
import { bestAvailableLocks, createSealer, type OutboxBackend, type SealedRecord, type Sealer, type StoredRecord } from "./outboxCore";

const DB_NAME = "tallybook-secure";
const DB_VERSION = 1;
const KEYS = "keys";
const OUTBOX = "outbox";
const CACHE = "cache";
const DEVICE_KEY_ID = "device-aes-gcm-v1";

export class SecureStorageUnavailableError extends Error {
  constructor() { super("This browser can't save sales securely while offline. Keep this page open until the sale is confirmed."); }
}

export function secureStorageAvailable(): boolean {
  const g = globalThis as { indexedDB?: unknown; crypto?: { subtle?: unknown } };
  return !!g.indexedDB && !!g.crypto?.subtle;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}
function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;
function openDb(): Promise<IDBDatabase> {
  if (!secureStorageAvailable()) return Promise.reject(new SecureStorageUnavailableError());
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      for (const name of [KEYS, OUTBOX, CACHE]) if (!open.result.objectStoreNames.contains(name)) open.result.createObjectStore(name);
    };
    open.onsuccess = () => {
      open.result.onversionchange = () => { open.result.close(); dbPromise = null; };
      resolve(open.result);
    };
    open.onerror = () => { dbPromise = null; reject(open.error ?? new SecureStorageUnavailableError()); };
  });
  return dbPromise;
}

/** One device key per browser profile, created once even if several tabs start together. */
let sealerPromise: Promise<Sealer> | null = null;
export function deviceSealer(): Promise<Sealer> {
  sealerPromise ??= bestAvailableLocks()("tallybook-device-key", async () => {
    const db = await openDb();
    const existing = await request(db.transaction(KEYS, "readonly").objectStore(KEYS).get(DEVICE_KEY_ID)) as CryptoKey | undefined;
    if (existing) return createSealer(existing);
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    const tx = db.transaction(KEYS, "readwrite");
    tx.objectStore(KEYS).put(key, DEVICE_KEY_ID);
    await done(tx);
    return createSealer(key);
  }).catch(error => { sealerPromise = null; throw error; });
  return sealerPromise;
}

const rowKey = (scopeKey: string, id: string) => `${scopeKey}\u0000${id}`;

export function indexedDbBackend(): OutboxBackend {
  const store = async (mode: IDBTransactionMode) => {
    const tx = (await openDb()).transaction(OUTBOX, mode);
    return { tx, os: tx.objectStore(OUTBOX) };
  };
  return {
    async list(scopeKey) {
      const { tx, os } = await store("readonly");
      const prefix = `${scopeKey}\u0000`;
      const range = IDBKeyRange.bound(prefix, `${prefix}￿`);
      const [keys, values] = await Promise.all([request(os.getAllKeys(range)), request(os.getAll(range))]);
      await done(tx);
      return (keys as string[]).map((k, i): StoredRecord => ({ id: k.slice(prefix.length), record: (values as SealedRecord[])[i]! }));
    },
    async get(scopeKey, id) {
      const { tx, os } = await store("readonly");
      const value = await request(os.get(rowKey(scopeKey, id)));
      await done(tx);
      return (value as SealedRecord | undefined) ?? null;
    },
    async put(scopeKey, id, record) {
      const { tx, os } = await store("readwrite");
      os.put(record, rowKey(scopeKey, id));
      await done(tx); // resolves only after the browser has committed the write
    },
    async delete(scopeKey, id) {
      const { tx, os } = await store("readwrite");
      os.delete(rowKey(scopeKey, id));
      await done(tx);
    },
  };
}

/** Sealed JSON values for non-critical caches (business list, shop overview). */
const cacheAad = (name: string) => `tallybook.cache.v1|${name}`;

export async function readSealedJson<T>(name: string): Promise<T | null> {
  try {
    const sealer = await deviceSealer();
    const tx = (await openDb()).transaction(CACHE, "readonly");
    const record = await request(tx.objectStore(CACHE).get(name)) as SealedRecord | undefined;
    if (!record) return null;
    return JSON.parse(await sealer.open(record, cacheAad(name))) as T;
  } catch { return null; } // a cache that can't be read is just a cache miss
}

export async function writeSealedJson(name: string, value: unknown): Promise<void> {
  try {
    const sealer = await deviceSealer();
    const record = await sealer.seal(JSON.stringify(value), cacheAad(name));
    const tx = (await openDb()).transaction(CACHE, "readwrite");
    tx.objectStore(CACHE).put(record, name);
    await done(tx);
  } catch { /* not essential */ }
}

/** Remove cached values whose name starts with the prefix (sign-out, account switch). */
export async function removeSealedPrefix(prefix: string): Promise<void> {
  try {
    const tx = (await openDb()).transaction(CACHE, "readwrite");
    const os = tx.objectStore(CACHE);
    os.delete(IDBKeyRange.bound(prefix, `${prefix}￿`));
    await done(tx);
  } catch { /* nothing to remove */ }
}
