/**
 * Write-ahead queue for shared-shop sales (browser binding).
 *
 * A sale is sealed and saved on this device BEFORE it is sent, under its
 * submission key. If the connection drops, the tab closes or the response is
 * lost, the sale is reconciled against the server and re-sent with the same
 * key, so it is never lost and never posted twice. Only a definite server
 * decision removes an entry (accepted) or parks it (rejected, e.g. not enough
 * stock or access removed). The mechanics live in outboxCore.ts.
 */
import {
  bestAvailableLocks, createOutbox, type OutboxScope, type QueuedEntry, type SubmitResult as CoreSubmitResult,
} from "./outboxCore";
import { indexedDbBackend, deviceSealer, secureStorageAvailable, SecureStorageUnavailableError } from "./secureStorage";
import { ShopRejectedError, listShopSales, type SaleRequest, type ShopReceipt } from "./shopClient";

export type { OutboxScope } from "./outboxCore";
export type QueuedSale = QueuedEntry<SaleRequest> & { id: string };
export type SendSale = (sale: SaleRequest) => Promise<ShopReceipt>;
export type SubmitResult = CoreSubmitResult<ShopReceipt>;

const legacyKey = ({ userId, companyId }: OutboxScope) => `tallybook.shop.outbox.v1:${userId}:${companyId}`;

async function outboxFor(scope: OutboxScope) {
  if (!secureStorageAvailable()) throw new SecureStorageUnavailableError();
  const outbox = createOutbox<SaleRequest, ShopReceipt>({
    backend: indexedDbBackend(),
    sealer: await deviceSealer(),
    lock: bestAvailableLocks(),
    isRejected: error => error instanceof ShopRejectedError,
    // The server's own idempotency still protects us if this window misses an old sale.
    lookupReceipt: async sale => (await listShopSales(scope.companyId)).find(r => r.submissionKey === sale.submissionKey) ?? null,
  });
  const key = legacyKey(scope);
  let migrated = migrations.get(key);
  if (!migrated) {
    migrated = outbox.migrateLegacy(scope, window.localStorage, key)
      .then(() => undefined)
      .finally(() => migrations.delete(key));
    migrations.set(key, migrated);
  }
  await migrated;
  return outbox;
}
const migrations = new Map<string, Promise<void>>();

export async function readOutbox(scope: OutboxScope): Promise<QueuedSale[]> {
  try { return await (await outboxFor(scope)).read(scope); } catch { return []; }
}

/** Save first, then send. Never loses a sale the attendant pressed "Record" on. */
export async function submitSale(scope: OutboxScope, sale: SaleRequest, summary: string, send: SendSale): Promise<SubmitResult> {
  return (await outboxFor(scope)).submit(scope, sale, summary, send);
}

/** Re-send every pending sale in the order it was recorded. Stops at the first connection failure. */
export async function flushOutbox(scope: OutboxScope, send: SendSale): Promise<SubmitResult[]> {
  return (await outboxFor(scope)).flush(scope, send);
}

export async function dismissQueuedSale(scope: OutboxScope, submissionKey: string, options: { force?: boolean } = {}) {
  return (await outboxFor(scope)).dismiss(scope, submissionKey, options);
}
