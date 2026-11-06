/**
 * Durable, encrypted, multi-tab-safe write-ahead queue for shared-shop sales.
 *
 * Dependency-free on purpose (no React, Supabase or DOM imports) so the same
 * code runs under `node --test`. Browser wiring lives in secureStorage.ts and
 * shopOutbox.ts.
 *
 * Guarantees this module is responsible for:
 *  - Write-ahead: a sale is persisted BEFORE any network attempt.
 *  - One record per sale, written atomically by key. There is no whole-list
 *    read-modify-write, so two tabs can never overwrite each other's entries.
 *  - Per-sale lock around every send, so two tabs never send the same sale at
 *    the same moment. The server idempotency key remains the last line of defence.
 *  - Ambiguous outcomes (request sent, response lost) are reconciled against
 *    the server's receipt before the sale is sent again.
 *  - Records are AES-GCM sealed and bound (as additional authenticated data)
 *    to their scope and key. A record that cannot be opened is NEVER deleted:
 *    it is surfaced as "needs-review".
 *  - A definite server rejection parks the sale; it is never resubmitted silently.
 */

export type EntryStatus = "queued" | "sending" | "rejected" | "needs-review";

export interface OutboxScope { userId: string; companyId: string }
export interface SaleLike { submissionKey: string }

export interface QueuedEntry<S extends SaleLike> {
  sale: S;
  /** Display-only cart snapshot so the attendant can recognise the sale. */
  summary: string;
  queuedAt: string;
  status: EntryStatus;
  /** Network attempts that ended without a server decision. */
  attempts: number;
  /** True once a request may have reached the server without us seeing the answer. */
  ambiguous: boolean;
  error?: string;
  /** The record exists but cannot be opened on this device (lost key, tampering). */
  unreadable?: boolean;
}

export interface SealedRecord { v: 1; iv: string; ct: string }
export interface StoredRecord { id: string; record: SealedRecord }

/** Atomic per-record storage. Browser: IndexedDB. Tests: memory. */
export interface OutboxBackend {
  list(scopeKey: string): Promise<StoredRecord[]>;
  get(scopeKey: string, id: string): Promise<SealedRecord | null>;
  put(scopeKey: string, id: string, record: SealedRecord): Promise<void>;
  delete(scopeKey: string, id: string): Promise<void>;
}

export interface Sealer {
  seal(plain: string, aad: string): Promise<SealedRecord>;
  open(record: SealedRecord, aad: string): Promise<string>;
}

export type LockRunner = <T>(name: string, run: () => Promise<T>) => Promise<T>;

export const MAX_UNCONFIRMED_ATTEMPTS = 25;

const toB64 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
};
const fromB64 = (text: string) => {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
};

/** AES-256-GCM with a fresh random 96-bit nonce per write and the record identity as AAD. */
export function createSealer(key: CryptoKey): Sealer {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  return {
    async seal(plain, aad) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(aad) }, key, enc.encode(plain));
      return { v: 1, iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
    },
    async open(record, aad) {
      if (!record || record.v !== 1) throw new Error("Unsupported record version");
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(record.iv), additionalData: enc.encode(aad) }, key, fromB64(record.ct));
      return dec.decode(plain);
    },
  };
}

/** In-process fallback when the Web Locks API is unavailable (single tab only). */
export function inProcessLocks(): LockRunner {
  const tails = new Map<string, Promise<unknown>>();
  return <T>(name: string, run: () => Promise<T>) => {
    const previous = tails.get(name) ?? Promise.resolve();
    const result = previous.then(run, run);
    tails.set(name, result.then(() => undefined, () => undefined));
    return result;
  };
}

/** Cross-tab locks via the Web Locks API when present, otherwise in-process. */
export function bestAvailableLocks(): LockRunner {
  type Locks = { request: (name: string, options: { mode: "exclusive" }, cb: (lock: object | null) => Promise<unknown>) => Promise<unknown> };
  const locks = (globalThis as { navigator?: { locks?: Locks } }).navigator?.locks;
  const local = inProcessLocks();
  if (locks && typeof locks.request === "function") {
    // Standard three-argument form. A null lock (a host that grants nothing) falls back to the in-process lock
    // so work never runs unguarded.
    return <T>(name: string, run: () => Promise<T>) =>
      locks.request(name, { mode: "exclusive" }, lock => (lock === null ? local(name, run) : run())) as Promise<T>;
  }
  return local;
}

export const scopeKeyOf = ({ userId, companyId }: OutboxScope) => `${userId}:${companyId}`;
const aadFor = (scopeKey: string, id: string) => `tallybook.outbox.v2|${scopeKey}|${id}`;

export interface OutboxDeps<S extends SaleLike, R> {
  backend: OutboxBackend;
  sealer: Sealer;
  lock: LockRunner;
  /** True when the server DECIDED against the request (retrying cannot help). */
  isRejected: (error: unknown) => boolean;
  /**
   * Ask the server whether this sale was already recorded. Resolve null only
   * when the server definitely has no such sale; reject if it cannot be asked.
   */
  lookupReceipt?: (sale: S) => Promise<R | null>;
  now?: () => Date;
  maxAttempts?: number;
}

export type SubmitResult<R> =
  | { state: "recorded"; receipt: R }
  | { state: "queued" }
  | { state: "rejected"; error: string }
  | { state: "needs-review"; error: string }
  /** Another tab already confirmed this sale; nothing left to do here. */
  | { state: "already-confirmed" };

interface Payload<S extends SaleLike> {
  sale: S; summary: string; queuedAt: string; status: EntryStatus;
  attempts: number; ambiguous: boolean; error?: string;
}

export function createOutbox<S extends SaleLike, R>(deps: OutboxDeps<S, R>) {
  const { backend, sealer, lock, isRejected, lookupReceipt } = deps;
  const now = deps.now ?? (() => new Date());
  const maxAttempts = deps.maxAttempts ?? MAX_UNCONFIRMED_ATTEMPTS;

  async function load(scopeKey: string, id: string): Promise<{ entry: QueuedEntry<S> } | { unreadable: true } | null> {
    const record = await backend.get(scopeKey, id);
    if (!record) return null;
    try {
      const p = JSON.parse(await sealer.open(record, aadFor(scopeKey, id))) as Payload<S>;
      if (!p || typeof p !== "object" || p.sale?.submissionKey !== id) throw new Error("Record does not match its key");
      return { entry: { sale: p.sale, summary: p.summary, queuedAt: p.queuedAt, status: p.status, attempts: p.attempts ?? 0, ambiguous: !!p.ambiguous, error: p.error } };
    } catch { return { unreadable: true }; }
  }

  async function save(scopeKey: string, entry: QueuedEntry<S>) {
    const id = entry.sale.submissionKey;
    const payload: Payload<S> = { sale: entry.sale, summary: entry.summary, queuedAt: entry.queuedAt, status: entry.status,
      attempts: entry.attempts, ambiguous: entry.ambiguous, ...(entry.error ? { error: entry.error } : {}) };
    await backend.put(scopeKey, id, await sealer.seal(JSON.stringify(payload), aadFor(scopeKey, id)));
  }

  const lockName = (scopeKey: string, id: string) => `tallybook-outbox:${scopeKey}:${id}`;

  /** All entries, oldest first. Unreadable records are listed, never dropped. */
  async function read(scope: OutboxScope): Promise<Array<QueuedEntry<S> & { id: string }>> {
    const scopeKey = scopeKeyOf(scope);
    const rows = await backend.list(scopeKey);
    const out: Array<QueuedEntry<S> & { id: string }> = [];
    for (const row of rows) {
      const loaded = await load(scopeKey, row.id);
      if (!loaded) continue;
      if ("unreadable" in loaded) {
        out.push({ id: row.id, sale: { submissionKey: row.id } as S, summary: "A saved sale that this device can't open",
          queuedAt: "", status: "needs-review", attempts: 0, ambiguous: true, unreadable: true,
          error: "This saved sale can't be read on this device. Do not re-enter it until the owner has checked the sales list." });
      } else out.push({ ...loaded.entry, id: row.id });
    }
    return out.sort((a, b) => (a.queuedAt < b.queuedAt ? -1 : a.queuedAt > b.queuedAt ? 1 : a.id < b.id ? -1 : 1));
  }

  async function deliver(scope: OutboxScope, id: string, send: (sale: S) => Promise<R>): Promise<SubmitResult<R>> {
    const scopeKey = scopeKeyOf(scope);
    return lock(lockName(scopeKey, id), async () => {
      const loaded = await load(scopeKey, id);
      if (!loaded) return { state: "already-confirmed" as const };
      if ("unreadable" in loaded) return { state: "needs-review" as const, error: "This saved sale can't be read on this device." };
      let entry = loaded.entry;
      if (entry.status === "rejected") return { state: "rejected" as const, error: entry.error ?? "Rejected" };
      if (entry.status === "needs-review") return { state: "needs-review" as const, error: entry.error ?? "Needs review" };
      // We hold the per-sale lock, so a persisted "sending" belongs to a send that died.
      if (entry.status === "sending") entry = { ...entry, status: "queued", ambiguous: true };

      // The previous attempt may have reached the server. Ask before sending again.
      if (entry.ambiguous && lookupReceipt) {
        try {
          const found = await lookupReceipt(entry.sale);
          if (found) { await backend.delete(scopeKey, id); return { state: "recorded" as const, receipt: found }; }
        } catch { return { state: "queued" as const }; } // cannot ask the server: keep it, try later
      }

      await save(scopeKey, { ...entry, status: "sending", attempts: entry.attempts + 1 });
      try {
        const receipt = await send(entry.sale);
        await backend.delete(scopeKey, id);
        return { state: "recorded" as const, receipt };
      } catch (error) {
        if (isRejected(error)) {
          const message = error instanceof Error ? error.message : "Rejected by the server";
          await save(scopeKey, { ...entry, status: "rejected", attempts: entry.attempts + 1, ambiguous: false, error: message });
          return { state: "rejected" as const, error: message };
        }
        const attempts = entry.attempts + 1;
        if (attempts >= maxAttempts) {
          const message = "This sale could not be confirmed after many tries. Check the sales list before entering it again.";
          await save(scopeKey, { ...entry, status: "needs-review", attempts, ambiguous: true, error: message });
          return { state: "needs-review" as const, error: message };
        }
        await save(scopeKey, { ...entry, status: "queued", attempts, ambiguous: true });
        return { state: "queued" as const };
      }
    });
  }

  return {
    read,

    /** Save first, then send. Never loses a sale the attendant pressed "Record" on. */
    async submit(scope: OutboxScope, sale: S, summary: string, send: (sale: S) => Promise<R>): Promise<SubmitResult<R>> {
      const scopeKey = scopeKeyOf(scope);
      const id = sale.submissionKey;
      await lock(lockName(scopeKey, id), async () => {
        if (!(await backend.get(scopeKey, id))) {
          await save(scopeKey, { sale, summary, queuedAt: now().toISOString(), status: "queued", attempts: 0, ambiguous: false });
        }
      });
      return deliver(scope, id, send);
    },

    /** Re-send pending sales oldest first. Stops at the first connection failure. */
    async flush(scope: OutboxScope, send: (sale: S) => Promise<R>): Promise<Array<SubmitResult<R>>> {
      const scopeKey = scopeKeyOf(scope);
      return lock(`tallybook-outbox-flush:${scopeKey}`, async () => {
        const results: Array<SubmitResult<R>> = [];
        for (const entry of (await read(scope)).filter(e => !e.unreadable && (e.status === "queued" || e.status === "sending"))) {
          const result = await deliver(scope, entry.id, send);
          results.push(result);
          if (result.state === "queued") break;
        }
        return results;
      });
    },

    /** Remove a parked sale after the person has dealt with it. Unreadable records need `force`. */
    async dismiss(scope: OutboxScope, id: string, options: { force?: boolean } = {}): Promise<boolean> {
      const scopeKey = scopeKeyOf(scope);
      return lock(lockName(scopeKey, id), async () => {
        const loaded = await load(scopeKey, id);
        if (!loaded) return false;
        if ("unreadable" in loaded) { if (!options.force) return false; }
        else if (loaded.entry.status !== "rejected" && loaded.entry.status !== "needs-review") return false;
        await backend.delete(scopeKey, id);
        return true;
      });
    },

    /**
     * Import entries from the old plaintext localStorage queue. The legacy copy
     * is removed only after every imported entry has been read back and opened.
     */
    async migrateLegacy(scope: OutboxScope, legacy: { getItem(k: string): string | null; removeItem(k: string): void }, legacyKey: string): Promise<{ imported: number; kept: boolean }> {
      const raw = legacy.getItem(legacyKey);
      if (!raw) return { imported: 0, kept: false };
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { return { imported: 0, kept: true }; }
      if (!Array.isArray(parsed)) return { imported: 0, kept: true };
      const scopeKey = scopeKeyOf(scope);
      const ids: string[] = [];
      for (const item of parsed as Array<{ sale?: S; summary?: string; queuedAt?: string; status?: string; error?: string }>) {
        const sale = item?.sale;
        if (!sale || typeof sale.submissionKey !== "string" || (item.status !== "pending" && item.status !== "rejected")) return { imported: 0, kept: true };
        ids.push(sale.submissionKey);
        await lock(lockName(scopeKey, sale.submissionKey), async () => {
          if (await backend.get(scopeKey, sale.submissionKey)) return;
          await save(scopeKey, { sale, summary: item.summary ?? "", queuedAt: item.queuedAt ?? now().toISOString(),
            status: item.status === "rejected" ? "rejected" : "queued", attempts: 0, ambiguous: item.status !== "rejected", error: item.error });
        });
      }
      for (const id of ids) {
        const check = await load(scopeKey, id);
        if (!check || "unreadable" in check) return { imported: 0, kept: true };
      }
      legacy.removeItem(legacyKey);
      return { imported: ids.length, kept: false };
    },
  };
}

/** Memory backend for tests and for browsers without IndexedDB. */
export function memoryBackend(): OutboxBackend & { raw: Map<string, SealedRecord> } {
  const raw = new Map<string, SealedRecord>();
  const k = (scopeKey: string, id: string) => `${scopeKey}\u0000${id}`;
  return {
    raw,
    async list(scopeKey) {
      const prefix = `${scopeKey}\u0000`;
      return [...raw.entries()].filter(([key]) => key.startsWith(prefix)).map(([key, record]) => ({ id: key.slice(prefix.length), record }));
    },
    async get(scopeKey, id) { return raw.get(k(scopeKey, id)) ?? null; },
    async put(scopeKey, id, record) { raw.set(k(scopeKey, id), record); },
    async delete(scopeKey, id) { raw.delete(k(scopeKey, id)); },
  };
}
