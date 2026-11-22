/**
 * ST24-05 active-ledger encryption: key custody, enablement, unlock, recovery and rollback.
 *
 * State machine, persisted in a SEPARATE IndexedDB (never inside the ledger it protects, so clearing or
 * restoring a company can never destroy the keys):
 *   (no record)  --enable-->  migrating  --verified-->  encrypted  --disable-->  decrypting  --verified-->  (no record)
 * The wrapped keyring is written to disk BEFORE the first row is converted, and the pre-conversion fingerprint is
 * stored with it, so a crash at any moment leaves a ledger that can be resumed or rolled back with the same
 * credentials. Conversion rewrites rows in small transactions; every row is readable (plaintext or sealed) at every
 * instant. Nothing is deleted. Original plaintext is replaced only after the keyring is durable.
 *
 * Recovery: passphrase, or the one-time recovery code, or an exported recovery package (wrapped keys only) plus a
 * credential. There is no backdoor: with neither credential and no external backup, a sealed ledger is
 * irrecoverable. The external verified encrypted backup is the second, independent recovery path.
 */
import { DATABASE_SCHEMA_VERSION, type TallybookDB } from "@/db/TallybookDB";
import type { IndexableType } from "dexie";
import { withCrossTabDataLock } from "@/features/backup/crossTabDataLock.mjs";
import { getVerifiedBackupReceipt } from "@/features/backup/backup";
import { sha256 } from "@noble/hashes/sha2.js";
import { canonicalSt24CloneJson } from "./st24CloneCodec.mjs";
import {
  changeLedgerPassphrase, createLedgerKeyringWithDek, replaceLedgerRecoveryCode, resetLedgerPassphraseWithRecovery,
  unlockLedgerDek, validateLedgerKeyring, type LedgerKeyringV1,
} from "./st24LedgerKeyring.mjs";
import { deriveSt24Subkeys, openSt24Row, sealSt24Row, zeroSt24Key, type SealedSt24Row } from "./st24RowCipher.mjs";
import { BLINDED_INDEX_FIELDS, SEAL_EXEMPT_TABLES, SEAL_FIELD, setSealFence, type SealMode } from "./st24LedgerSeal";

/** rekeying = the data key is being replaced (rows are moving from the old key to the new one); resumable. */
export type LedgerSecurityState = "plaintext" | "migrating" | "encrypted" | "decrypting" | "rekeying";
export const KEYRING_DB_NAME = "tallybook-keyring-v1";
const STORE = "keyrings";
const BATCH = 200;
const LEDGER_SCOPE = "all-companies";

interface TableFingerprint { count: number; sha256: string }
interface LedgerRecord {
  dbName: string; version: number; state: Exclude<LedgerSecurityState, "plaintext">;
  keyring: LedgerKeyringV1; precheck?: Record<string, TableFingerprint>; startedAt?: string; updatedAt: string;
  /** Only while rekeying: the incoming keyring (wrapped by the same passphrase + a NEW recovery code) and the incoming data key sealed under the OUTGOING key, so anyone holding the old credentials can resume. */
  rekey?: { nextKeyring: LedgerKeyringV1; nextDek: SealedSt24Row };
  /** Ledger schema the sealed rows were projected for. A different app schema must not open them (see prepare). */
  schemaVersion: number;
}
export interface LedgerStatus { state: LedgerSecurityState | "orphaned" | "schema-mismatch"; locked: boolean; message?: string }
const fail = (m: string): never => { throw new Error(m); };

// ---------- durable keyring record (compare-and-swap) ----------
function openKeyringDb(idb: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = idb.open(KEYRING_DB_NAME, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: "dbName" }); };
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
}
async function readRecord(dbName: string, idb: IDBFactory = indexedDB): Promise<LedgerRecord | null> {
  const k = await openKeyringDb(idb);
  try {
    return await new Promise<LedgerRecord | null>((resolve, reject) => {
      const r = k.transaction(STORE, "readonly").objectStore(STORE).get(dbName);
      r.onsuccess = () => resolve((r.result as LedgerRecord | undefined) ?? null); r.onerror = () => reject(r.error);
    });
  } finally { k.close(); }
}
/** expectedVersion null = must not exist; otherwise the stored version must match. Throws on a lost race. */
async function writeRecord(next: Omit<LedgerRecord, "version" | "updatedAt" | "schemaVersion"> & { schemaVersion?: number }, expectedVersion: number | null, idb: IDBFactory = indexedDB): Promise<LedgerRecord> {
  const k = await openKeyringDb(idb);
  try {
    return await new Promise<LedgerRecord>((resolve, reject) => {
      const tx = k.transaction(STORE, "readwrite"); const store = tx.objectStore(STORE);
      const get = store.get(next.dbName);
      get.onsuccess = () => {
        const cur = get.result as LedgerRecord | undefined;
        if ((cur?.version ?? null) !== expectedVersion) { reject(new Error("The encryption settings changed elsewhere. Reload and try again.")); tx.abort(); return; }
        const rec: LedgerRecord = { ...next, schemaVersion: next.schemaVersion ?? cur?.schemaVersion ?? DATABASE_SCHEMA_VERSION, version: (cur?.version ?? 0) + 1, updatedAt: new Date().toISOString() };
        store.put(rec); tx.oncomplete = () => resolve(rec);
      };
      tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error ?? new Error("The encryption settings could not be saved."));
    });
  } finally { k.close(); }
}
async function deleteRecord(dbName: string, expectedVersion: number, idb: IDBFactory = indexedDB) {
  const k = await openKeyringDb(idb);
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = k.transaction(STORE, "readwrite"); const store = tx.objectStore(STORE); const get = store.get(dbName);
      get.onsuccess = () => {
        if ((get.result as LedgerRecord | undefined)?.version !== expectedVersion) { reject(new Error("The encryption settings changed elsewhere. Reload and try again.")); tx.abort(); return; }
        store.delete(dbName); tx.oncomplete = () => resolve();
      };
      tx.onabort = () => reject(tx.error ?? new Error("Could not remove the encryption record."));
    });
  } finally { k.close(); }
}

// ---------- ledger helpers ----------
const sealedTables = (db: TallybookDB) => db.tables.filter(t => !SEAL_EXEMPT_TABLES.has(t.name)).map(t => t.name).sort();
const modeFor = (s: Exclude<LedgerSecurityState, "plaintext">): SealMode => (s === "migrating" ? "migrating" : s === "decrypting" ? "decrypting" : "encrypted");

function rawStore<T>(db: TallybookDB, table: string, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const r = fn(db.backendDB().transaction(table, "readonly").objectStore(table));
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
}
/** Per-table count + streaming SHA-256 over canonical (key, record) pairs, as the APPLICATION sees them. */
export async function fingerprintLedger(db: TallybookDB): Promise<Record<string, TableFingerprint>> {
  const out: Record<string, TableFingerprint> = {};
  for (const name of sealedTables(db)) {
    const table = db.table(name); const h = sha256.create(); let count = 0;
    const keys = (await table.toCollection().primaryKeys()) as IndexableType[];
    for (let i = 0; i < keys.length; i += BATCH) {
      const slice = keys.slice(i, i + BATCH); const rows = await table.bulkGet(slice);
      for (let j = 0; j < slice.length; j++) {
        if (rows[j] === undefined) fail(`A ${name} row disappeared while it was being verified.`);
        h.update(new TextEncoder().encode(canonicalSt24CloneJson([slice[j], rows[j]]) + "\n")); count++;
      }
    }
    out[name] = { count, sha256: [...h.digest()].map(b => b.toString(16).padStart(2, "0")).join("") };
  }
  return out;
}
export function diffFingerprints(a: Record<string, TableFingerprint>, b: Record<string, TableFingerprint>): string[] {
  const bad: string[] = [];
  for (const t of new Set([...Object.keys(a), ...Object.keys(b)])) if (a[t]?.count !== b[t]?.count || a[t]?.sha256 !== b[t]?.sha256) bad.push(t);
  return bad;
}
/** Raw scan of the stored bytes: how many rows are sealed, how many are still plaintext. */
export async function scanRawLedger(db: TallybookDB): Promise<{ sealed: number; plaintext: number; unblinded: number }> {
  let sealed = 0, plaintext = 0, unblinded = 0;
  for (const name of sealedTables(db)) {
    const rows = await rawStore<Record<string, unknown>[]>(db, name, s => s.getAll() as IDBRequest<Record<string, unknown>[]>);
    for (const row of rows) {
      if (!(SEAL_FIELD in row)) { plaintext++; continue; }
      sealed++;
      for (const f of BLINDED_INDEX_FIELDS[name] ?? []) { const v = row[f]; if (v !== undefined && v !== null && !(typeof v === "string" && v.startsWith("b1:"))) unblinded++; }
    }
  }
  return { sealed, plaintext, unblinded };
}
async function convertAll(db: TallybookDB, onProgress?: (done: number, total: number) => void) {
  let total = 0, done = 0;
  const plan = [] as { name: string; keys: IndexableType[] }[];
  for (const name of sealedTables(db)) { const keys = await db.table(name).toCollection().primaryKeys(); plan.push({ name, keys }); total += keys.length; }
  for (const { name, keys } of plan) {
    const table = db.table(name);
    for (let i = 0; i < keys.length; i += BATCH) {
      const slice = keys.slice(i, i + BATCH);
      // One short transaction per batch: read (opens sealed rows) then write back (seals or stores plaintext, per mode).
      await db.transaction("rw", table, async () => {
        const rows = await table.bulkGet(slice as IndexableType[]);
        const present = rows.filter(r => r !== undefined);
        if (present.length) await table.bulkPut(present);
      });
      done += slice.length; onProgress?.(done, total);
    }
  }
}
async function anyRawSealedRow(db: TallybookDB): Promise<boolean> {
  for (const name of sealedTables(db)) {
    const first = await rawStore<IDBCursorWithValue | null>(db, name, s => s.openCursor() as IDBRequest<IDBCursorWithValue | null>);
    if (first && SEAL_FIELD in (first.value as object)) return true;
  }
  return false;
}
async function deriveFrom(dek: Uint8Array) { try { return await deriveSt24Subkeys(dek); } finally { zeroSt24Key(dek); } }

// ---------- public API ----------
/** Call once per connection BEFORE any ledger read/write. Sets the layer's mode from the durable record. */
export async function prepareLedgerSecurity(db: TallybookDB, idb: IDBFactory = indexedDB): Promise<LedgerStatus> {
  const rec = await readRecord(db.name, idb);
  if (!rec) {
    await db.open();
    if (await anyRawSealedRow(db)) {
      db.ledgerSeal.setMode("encrypted"); setSealFence(db.name, true);
      return { state: "orphaned", locked: true, message: "This ledger is encrypted but its key record is missing. Import your recovery package to unlock it." };
    }
    setSealFence(db.name, false); // a stale fence from a wiped keyring must not block a genuinely plaintext ledger
    db.ledgerSeal.setMode("plaintext");
    return { state: "plaintext", locked: false };
  }
  db.ledgerSeal.setMode(modeFor(rec.state));
  setSealFence(db.name, rec.state !== "decrypting");
  // Sealed rows carry index copies projected for ONE schema. Opening them with a newer schema would let Dexie build
  // new indexes over rows that have no such copies, so the connection must not be opened until a reviewed
  // encrypted-ledger upgrade exists. The caller must not call db.open() for this status.
  if (rec.schemaVersion !== DATABASE_SCHEMA_VERSION)
    return { state: "schema-mismatch", locked: true, message: `This encrypted ledger was created for schema ${rec.schemaVersion}; this version of Tallybook uses ${DATABASE_SCHEMA_VERSION}. Keep using the previous version or restore from your verified backup; an encrypted-ledger upgrade is required first.` };
  return { state: rec.state, locked: !db.ledgerSeal.unlocked };
}

export interface PreparedEncryption { readonly recoveryCode: string; readonly keyring: LedgerKeyringV1 }
const preparedDeks = new WeakMap<PreparedEncryption, Uint8Array>();
/** Step 1: make a key and recovery code in memory only. Nothing is written until beginLedgerEncryption. */
export async function prepareLedgerEncryption(db: TallybookDB, passphrase: string): Promise<PreparedEncryption> {
  const { keyring, recoveryCode, dek } = await createLedgerKeyringWithDek({ workspaceId: db.name, companyId: LEDGER_SCOPE, ownerPassphrase: passphrase });
  const prepared: PreparedEncryption = Object.freeze({ recoveryCode, keyring });
  preparedDeks.set(prepared, dek);
  return prepared;
}
export function discardPreparedEncryption(prepared: PreparedEncryption) { const d = preparedDeks.get(prepared); if (d) d.fill(0); preparedDeks.delete(prepared); }

export interface EnableOptions { typedRecoveryCode: string; otherCompaniesBackedUp?: boolean; onProgress?: (done: number, total: number) => void; idb?: IDBFactory }
/** Step 2: owner has recorded the recovery code (typed back) and a verified external backup exists. */
export async function beginLedgerEncryption(db: TallybookDB, prepared: PreparedEncryption, opts: EnableOptions): Promise<void> {
  const idb = opts.idb ?? indexedDB; const dek = preparedDeks.get(prepared);
  if (!dek) throw new Error("This setup was already used or cancelled. Start again.");
  if (opts.typedRecoveryCode.trim() !== prepared.recoveryCode) fail("The recovery code you typed does not match. Copy it exactly and keep it somewhere safe.");
  await db.open();
  if ((await prepareLedgerSecurity(db, idb)).state !== "plaintext") fail("This ledger is already encrypted or mid-change.");
  const receipt = await getVerifiedBackupReceipt(db);
  if (!receipt) fail("Export and verify an encrypted backup first. Encryption will not start without one.");
  const companies = await db.businessProfiles.count();
  if (companies > 1 && !opts.otherCompaniesBackedUp)
    fail(`This device holds ${companies} businesses and one verified backup covers only one. Back up each, then confirm.`);
  const keys = await deriveFrom(new Uint8Array(dek)); preparedDeks.delete(prepared); dek.fill(0);
  await withCrossTabDataLock("exclusive", async () => {
    const before = await fingerprintLedger(db);
    // 1. Durable first: the wrapped keyring + pre-conversion fingerprint exist before any row changes.
    const rec = await writeRecord({ dbName: db.name, state: "migrating", keyring: prepared.keyring, precheck: before, startedAt: new Date().toISOString() }, null, idb);
    setSealFence(db.name, true); // stale tabs in plaintext mode may no longer write
    db.ledgerSeal.unlock(keys); db.ledgerSeal.setMode("migrating");
    await finishConversion(db, rec, before, idb, opts.onProgress);
  });
}
async function finishConversion(db: TallybookDB, rec: LedgerRecord, before: Record<string, TableFingerprint>, idb: IDBFactory, onProgress?: (d: number, t: number) => void) {
  await convertAll(db, onProgress);
  const bad = diffFingerprints(before, await fingerprintLedger(db));
  if (bad.length) fail(`Verification failed for ${bad.join(", ")}. Nothing was deleted; the ledger stays readable. Resume or roll back.`);
  const scan = await scanRawLedger(db);
  if (scan.plaintext > 0 || scan.unblinded > 0) fail(`${scan.plaintext} plaintext rows remain after conversion. Resume to finish.`);
  await writeRecord({ dbName: db.name, state: "encrypted", keyring: rec.keyring }, rec.version, idb);
  db.ledgerSeal.setMode("encrypted");
}

export type Credential = { passphrase: string } | { recoveryCode: string };
/** Unlock with the passphrase or recovery code. Wrong credentials change nothing. */
export async function unlockLedger(db: TallybookDB, credential: Credential, idb: IDBFactory = indexedDB): Promise<void> {
  const rec = await readRecord(db.name, idb) ?? fail("This ledger is not encrypted on this device.");
  if (rec.state === "rekeying") fail("An encryption key change was interrupted. Finish it first (enter your passphrase or recovery code to continue).");
  const dek = await ("passphrase" in credential ? unlockLedgerDek(rec.keyring, credential.passphrase, "passphrase") : unlockLedgerDek(rec.keyring, credential.recoveryCode, "recovery"));
  const keys = await deriveFrom(dek);
  db.ledgerSeal.unlock(keys); db.ledgerSeal.setMode(modeFor(rec.state)); setSealFence(db.name, rec.state !== "decrypting");
  // Prove this key really opens THIS ledger (guards against a mismatched/restored keyring).
  await db.open();
  for (const name of sealedTables(db)) {
    const first = await rawStore<IDBCursorWithValue | null>(db, name, s => s.openCursor() as IDBRequest<IDBCursorWithValue | null>);
    if (first && SEAL_FIELD in (first.value as object)) {
      try { openSt24Row({ rowKey: keys.rowKey, scope: db.name, table: name, primaryKey: first.primaryKey, sealed: (first.value as Record<string, unknown>)[SEAL_FIELD] }); }
      catch { db.ledgerSeal.lock(); fail("This key does not match the encrypted data on this device."); }
      break;
    }
  }
}
export function lockLedger(db: TallybookDB) { db.ledgerSeal.lock(); }

/** After a crash mid-conversion: unlock, then finish. Uses the fingerprint stored before conversion began. */
export async function resumeLedgerEncryption(db: TallybookDB, credential: Credential, opts: { onProgress?: (d: number, t: number) => void; idb?: IDBFactory } = {}) {
  const idb = opts.idb ?? indexedDB;
  await unlockLedger(db, credential, idb);
  const rec = await readRecord(db.name, idb);
  if (!rec || rec.state !== "migrating" || !rec.precheck) fail("There is no interrupted encryption to resume.");
  await withCrossTabDataLock("exclusive", () => finishConversion(db, rec!, rec!.precheck!, idb, opts.onProgress));
}

/** Return to a plaintext ledger. Requires the ledger to be unlocked. Verifies before removing the key record. */
export async function disableLedgerEncryption(db: TallybookDB, opts: { onProgress?: (d: number, t: number) => void; idb?: IDBFactory } = {}) {
  const idb = opts.idb ?? indexedDB;
  if (!db.ledgerSeal.unlocked) fail("Unlock the ledger first.");
  let rec = await readRecord(db.name, idb) ?? fail("This ledger is not encrypted on this device.");
  if (rec.state === "rekeying") fail("Finish the interrupted key change before turning encryption off.");
  await withCrossTabDataLock("exclusive", async () => {
    const current = await fingerprintLedger(db);
    // Baseline = what the ledger looked like BEFORE any encryption began, when we still have it (interrupted
    // migration or interrupted rollback); otherwise today's content.
    const baseline = (rec.state === "encrypted" ? current : rec.precheck) ?? current;
    if (rec.state !== "decrypting") rec = await writeRecord({ dbName: db.name, state: "decrypting", keyring: rec.keyring, precheck: baseline, startedAt: new Date().toISOString() }, rec.version, idb);
    db.ledgerSeal.setMode("decrypting");
    await convertAll(db, opts.onProgress);
    const bad = diffFingerprints(baseline, await fingerprintLedger(db));
    if (bad.length) fail(`Verification failed for ${bad.join(", ")}. The ledger stays readable; try again.`);
    const scan = await scanRawLedger(db);
    if (scan.sealed > 0) fail(`${scan.sealed} rows are still encrypted. Try again.`);
    await deleteRecord(db.name, rec.version, idb);
    setSealFence(db.name, false); db.ledgerSeal.setMode("plaintext"); db.ledgerSeal.lock();
  });
}

// ---------- data-key rotation (every row IS re-encrypted under a brand-new key) ----------
const REKEY_TABLE = "rekeyMarker", REKEY_PK = "next-data-key";
const toB64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const fromB64 = (t: string) => Uint8Array.from(atob(t), c => c.charCodeAt(0));
export interface PreparedRotation { readonly recoveryCode: string; readonly keyring: LedgerKeyringV1 }
const preparedRotations = new WeakMap<PreparedRotation, Uint8Array>();
/** Step 1: check the passphrase and make a NEW data key + NEW recovery code in memory. Nothing is written yet. */
export async function prepareDataKeyRotation(db: TallybookDB, passphrase: string, idb: IDBFactory = indexedDB): Promise<PreparedRotation> {
  const rec = await readRecord(db.name, idb) ?? fail("This ledger is not encrypted on this device.");
  if (rec.state !== "encrypted") fail("Finish or roll back the encryption in progress first.");
  if (!db.ledgerSeal.unlocked) fail("Unlock the ledger first.");
  zeroSt24Key(await unlockLedgerDek(rec.keyring, passphrase, "passphrase")); // wrong passphrase throws here, before anything changes
  const { keyring, recoveryCode, dek } = await createLedgerKeyringWithDek({ workspaceId: db.name, companyId: LEDGER_SCOPE, ownerPassphrase: passphrase });
  const prepared: PreparedRotation = Object.freeze({ recoveryCode, keyring });
  preparedRotations.set(prepared, dek);
  return prepared;
}
export function discardPreparedRotation(prepared: PreparedRotation) { const d = preparedRotations.get(prepared); if (d) d.fill(0); preparedRotations.delete(prepared); }

export interface RotateOptions { passphrase: string; typedRecoveryCode: string; onProgress?: (done: number, total: number) => void; idb?: IDBFactory }
/**
 * Step 2: re-seal every row under the new data key. Crash-safe: both keyrings are durable BEFORE the first row changes (the new data key
 * is stored sealed under the old one), rows are readable under either key at every instant, the app-visible content is fingerprinted
 * before and after, and the old key is destroyed only after every row opens with the new key alone.
 */
export async function beginDataKeyRotation(db: TallybookDB, prepared: PreparedRotation, opts: RotateOptions): Promise<void> {
  const idb = opts.idb ?? indexedDB; const newDek = preparedRotations.get(prepared);
  if (!newDek) throw new Error("This key change was already used or cancelled. Start again.");
  if (opts.typedRecoveryCode.trim() !== prepared.recoveryCode) fail("The recovery code you typed does not match. Copy it exactly and keep it somewhere safe.");
  const rec = await readRecord(db.name, idb) ?? fail("This ledger is not encrypted on this device.");
  if (rec.state !== "encrypted") fail("Finish or roll back the encryption in progress first.");
  if (!db.ledgerSeal.unlocked) fail("Unlock the ledger first.");
  if (!(await getVerifiedBackupReceipt(db))) fail("Export and verify an encrypted backup first. A key change rewrites every record.");
  const oldKeys = await deriveFrom(await unlockLedgerDek(rec.keyring, opts.passphrase, "passphrase"));
  const newKeys = await deriveFrom(new Uint8Array(newDek));
  const sealedNext = sealSt24Row({ rowKey: oldKeys.rowKey, scope: db.name, table: REKEY_TABLE, primaryKey: REKEY_PK, record: { dek: toB64(newDek) } });
  preparedRotations.delete(prepared); newDek.fill(0);
  await withCrossTabDataLock("exclusive", async () => {
    const before = await fingerprintLedger(db);
    const next = await writeRecord({ dbName: db.name, state: "rekeying", keyring: rec.keyring, rekey: { nextKeyring: prepared.keyring, nextDek: sealedNext }, precheck: before, startedAt: new Date().toISOString() }, rec.version, idb);
    db.ledgerSeal.unlockForRotation(newKeys, oldKeys); db.ledgerSeal.setMode("encrypted");
    zeroSt24Key(oldKeys.rowKey); zeroSt24Key(oldKeys.blindKey); zeroSt24Key(newKeys.rowKey); zeroSt24Key(newKeys.blindKey);
    await finishRotation(db, next, before, idb, opts.onProgress);
  });
}
/** After a crash mid-rotation: the OLD passphrase or OLD recovery code recovers the new key from the durable record, then finishes. */
export async function resumeDataKeyRotation(db: TallybookDB, credential: Credential, opts: { onProgress?: (d: number, t: number) => void; idb?: IDBFactory } = {}) {
  const idb = opts.idb ?? indexedDB;
  const rec = await readRecord(db.name, idb);
  if (!rec || rec.state !== "rekeying" || !rec.rekey || !rec.precheck) fail("There is no interrupted key change to resume.");
  const oldKeys = await deriveFrom(await ("passphrase" in credential ? unlockLedgerDek(rec!.keyring, credential.passphrase, "passphrase") : unlockLedgerDek(rec!.keyring, credential.recoveryCode, "recovery")));
  let newDek: Uint8Array;
  try { newDek = fromB64((openSt24Row({ rowKey: oldKeys.rowKey, scope: db.name, table: REKEY_TABLE, primaryKey: REKEY_PK, sealed: rec!.rekey!.nextDek }) as { dek: string }).dek); }
  catch { zeroSt24Key(oldKeys.rowKey); zeroSt24Key(oldKeys.blindKey); return fail("The interrupted key change record cannot be read with this credential."); }
  const newKeys = await deriveFrom(newDek);
  db.ledgerSeal.unlockForRotation(newKeys, oldKeys); db.ledgerSeal.setMode("encrypted"); setSealFence(db.name, true);
  zeroSt24Key(oldKeys.rowKey); zeroSt24Key(oldKeys.blindKey); zeroSt24Key(newKeys.rowKey); zeroSt24Key(newKeys.blindKey);
  await db.open();
  await withCrossTabDataLock("exclusive", () => finishRotation(db, rec!, rec!.precheck!, idb, opts.onProgress));
}
/** Count raw sealed rows that do NOT yet open with the incoming key alone. */
async function rowsStillOnOldKey(db: TallybookDB): Promise<number> {
  let stale = 0;
  for (const name of sealedTables(db)) {
    const [keys, rows] = await Promise.all([
      rawStore<IDBValidKey[]>(db, name, s => s.getAllKeys() as IDBRequest<IDBValidKey[]>),
      rawStore<Record<string, unknown>[]>(db, name, s => s.getAll() as IDBRequest<Record<string, unknown>[]>),
    ]);
    rows.forEach((row, i) => { if (SEAL_FIELD in row && db.ledgerSeal.isOnPreviousKey(name, keys[i], row[SEAL_FIELD])) stale++; });
  }
  return stale;
}
async function finishRotation(db: TallybookDB, rec: LedgerRecord, before: Record<string, TableFingerprint>, idb: IDBFactory, onProgress?: (d: number, t: number) => void) {
  await convertAll(db, onProgress); // reads rows under either key, writes them under the new one (and re-blinds every index)
  const bad = diffFingerprints(before, await fingerprintLedger(db));
  if (bad.length) fail(`Verification failed for ${bad.join(", ")}. Nothing was deleted; the ledger stays readable under either key. Resume to finish.`);
  const scan = await scanRawLedger(db);
  if (scan.plaintext > 0 || scan.unblinded > 0) fail(`${scan.plaintext} plaintext rows were found during the key change. Resume to finish.`);
  const stale = await rowsStillOnOldKey(db);
  if (stale > 0) fail(`${stale} rows are still sealed under the old key. Resume to finish.`);
  await writeRecord({ dbName: db.name, state: "encrypted", keyring: rec.rekey!.nextKeyring }, rec.version, idb);
  db.ledgerSeal.dropPrevious(); db.ledgerSeal.setMode("encrypted");
}

// ---------- credential management (rows are not re-encrypted: only the key wrap changes) ----------
async function mutateKeyring(db: TallybookDB, idb: IDBFactory, f: (k: LedgerKeyringV1) => Promise<{ keyring: LedgerKeyringV1; extra?: string }>) {
  const rec = await readRecord(db.name, idb) ?? fail("This ledger is not encrypted on this device.");
  if (rec.state !== "encrypted") fail("Finish or roll back the encryption in progress first.");
  const { keyring, extra } = await f(rec.keyring);
  await writeRecord({ dbName: db.name, state: rec.state, keyring }, rec.version, idb);
  return extra;
}
export const changeLedgerPassphraseFor = (db: TallybookDB, current: string, next: string, idb: IDBFactory = indexedDB) =>
  mutateKeyring(db, idb, async k => ({ keyring: await changeLedgerPassphrase(k, current, next) })).then(() => undefined);
/** Forgot the passphrase but have the recovery code: set a new passphrase. The recovery code keeps working. */
export const resetLedgerPassphraseFor = (db: TallybookDB, recoveryCode: string, next: string, idb: IDBFactory = indexedDB) =>
  mutateKeyring(db, idb, async k => ({ keyring: await resetLedgerPassphraseWithRecovery(k, recoveryCode, next) })).then(() => undefined);
/** Replace the recovery code (needs the passphrase). Returns the NEW code to show once. */
export const rotateLedgerRecoveryCode = (db: TallybookDB, passphrase: string, idb: IDBFactory = indexedDB) =>
  mutateKeyring(db, idb, async k => { const r = await replaceLedgerRecoveryCode(k, passphrase); return { keyring: r.keyring, extra: r.recoveryCode }; }) as Promise<string>;

// ---------- recovery package (wrapped keys only; useless without a credential) ----------
export const RECOVERY_PACKAGE_KIND = "tallybook-ledger-recovery-package";
export async function exportRecoveryPackage(db: TallybookDB, idb: IDBFactory = indexedDB): Promise<string> {
  const rec = await readRecord(db.name, idb) ?? fail("This ledger is not encrypted on this device.");
  if (rec.state === "rekeying") fail("Finish the interrupted key change before exporting a recovery package.");
  return JSON.stringify({ kind: RECOVERY_PACKAGE_KIND, version: 1, ledger: db.name, exportedAt: new Date().toISOString(), keyring: rec.keyring }, null, 2);
}
/** Rebuild the key record for a ledger whose record is missing. Refuses if a record already exists. */
export async function importRecoveryPackage(db: TallybookDB, text: string, idb: IDBFactory = indexedDB): Promise<void> {
  if (text.length > 20_000) fail("That does not look like a Tallybook recovery package.");
  let pkg: { kind?: string; version?: number; ledger?: string; keyring?: LedgerKeyringV1 };
  try { pkg = JSON.parse(text); } catch { return fail("That does not look like a Tallybook recovery package."); }
  if (pkg.kind !== RECOVERY_PACKAGE_KIND || pkg.version !== 1 || !pkg.keyring) fail("That does not look like a Tallybook recovery package.");
  validateLedgerKeyring(pkg.keyring);
  if (pkg.keyring!.workspaceId !== db.name) fail("This recovery package belongs to a different ledger.");
  if (await readRecord(db.name, idb)) fail("This device already has encryption keys for this ledger.");
  await db.open();
  if (!(await anyRawSealedRow(db))) fail("This ledger is not encrypted, so there is nothing to recover.");
  await writeRecord({ dbName: db.name, state: "encrypted", keyring: pkg.keyring! }, null, idb);
  db.ledgerSeal.setMode("encrypted"); setSealFence(db.name, true);
}
