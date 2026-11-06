/**
 * Per-sale IndexedDB write-ahead queue for the cloud-authoritative shared shop.
 *
 * Distinct records and IndexedDB readwrite transactions avoid the lost-update
 * defect of localStorage read/modify/write across tabs. The server remains
 * authoritative; repeated delivery MUST reuse the same submission key.
 *
 * Legacy v1 localStorage data is migrated without deleting the source until
 * every row is durably committed. Damaged source data is retained for recovery
 * and prevents an apparently empty/healthy queue from being shown.
 *
 * NOTE: IndexedDB does NOT encrypt stored payloads. Stage B storage protection
 * and owner-key recovery need separate work before privacy acceptance.
 */
import Dexie from "dexie";
import { ShopRejectedError, type SaleRequest, type ShopReceipt } from "./shopClient";

export interface QueuedSale {
  sale: SaleRequest;
  summary: string;
  queuedAt: string;
  status: "pending" | "rejected";
  error?: string;
}
export interface OutboxScope { userId: string; companyId: string }
type LegacyStorage = Pick<globalThis.Storage, "getItem" | "removeItem">;
interface StoredSale extends QueuedSale { id: string; scopeKey: string }
interface QuarantinedLegacy {
  id: string;
  raw: string;
  capturedAt: string;
  reason: string;
}
const DB_NAME = "tallybook-shared-shop-outbox-v2";
const database = new Dexie(DB_NAME);
database.version(1).stores({ entries: "id,scopeKey,queuedAt", quarantine: "id" });
const entries = database.table<StoredSale, string>("entries");
const quarantine = database.table<QuarantinedLegacy, string>("quarantine");

const scopeKey = (scope: OutboxScope) => JSON.stringify([scope.userId, scope.companyId]);
const entryKey = (scope: OutboxScope, submissionKey: string) =>
  JSON.stringify([scope.userId, scope.companyId, submissionKey]);
const legacyKey = (scope: OutboxScope) =>
  `tallybook.shop.outbox.v1:${scope.userId}:${scope.companyId}`;

function defaultLegacyStorage(): LegacyStorage | null {
  // Node-native pure tests may not provide a browser window. A real browser
  // refusing localStorage access is different: we cannot verify whether older
  // unsent sales exist, so do not silently skip legacy recovery.
  if (typeof window === "undefined") return null;
  try {
    const storage = window.localStorage;
    if (!storage) throw Error("Unavailable");
    return storage;
  } catch {
    throw new Error("Browser storage is blocked. Older unsent sales cannot be checked; do not clear browser data or send a new sale.");
  }
}
function valid(entry: unknown): entry is QueuedSale {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
  const row = entry as QueuedSale;
  return !!row.sale && typeof row.sale === "object" && !Array.isArray(row.sale) &&
    typeof row.sale.submissionKey === "string" &&
    /^[A-Za-z0-9_-]{16,64}$/.test(row.sale.submissionKey) &&
    typeof row.sale.storeId === "string" && typeof row.summary === "string" &&
    typeof row.queuedAt === "string" && Number.isFinite(Date.parse(row.queuedAt)) &&
    (row.status === "pending" || row.status === "rejected") &&
    (row.error === undefined || typeof row.error === "string");
}
function sameSale(a: SaleRequest, b: SaleRequest): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
function scopeIsValid(scope: OutboxScope) {
  if (!scope.userId || !scope.companyId || typeof scope.userId !== "string" ||
      typeof scope.companyId !== "string") {
    throw new Error("Sign in and choose a business before saving a sale.");
  }
}
async function retainBadLegacy(scope: OutboxScope, raw: string, reason: string): Promise<never> {
  const id = legacyKey(scope);
  await quarantine.put({ id, raw, reason, capturedAt: new Date().toISOString() });
  throw new Error("Older unsent sales could not be migrated safely. Do not clear this browser's data; ask the business owner to recover the pending sales.");
}
/** Import only for this signed-in account and business. Two new-version tabs
 * serialize via IndexedDB; old-version tabs remain a mixed-version hazard.
 */
async function migrateLegacy(scope: OutboxScope, storage: LegacyStorage | null) {
  if (!storage) return;
  let raw: string | null;
  try { raw = storage.getItem(legacyKey(scope)); }
  catch {
    throw new Error("Browser storage cannot be read. Older unsent sales may need recovery; do not clear this browser's data.");
  }
  if (raw === null) return;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { await retainBadLegacy(scope, raw, "Invalid legacy JSON"); }
  if (!Array.isArray(parsed) || !parsed.every(valid)) {
    await retainBadLegacy(scope, raw, "Invalid legacy sale entry");
  }
  const legacy = parsed as QueuedSale[];
  try {
    await database.transaction("rw", entries, async () => {
      for (const row of legacy) {
        const id = entryKey(scope, row.sale.submissionKey);
        const existing = await entries.get(id);
        if (existing && !sameSale(existing.sale, row.sale)) {
          throw new Error("Conflicting queued sale with the same submission key.");
        }
        if (!existing) {
          await entries.add({ ...row, id, scopeKey: scopeKey(scope) });
        }
      }
    });
  } catch {
    await retainBadLegacy(scope, raw, "Conflicting legacy sale or storage failure");
  }
  // A concurrently modified legacy value is NOT removed: import it next time.
  // Old-version tabs are not transaction participants: users should close them.
  try {
    if (storage.getItem(legacyKey(scope)) === raw) storage.removeItem(legacyKey(scope));
  } catch {
    // The durable copy is committed; leaving the source is safe and idempotent.
  }
}
async function prepare(scope: OutboxScope, storage: LegacyStorage | null) {
  scopeIsValid(scope);
  await migrateLegacy(scope, storage);
  const bad = await quarantine.get(legacyKey(scope));
  if (bad) throw new Error("This account has unrecovered older queued sales. Do not clear browser storage; restore them before continuing.");
  // This check must precede ALL write and replay paths, not just readOutbox:
  // otherwise a corrupt older sale can be silently bypassed by a new sale.
  const rows = await entries.where("scopeKey").equals(scopeKey(scope)).toArray();
  if (rows.some(row => !valid(row) || row.scopeKey !== scopeKey(scope) ||
      row.id !== entryKey(scope, row.sale.submissionKey))) {
    throw new Error("Stored unsent sales need recovery. Do not clear this browser's data or record more sales.");
  }
}
export async function readOutbox(
  scope: OutboxScope, legacyStorage: LegacyStorage | null = defaultLegacyStorage()
): Promise<QueuedSale[]> {
  await prepare(scope, legacyStorage);
  const rows = await entries.where("scopeKey").equals(scopeKey(scope)).toArray();
  // Never silently treat damaged stored sales as an empty or safe queue.
  // The source records stay untouched for owner-assisted recovery.
  if (rows.some(row => !valid(row) || row.scopeKey !== scopeKey(scope) ||
      row.id !== entryKey(scope, row.sale.submissionKey))) {
    throw new Error("Stored unsent sales need recovery. Do not clear this browser's data or record more sales.");
  }
  return rows.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt) || a.id.localeCompare(b.id))
    .map(({sale, summary, queuedAt, status, error}) => ({
      sale, summary, queuedAt, status, ...(error === undefined ? {} : {error})
    }));
}
export type SendSale = (sale: SaleRequest) => Promise<ShopReceipt>;
export type SubmitResult =
  | { state: "recorded"; receipt: ShopReceipt }
  | { state: "queued" }
  | { state: "rejected"; error: string };

async function deliver(scope: OutboxScope, sale: SaleRequest, send: SendSale): Promise<SubmitResult> {
  const id = entryKey(scope, sale.submissionKey);
  try {
    const receipt = await send(sale);
    if (receipt.submissionKey !== sale.submissionKey) {
      throw new Error("Server returned a receipt for another sale; keep the queued record for review.");
    }
    await database.transaction("rw", entries, async () => {
      const current = await entries.get(id);
      if (current && sameSale(current.sale, sale)) await entries.delete(id);
    });
    return {state: "recorded", receipt};
  } catch (error) {
    if (error instanceof ShopRejectedError) {
      await database.transaction("rw", entries, async () => {
        const current = await entries.get(id);
        if (current && sameSale(current.sale, sale)) {
          await entries.update(id, {status: "rejected", error: error.message});
        }
      });
      return {state: "rejected", error: error.message};
    }
    return {state: "queued"};
  }
}
/** Save one idempotency key in an IndexedDB transaction BEFORE sending. If
 * quota/transaction fails, throw: NEVER send a sale that was not saved.
 */
export async function submitSale(
  scope: OutboxScope, sale: SaleRequest, summary: string, send: SendSale,
  legacyStorage: LegacyStorage | null = defaultLegacyStorage()
): Promise<SubmitResult> {
  await prepare(scope, legacyStorage);
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(sale.submissionKey)) {
    throw new Error("Sale submission key is invalid.");
  }
  const id = entryKey(scope, sale.submissionKey);
  await database.transaction("rw", entries, async () => {
    const current = await entries.get(id);
    if (current && !sameSale(current.sale, sale)) {
      throw new Error("This sale key was already used with different details.");
    }
    if (!current) await entries.add({
      id, scopeKey: scopeKey(scope), sale, summary, queuedAt: new Date().toISOString(), status: "pending"
    });
    if (current?.status === "rejected") {
      throw new Error("This sale was rejected. Review it before attempting a new sale.");
    }
  });
  return deliver(scope, sale, send);
}
export async function flushOutbox(
  scope: OutboxScope, send: SendSale,
  legacyStorage: LegacyStorage | null = defaultLegacyStorage()
): Promise<SubmitResult[]> {
  const queued = (await readOutbox(scope, legacyStorage)).filter(e => e.status === "pending");
  const results: SubmitResult[] = [];
  for (const row of queued) {
    const result = await deliver(scope, row.sale, send);
    results.push(result);
    if (result.state === "queued") break;
  }
  return results;
}
export async function dismissQueuedSale(
  scope: OutboxScope, submissionKey: string,
  legacyStorage: LegacyStorage | null = defaultLegacyStorage()
): Promise<void> {
  await prepare(scope, legacyStorage);
  const id = entryKey(scope, submissionKey);
  await database.transaction("rw", entries, async () => {
    const existing = await entries.get(id);
    if (existing?.status === "rejected") await entries.delete(id);
  });
}
