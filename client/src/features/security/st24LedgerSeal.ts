/**
 * ST24-05: transparent at-rest encryption for the active Dexie ledger.
 *
 * A DBCore middleware sits between Tallybook's services and IndexedDB. Services keep using ordinary Dexie
 * tables and transactions; the middleware seals each row on write and opens it on read, synchronously (see
 * st24RowCipher.mjs for why). Defaults to `plaintext` mode, which changes nothing.
 *
 * What is protected: every non-exempt row body (all fields), authenticated against its table + primary key.
 * What stays visible (by design, listed in CLEAR_INDEX_FIELDS and pinned by tests): primary keys, table names,
 * row counts, and the indexed fields that queries need in the clear (opaque ids, timestamps, statuses).
 * Personal / financial indexed fields are BLINDED (keyed HMAC): exact lookups still work, nothing is readable.
 * A blinded index supports exact lookups only; any other query shape throws instead of returning wrong rows.
 */
import Dexie from "dexie";
import type { DBCore, DBCoreCursor, DBCoreIndex, DBCoreKeyRange, DBCoreMutateRequest, DBCoreTable, Middleware } from "dexie";
import { blindSt24Value, openSt24Row, sealSt24Row, zeroSt24Key, type SealedSt24Row } from "./st24RowCipher.mjs";
import { canonicalSt24CloneJson } from "./st24CloneCodec.mjs";

/** decrypting = reversible path back to plaintext: reads open sealed rows, writes store plaintext. */
export type SealMode = "plaintext" | "migrating" | "encrypted" | "decrypting";
/** Keys for one generation of the ledger data key (row sealing + blind indexes). */
export interface SealKeys { rowKey: Uint8Array; blindKey: Uint8Array }
export class LedgerLockedError extends Error { constructor(message = "The ledger is locked. Enter your passphrase to unlock it.") { super(message); this.name = "LedgerLockedError"; } }
export class LedgerIntegrityError extends Error { constructor(message: string) { super(message); this.name = "LedgerIntegrityError"; } }

export const SEAL_FIELD = "__seal";
/** Left in clear on purpose: marker/config rows needed before unlock. Holds no customer, staff or money data. */
export const SEAL_EXEMPT_TABLES: ReadonlySet<string> = new Set(["appMeta"]);
/** Indexed fields whose values are replaced by a keyed blind value. Equality lookups only. */
export const BLINDED_INDEX_FIELDS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  businessProfiles: ["name"],
  categories: ["name", "normalizedName"],
  products: ["name", "normalizedName", "sku"],
  customers: ["name", "normalizedName", "phone"],
  suppliers: ["normalizedName"],
  storeLocations: ["normalizedName"],
  mobileMoneyProviders: ["normalizedName"],
  sales: ["receiptNumber", "outstandingMinor"],
  receipts: ["receiptNumber"],
  inventoryMovements: ["resultingQuantity"],
});

const FENCE_PREFIX = "tallybook-ledger-sealed:";
/** Synchronous cross-tab fence: once ANY tab seals a ledger, tabs still in plaintext mode must not write. */
export function setSealFence(scope: string, sealed: boolean) {
  try { if (sealed) localStorage.setItem(FENCE_PREFIX + scope, "1"); else localStorage.removeItem(FENCE_PREFIX + scope); } catch { /* storage unavailable */ }
}
export function isSealFenced(scope: string): boolean {
  try { return localStorage.getItem(FENCE_PREFIX + scope) === "1"; } catch { return false; }
}

export class LedgerSeal {
  mode: SealMode = "plaintext";
  private keys: SealKeys | null = null;
  /** ONLY while a data-key rotation is in progress: the outgoing generation, used to READ rows not yet re-sealed. Never used to write. */
  private previous: SealKeys | null = null;
  /** ONLY during an encrypted-ledger schema upgrade, inside the exclusive cross-tab lock: rows may still carry index copies
   *  projected for the PREVIOUS schema, so their index copies are not compared with the body. The body itself is still
   *  authenticated (AEAD bound to table + primary key). Reset by upgradeEncryptedLedger before it verifies everything strictly. */
  reprojecting = false;
  constructor(readonly scope: string) {}
  get unlocked() { return this.keys !== null; }
  get rotating() { return this.previous !== null; }
  unlock(keys: SealKeys) {
    this.lock();
    this.keys = { rowKey: new Uint8Array(keys.rowKey), blindKey: new Uint8Array(keys.blindKey) };
  }
  /** Data-key rotation: write with `next`, but keep reading rows still sealed under `previous`. */
  unlockForRotation(next: SealKeys, previous: SealKeys) {
    this.unlock(next);
    this.previous = { rowKey: new Uint8Array(previous.rowKey), blindKey: new Uint8Array(previous.blindKey) };
  }
  /** Rotation finished: the outgoing key is destroyed and can no longer open anything. */
  dropPrevious() {
    if (this.previous) { zeroSt24Key(this.previous.rowKey); zeroSt24Key(this.previous.blindKey); }
    this.previous = null;
  }
  /** Overwrites the in-memory keys (best effort). Nothing on disk changes. */
  lock() {
    this.reprojecting = false;
    this.dropPrevious();
    if (this.keys) { zeroSt24Key(this.keys.rowKey); zeroSt24Key(this.keys.blindKey); }
    this.keys = null;
  }
  setMode(mode: SealMode) { this.mode = mode; }
  requireKeys() { if (!this.keys) throw new LedgerLockedError(); return this.keys; }
  seal(table: string, primaryKey: unknown, record: object): SealedSt24Row {
    return sealSt24Row({ rowKey: this.requireKeys().rowKey, scope: this.scope, table, primaryKey, record });
  }
  open(table: string, primaryKey: unknown, sealed: unknown): Record<string, unknown> {
    const current = this.requireKeys();
    try {
      return openSt24Row({ rowKey: current.rowKey, scope: this.scope, table, primaryKey, sealed });
    } catch (error) {
      // During a rotation a row may still be sealed under the outgoing key. Outside a rotation there is no fallback at all.
      if (!this.previous) throw error;
      return openSt24Row({ rowKey: this.previous.rowKey, scope: this.scope, table, primaryKey, sealed });
    }
  }
  /** Like open(), but also reports which key generation opened the row (only 'previous' during a rotation). */
  openWithGeneration(table: string, primaryKey: unknown, sealed: unknown): { record: Record<string, unknown>; generation: "current" | "previous" } {
    const current = this.requireKeys();
    try {
      return { record: openSt24Row({ rowKey: current.rowKey, scope: this.scope, table, primaryKey, sealed }), generation: "current" };
    } catch (error) {
      if (!this.previous) throw error;
      return { record: openSt24Row({ rowKey: this.previous.rowKey, scope: this.scope, table, primaryKey, sealed }), generation: "previous" };
    }
  }
  /** Blind with the OUTGOING key: used only to verify the index copies of rows that have not been re-sealed yet. */
  blindPrevious(table: string, field: string, value: unknown) {
    if (!this.previous) throw new LedgerLockedError();
    return blindSt24Value({ blindKey: this.previous.blindKey, scope: this.scope, table, field, value });
  }
  /** Rotation check: true when this row is sealed under the OUTGOING key (it still needs re-sealing). */
  isOnPreviousKey(table: string, primaryKey: unknown, sealed: unknown): boolean {
    const current = this.requireKeys();
    try { openSt24Row({ rowKey: current.rowKey, scope: this.scope, table, primaryKey, sealed }); return false; } catch { return true; }
  }
  blind(table: string, field: string, value: unknown) {
    return blindSt24Value({ blindKey: this.requireKeys().blindKey, scope: this.scope, table, field, value });
  }
}

const pathsOf = (keyPath: string | readonly string[] | null | undefined): string[] =>
  keyPath == null ? [] : Array.isArray(keyPath) ? [...keyPath] : [keyPath as string];
const blindable = (v: unknown) => typeof v === "string" || (typeof v === "number" && Number.isFinite(v));
const sameJson = (a: unknown, b: unknown) => {
  try { return canonicalSt24CloneJson(a) === canonicalSt24CloneJson(b); } catch { return false; }
};
const NOT_SEALED_READS = "A plaintext row was found in an encrypted ledger. It was refused.";

interface TableMeta { name: string; primaryPaths: string[]; indexPaths: Map<string, boolean>; indexes: DBCoreIndex[]; exempt: boolean; }

function metaFor(core: DBCore): Map<string, TableMeta> {
  const out = new Map<string, TableMeta>();
  for (const t of core.schema.tables) {
    const primaryPaths = pathsOf(t.primaryKey.keyPath as string | string[] | null);
    if (primaryPaths.length === 0 && !SEAL_EXEMPT_TABLES.has(t.name))
      throw new Error(`Ledger encryption requires an in-line primary key (${t.name}).`);
    const blinded = new Set(BLINDED_INDEX_FIELDS[t.name] ?? []);
    for (const p of primaryPaths) if (blinded.has(p)) throw new Error(`Primary key ${t.name}.${p} cannot be blinded.`);
    const indexPaths = new Map<string, boolean>();
    for (const idx of t.indexes) for (const p of pathsOf(idx.keyPath as string | string[] | null)) indexPaths.set(p, blinded.has(p));
    out.set(t.name, { name: t.name, primaryPaths, indexPaths, indexes: [...t.indexes], exempt: SEAL_EXEMPT_TABLES.has(t.name) });
  }
  return out;
}

export function installLedgerSeal(db: Dexie, seal: LedgerSeal) {
  const middleware: Middleware<DBCore> = {
    stack: "dbcore",
    name: "tallybook-ledger-seal",
    create(down) {
      const metas = metaFor(down);
      const get = (name: string) => metas.get(name)!;

      const clearProjection = (meta: TableMeta, record: Record<string, unknown>, generation: "current" | "previous" = "current") => {
        const stored: Record<string, unknown> = {};
        for (const [path, isBlinded] of meta.indexPaths) {
          const value = Dexie.getByKeyPath(record, path);
          if (value === undefined) continue;
          Dexie.setByKeyPath(stored, path, isBlinded && blindable(value) ? (generation === "previous" ? seal.blindPrevious(meta.name, path, value) : seal.blind(meta.name, path, value)) : value);
        }
        for (const path of meta.primaryPaths) Dexie.setByKeyPath(stored, path, Dexie.getByKeyPath(record, path));
        return stored;
      };
      const primaryKeyOf = (meta: TableMeta, row: Record<string, unknown>) =>
        meta.primaryPaths.length === 1 ? Dexie.getByKeyPath(row, meta.primaryPaths[0]) : meta.primaryPaths.map(p => Dexie.getByKeyPath(row, p));

      const sealRow = (meta: TableMeta, record: Record<string, unknown>) => {
        const pk = primaryKeyOf(meta, record);
        if (pk === undefined || (Array.isArray(pk) && pk.some(v => v === undefined))) throw new Error(`Cannot encrypt a ${meta.name} row without its primary key.`);
        return { ...clearProjection(meta, record), [SEAL_FIELD]: seal.seal(meta.name, pk, record) };
      };
      const openRow = (meta: TableMeta, stored: unknown): unknown => {
        if (stored === undefined || stored === null || typeof stored !== "object") return stored;
        const row = stored as Record<string, unknown>;
        if (!(SEAL_FIELD in row)) {
          if (seal.mode === "encrypted") throw new LedgerIntegrityError(NOT_SEALED_READS);
          return row; // plaintext or migrating: row not converted yet
        }
        const { record, generation } = seal.openWithGeneration(meta.name, primaryKeyOf(meta, row), row[SEAL_FIELD]);
        // Clear/blinded index copies must agree with the authenticated body, or someone edited the index. A row still under the
        // outgoing key (mid-rotation only) is checked against the outgoing blind key; everything else against the current one.
        if (seal.reprojecting) return record;
        const expected = clearProjection(meta, record, generation);
        for (const path of meta.indexPaths.keys())
          if (!sameJson(Dexie.getByKeyPath(expected, path), Dexie.getByKeyPath(row, path)))
            throw new LedgerIntegrityError(`An index value of ${meta.name} does not match its encrypted record. The row was refused.`);
        return record;
      };

      const blindIndexValue = (meta: TableMeta, index: DBCoreIndex, value: unknown): unknown => {
        const paths = pathsOf(index.keyPath as string | string[] | null);
        const one = (path: string, v: unknown) => (meta.indexPaths.get(path) && blindable(v) ? seal.blind(meta.name, path, v) : v);
        if (Array.isArray(index.keyPath)) return Array.isArray(value) ? value.map((v, i) => one(paths[i], v)) : value;
        return one(paths[0], value);
      };
      const isBlindedIndex = (meta: TableMeta, index: DBCoreIndex | undefined) =>
        !!index && pathsOf(index.keyPath as string | string[] | null).some(p => meta.indexPaths.get(p));
      /** Blinded indexes answer exact lookups only. Anything else would silently return wrong rows. */
      const translateRange = (meta: TableMeta, index: DBCoreIndex | undefined, range: DBCoreKeyRange | undefined): DBCoreKeyRange | undefined => {
        // Plaintext mode stores nothing blinded, so lookups must stay untouched (and need no key).
        if (seal.mode === "plaintext" || seal.mode === "decrypting" || !index || !range || !isBlindedIndex(meta, index) || meta.exempt) return range;
        const isEqual = range.type === 1 /* Equal */ && range.lower !== undefined;
        // A compound index may only blind-translate when EVERY blinded component is matched exactly.
        if (!isEqual) throw new Error(`The ${meta.name}.${index.name} index is encrypted and supports exact lookups only.`);
        const v = blindIndexValue(meta, index, range.lower);
        return { ...range, lower: v, upper: v };
      };
      const translateQuery = (meta: TableMeta, q: { index: DBCoreIndex; range: DBCoreKeyRange }) =>
        ({ ...q, range: translateRange(meta, q.index, q.range)! });

      const writeGuard = (meta: TableMeta) => {
        if (meta.exempt) return false;
        if (seal.mode === "decrypting") return false;
        if (seal.mode === "plaintext") {
          if (isSealFenced(seal.scope)) throw new LedgerLockedError("This ledger was encrypted in another tab. Reload Tallybook to continue.");
          return false;
        }
        seal.requireKeys();
        return true;
      };

      const wrapCursor = (meta: TableMeta, cursor: DBCoreCursor): DBCoreCursor => {
        const cache = new WeakMap<object, unknown>();
        return new Proxy(cursor, {
          get(target, prop) {
            if (prop === "value") {
              const raw = (target as unknown as { value: unknown }).value;
              if (raw === null || typeof raw !== "object") return raw;
              if (!cache.has(raw)) cache.set(raw, openRow(meta, raw));
              return cache.get(raw);
            }
            const v = Reflect.get(target, prop, target);
            return typeof v === "function" ? v.bind(target) : v;
          },
          set(target, prop, value) { return Reflect.set(target, prop, value, target); },
        });
      };

      return {
        ...down,
        table(name: string): DBCoreTable {
          const t = down.table(name);
          const meta = get(name);
          if (meta.exempt) return t;
          return {
            ...t,
            mutate(req: DBCoreMutateRequest) {
              const sealing = writeGuard(meta);
              if (req.type === "add" || req.type === "put") {
                if (!sealing) return t.mutate(req);
                // Updates computed inside the engine would apply to ciphertext; only whole-row values may pass.
                const values = req.values.map(v => sealRow(meta, v as Record<string, unknown>));
                const next = { ...req, values } as DBCoreMutateRequest & { changeSpec?: unknown; updates?: unknown };
                delete next.changeSpec; delete next.updates;
                return t.mutate(next as DBCoreMutateRequest);
              }
              const crit = (req as { criteria?: { index: DBCoreIndex | null; range: DBCoreKeyRange } }).criteria;
              if (crit && crit.index && isBlindedIndex(meta, crit.index))
                return t.mutate({ ...req, criteria: { ...crit, range: translateRange(meta, crit.index, crit.range)! } } as DBCoreMutateRequest);
              return t.mutate(req);
            },
            get: req => t.get(req).then(v => openRow(meta, v)),
            getMany: req => t.getMany(req).then(rows => rows.map(v => openRow(meta, v))),
            count: req => t.count({ ...req, query: translateQuery(meta, req.query) }),
            query: req => t.query({ ...req, query: translateQuery(meta, req.query) }).then(res => {
              if (req.values === false) return res;
              return { ...res, result: res.result.map(v => openRow(meta, v)) };
            }),
            openCursor: req => t.openCursor({ ...req, query: translateQuery(meta, req.query) }).then(c => (c && req.values !== false ? wrapCursor(meta, c) : c)),
          };
        },
      };
    },
  };
  db.use(middleware);
}

export type ClassifiedIndex = { table: string; field: string; exposure: "clear" | "blinded" };
/** Machine-checkable catalogue of every indexed field and whether its value is readable at rest. */
export function classifyIndexedFields(db: Dexie): ClassifiedIndex[] {
  const out: ClassifiedIndex[] = [];
  for (const t of db.tables) {
    if (SEAL_EXEMPT_TABLES.has(t.name)) continue;
    const blinded = new Set(BLINDED_INDEX_FIELDS[t.name] ?? []);
    const fields = new Set<string>();
    for (const i of t.schema.indexes) for (const p of pathsOf(i.keyPath as string | string[] | null)) fields.add(p);
    for (const f of [...fields].sort()) out.push({ table: t.name, field: f, exposure: blinded.has(f) ? "blinded" : "clear" });
  }
  return out.sort((a, b) => a.table.localeCompare(b.table) || a.field.localeCompare(b.field));
}
