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
import {createShopVault, unlockShopVault, encryptQueuedSale, decryptQueuedSale, type ShopSealedPayload, type ShopVaultDescriptor} from "./shopVaultCrypto.mjs";
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
interface PlainStoredSale extends QueuedSale { id: string; scopeKey: string }
interface ProtectedStoredSale { id: string; scopeKey: string; queuedAt: string; sealed: ShopSealedPayload }
type StoredSale = PlainStoredSale | ProtectedStoredSale;
interface VaultRecord { id: string; descriptor: ShopVaultDescriptor }
interface QuarantinedLegacy {
  id: string;
  raw: string;
  capturedAt: string;
  reason: string;
}
const DB_NAME = "tallybook-shared-shop-outbox-v2";
const database = new Dexie(DB_NAME);
database.version(1).stores({ entries: "id,scopeKey,queuedAt", quarantine: "id" });
database.version(2).stores({ entries: "id,scopeKey,queuedAt", quarantine: "id", vaults: "id" });
const entries = database.table<StoredSale, string>("entries");
const quarantine = database.table<QuarantinedLegacy, string>("quarantine");
const vaults = database.table<VaultRecord, string>("vaults");
const unlocked = new Map<string, CryptoKey>();
const recoveryError = "Stored unsent sales need recovery. Do not clear this browser's data or record more sales.";
const lockedError = "This business has an encrypted offline sales queue. Unlock it before recording or resending sales.";

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
  if (await vaults.get(scopeKey(scope))) {
    throw new Error("Older unsent sales were found after this offline vault was enabled. Close old Tallybook tabs and recover these sales; do not clear browser data.");
  }
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { await retainBadLegacy(scope, raw, "Invalid legacy JSON"); }
  if (!Array.isArray(parsed) || !parsed.every(valid)) {
    await retainBadLegacy(scope, raw, "Invalid legacy sale entry");
  }
  const legacy = parsed as QueuedSale[];
  try {
    await database.transaction("rw", entries, vaults, async () => {
      if (await vaults.get(scopeKey(scope))) {
        throw new Error("An encrypted vault was enabled during legacy import.");
      }
      for (const row of legacy) {
        const id = entryKey(scope, row.sale.submissionKey);
        const existing = await entries.get(id);
        if (existing && (isSealed(existing) || !sameSale(existing.sale, row.sale))) {
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
function sameStored(a: StoredSale | undefined, b: StoredSale | undefined): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
function isSealed(row: StoredSale): row is ProtectedStoredSale {
  return Object.prototype.hasOwnProperty.call(row, "sealed");
}
async function decodeRow(scope: OutboxScope, row: StoredSale, protectedScope: boolean): Promise<QueuedSale> {
  if (!row || typeof row.id !== "string" || row.scopeKey !== scopeKey(scope) ||
      typeof row.queuedAt !== "string") throw new Error(recoveryError);
  let item: unknown = row;
  if (isSealed(row)) {
    if (!protectedScope) throw new Error(recoveryError);
    const key = unlocked.get(scopeKey(scope));
    if (!key) throw new Error(lockedError);
    let parts: unknown;
    try { parts = JSON.parse(row.id); } catch { throw new Error(recoveryError); }
    if (!Array.isArray(parts) || parts.length !== 3 ||
        parts[0] !== scope.userId || parts[1] !== scope.companyId ||
        typeof parts[2] !== "string") throw new Error(recoveryError);
    try { item = await decryptQueuedSale(scope, parts[2], key, row.sealed); }
    catch { throw new Error(recoveryError); }
  } else if (protectedScope) {
    throw new Error("This encrypted offline queue contains a plaintext record. Stop and recover the record before sending sales.");
  }
  if (!valid(item)) throw new Error(recoveryError);
  const entry = item as QueuedSale;
  if (entryKey(scope, entry.sale.submissionKey) !== row.id ||
      entry.queuedAt !== row.queuedAt) throw new Error(recoveryError);
  return { sale: entry.sale, summary: entry.summary, queuedAt: entry.queuedAt,
    status: entry.status, ...(entry.error === undefined ? {} : {error:entry.error}) };
}
async function makeRow(scope: OutboxScope, item: QueuedSale): Promise<StoredSale> {
  const id = entryKey(scope, item.sale.submissionKey), sk = scopeKey(scope);
  if (await vaults.get(sk)) {
    const key = unlocked.get(sk);
    if (!key) throw new Error(lockedError);
    return {id,scopeKey:sk,queuedAt:item.queuedAt,
      sealed:await encryptQueuedSale(scope,item.sale.submissionKey,key,item)};
  }
  return {...item,id,scopeKey:sk};
}
async function prepare(scope: OutboxScope, storage: LegacyStorage | null): Promise<QueuedSale[]> {
  scopeIsValid(scope);
  await migrateLegacy(scope, storage);
  const bad = await quarantine.get(legacyKey(scope));
  if (bad) throw new Error("This account has unrecovered older queued sales. Do not clear browser storage; restore them before continuing.");
  const encrypted = !!(await vaults.get(scopeKey(scope)));
  if (encrypted && !unlocked.has(scopeKey(scope))) throw new Error(lockedError);
  const rows = await entries.where("scopeKey").equals(scopeKey(scope)).toArray();
  const decoded: QueuedSale[] = [];
  for (const row of rows) decoded.push(await decodeRow(scope,row,encrypted));
  return decoded.sort((a,b)=>a.queuedAt.localeCompare(b.queuedAt) ||
    a.sale.submissionKey.localeCompare(b.sale.submissionKey));
}
export async function readOutbox(
  scope: OutboxScope, legacyStorage: LegacyStorage | null = defaultLegacyStorage()
): Promise<QueuedSale[]> {
  return prepare(scope,legacyStorage);
}

/** An opt-in passphrase vault. Activation is limited to an EMPTY queue so
 * existing unencrypted pending sales cannot be lost or silently rewritten.
 * Users must settle/review every queued sale before opting in. The passphrase
 * and CryptoKey stay in this tab's memory, never in localStorage.
 */
export async function enableShopOutboxVault(
  scope: OutboxScope, passphrase: string,
  legacyStorage: LegacyStorage | null = defaultLegacyStorage()
): Promise<void> {
  const existing = await prepare(scope, legacyStorage);
  if (existing.length) throw new Error("Review or finish every queued sale before enabling encryption. No sales were changed.");
  const {descriptor,key}=await createShopVault(scope,passphrase);
  const sk=scopeKey(scope);
  await database.transaction("rw",entries,vaults,async()=>{
    if (await vaults.get(sk)) throw new Error("An offline vault already exists for this account and business.");
    if (await entries.where("scopeKey").equals(sk).count() !== 0)
      throw new Error("Pending sales were added while the vault was being configured. Nothing was changed.");
    await vaults.add({id:sk,descriptor});
  });
  unlocked.set(sk,key);
}
export async function unlockShopOutboxVault(scope: OutboxScope,passphrase:string): Promise<void> {
  scopeIsValid(scope);
  const row=await vaults.get(scopeKey(scope));
  if (!row) throw new Error("No protected offline queue is set up for this account and business.");
  const key=await unlockShopVault(scope,passphrase,row.descriptor);
  unlocked.set(scopeKey(scope),key);
  try { await prepare(scope,defaultLegacyStorage()); }
  catch(error) { unlocked.delete(scopeKey(scope)); throw error; }
}
export function lockShopOutboxVault(scope: OutboxScope):void {
  unlocked.delete(scopeKey(scope));
}
export async function getShopOutboxVaultStatus(scope:OutboxScope):Promise<{configured:boolean;unlocked:boolean}> {
  scopeIsValid(scope);
  const configured=!!(await vaults.get(scopeKey(scope)));
  return {configured,unlocked:configured && unlocked.has(scopeKey(scope))};
}
/** Portable encrypted-only queue recovery. Never includes a passphrase or
 * plaintext sale. A restore can only target the SAME authenticated account
 * and business, and only when that target has no queue or vault.
 * Export is a point-in-time snapshot: stop checkout while making a backup.
 */
export async function exportProtectedShopOutbox(scope: OutboxScope): Promise<string> {
  const decoded=await prepare(scope,defaultLegacyStorage());
  const sk=scopeKey(scope);
  const vault=await vaults.get(sk);
  if (!vault || !unlocked.has(sk))
    throw new Error("Unlock a protected offline queue before exporting recovery data.");
  const records=await entries.where("scopeKey").equals(sk).toArray();
  if (records.length!==decoded.length || records.some(row=>!isSealed(row)))
    throw new Error(recoveryError);
  for (const record of records) await decodeRow(scope,record,true);
  return JSON.stringify({
    kind:"tallybook.shared-shop.queue.recovery.v1",
    scope:[scope.userId,scope.companyId],
    descriptor:vault.descriptor,
    entries:records.sort((a,b)=>a.id.localeCompare(b.id)),
    exportedAt:new Date().toISOString()
  });
}
export async function importProtectedShopOutbox(
  scope:OutboxScope,backupText:string,passphrase:string,
  legacyStorage:LegacyStorage|null=defaultLegacyStorage()
):Promise<number> {
  scopeIsValid(scope);
  if(typeof backupText!=="string" || backupText.length>10*1024*1024)
    throw new Error("Encrypted recovery file is too large or invalid.");
  let parsed:unknown;
  try { parsed=JSON.parse(backupText); }
  catch { throw new Error("Encrypted recovery file is not valid JSON."); }
  if(!parsed || typeof parsed!=="object" || Array.isArray(parsed))
    throw new Error("Encrypted recovery file has an invalid structure.");
  const payload=parsed as Record<string,unknown>;
  if(Object.keys(payload).sort().join(",") !==
      ["kind","scope","descriptor","entries","exportedAt"].sort().join(",") ||
      payload.kind!=="tallybook.shared-shop.queue.recovery.v1" ||
      !Array.isArray(payload.scope) || payload.scope.length!==2 ||
      payload.scope[0]!==scope.userId || payload.scope[1]!==scope.companyId ||
      !Array.isArray(payload.entries) || payload.entries.length>500 ||
      typeof payload.exportedAt!=="string" ||
      !Number.isFinite(Date.parse(payload.exportedAt)))
    throw new Error("Recovery file is not for this signed-in account and business.");
  const descriptor=payload.descriptor as ShopVaultDescriptor;
  // Verify the supplied passphrase and every record BEFORE the write transaction.
  const key=await unlockShopVault(scope,passphrase,descriptor);
  const imports:ProtectedStoredSale[]=[];
  const ids=new Set<string>();
  for(const raw of payload.entries){
    if(!raw || typeof raw!=="object" || Array.isArray(raw))
      throw new Error("Recovery file contains an invalid encrypted sale.");
    const record=raw as Record<string,unknown>;
    if(Object.keys(record).sort().join(",")!==["id","scopeKey","queuedAt","sealed"].sort().join(",") ||
        typeof record.id!=="string" || record.scopeKey!==scopeKey(scope) ||
        typeof record.queuedAt!=="string" ||
        !Number.isFinite(Date.parse(record.queuedAt)) || ids.has(record.id))
      throw new Error("Recovery file has duplicate or invalid sale metadata.");
    let parts:unknown;
    try { parts=JSON.parse(record.id); } catch { throw new Error("Recovery file has an invalid submission key."); }
    if(!Array.isArray(parts) || parts.length!==3 ||
        parts[0]!==scope.userId || parts[1]!==scope.companyId ||
        typeof parts[2]!=="string")
      throw new Error("Recovery file is not for this account and business.");
    const sealed=record.sealed as ShopSealedPayload;
    let item:unknown;
    try{ item=await decryptQueuedSale(scope,parts[2],key,sealed); }
    catch{ throw new Error("Encrypted recovery sale could not be authenticated."); }
    if(!valid(item) || item.sale.submissionKey!==parts[2] ||
       item.queuedAt!==record.queuedAt)
      throw new Error("Encrypted recovery sale metadata disagrees with its contents.");
    ids.add(record.id);
    imports.push(record as unknown as ProtectedStoredSale);
  }
  if ((await prepare(scope,legacyStorage)).length)
    throw new Error("This device already has queued sales. Restore would risk replacing or duplicating them.");
  const sk=scopeKey(scope);
  await database.transaction("rw",entries,vaults,async()=>{
    if(await vaults.get(sk) || await entries.where("scopeKey").equals(sk).count())
      throw new Error("This device already has offline sales or encryption for this account; no data was changed.");
    await vaults.add({id:sk,descriptor});
    for(const row of imports) await entries.add(row);
  });
  unlocked.set(sk,key);
  return imports.length;
}

export type SendSale = (sale: SaleRequest) => Promise<ShopReceipt>;
export type SubmitResult =
  | { state: "recorded"; receipt: ShopReceipt }
  | { state: "queued" }
  | { state: "rejected"; error: string };

async function deliver(scope: OutboxScope, sale: SaleRequest, send: SendSale): Promise<SubmitResult> {
  const id = entryKey(scope, sale.submissionKey);
  const source = await entries.get(id);
  if (!source) throw new Error("The saved sale could not be found. Do not resend with a new key.");
  // Every network attempt reads the durable original; never substitute a
  // caller's changed cart for an existing idempotency key.
  const current = await decodeRow(scope,source,!!(await vaults.get(scopeKey(scope))));
  if (!sameSale(current.sale,sale)) throw new Error("This sale key was already used with different details.");
  try {
    const receipt = await send(sale);
    if (receipt.submissionKey !== sale.submissionKey)
      throw new Error("Server returned a receipt for another sale; keep the queued record for review.");
    await database.transaction("rw", entries, async () => {
      const latest=await entries.get(id);
      if (!sameStored(latest,source)) throw new Error("The pending sale changed during delivery; review before retrying.");
      await entries.delete(id);
    });
    return {state:"recorded",receipt};
  } catch(error) {
    if (error instanceof ShopRejectedError) {
      const updated=await makeRow(scope,{...current,status:"rejected",error:error.message});
      await database.transaction("rw",entries,async()=>{
        const latest=await entries.get(id);
        if (!sameStored(latest,source)) throw new Error("The pending sale changed during rejection; review it before retrying.");
        await entries.put(updated);
      });
      return {state:"rejected",error:error.message};
    }
    return {state:"queued"};
  }
}
/** Save one idempotency key in IndexedDB BEFORE any network send. */
export async function submitSale(
  scope: OutboxScope, sale: SaleRequest, summary: string, send: SendSale,
  legacyStorage: LegacyStorage | null = defaultLegacyStorage()
): Promise<SubmitResult> {
  const existing = await prepare(scope,legacyStorage);
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(sale.submissionKey))
    throw new Error("Sale submission key is invalid.");
  const id=entryKey(scope,sale.submissionKey);
  const earlier=existing.find(e=>e.sale.submissionKey===sale.submissionKey);
  if (earlier && !sameSale(earlier.sale,sale))
    throw new Error("This sale key was already used with different details.");
  if (earlier?.status === "rejected")
    throw new Error("This sale was rejected. Review it before attempting a new sale.");
  const prior=await entries.get(id);
  const item:QueuedSale={sale,summary,queuedAt:new Date().toISOString(),status:"pending"};
  const candidate=await makeRow(scope,item);
  let concurrent: StoredSale | undefined;
  await database.transaction("rw",entries,vaults,async()=>{
    const hasVault=!!(await vaults.get(scopeKey(scope)));
    if (hasVault !== isSealed(candidate))
      throw new Error("Offline queue security changed during checkout. Unlock and retry.");
    const current=await entries.get(id);
    if (current && (!prior || !sameStored(prior,current))) concurrent=current;
    else if (!current) await entries.add(candidate);
  });
  // Concurrent identical submissions are allowed only AFTER the already
  // committed record is independently decrypted and compared. Otherwise,
  // fail closed instead of reusing someone else's submission key.
  if (concurrent) {
    const queued=await decodeRow(scope,concurrent,!!(await vaults.get(scopeKey(scope))));
    if (!sameSale(queued.sale,sale))
      throw new Error("This sale key was already used with different details.");
    if (queued.status==="rejected")
      throw new Error("This sale was rejected. Review it before attempting a new sale.");
  }
  return deliver(scope,sale,send);
}
export async function flushOutbox(
  scope:OutboxScope,send:SendSale,
  legacyStorage:LegacyStorage|null=defaultLegacyStorage()
):Promise<SubmitResult[]> {
  const queued=(await prepare(scope,legacyStorage)).filter(e=>e.status==="pending");
  const results:SubmitResult[]=[];
  for (const row of queued) {
    const result=await deliver(scope,row.sale,send);
    results.push(result);
    if (result.state==="queued") break;
  }
  return results;
}
export async function dismissQueuedSale(
  scope:OutboxScope,submissionKey:string,
  legacyStorage:LegacyStorage|null=defaultLegacyStorage()
):Promise<void> {
  const decoded=await prepare(scope,legacyStorage);
  if (!decoded.some(row=>row.sale.submissionKey===submissionKey && row.status==="rejected")) return;
  const id=entryKey(scope,submissionKey);
  const prior=await entries.get(id);
  await database.transaction("rw",entries,async()=>{
    const current=await entries.get(id);
    if (!sameStored(prior,current)) throw new Error("The rejected sale changed during review; reload and try again.");
    if (current) await entries.delete(id);
  });
}
