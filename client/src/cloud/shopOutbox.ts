/**
 * Write-ahead queue for shared-shop sales.
 *
 * A sale is saved here BEFORE it is sent, under its submission key. If the
 * connection drops, the tab closes or the response is lost, the same request
 * is re-sent later with the same key, and the server's idempotency check
 * returns the original receipt instead of posting twice. Only a definite
 * server decision removes an entry (accepted) or parks it for review
 * (rejected, e.g. not enough stock or access removed).
 */
import { ShopRejectedError, type SaleRequest, type ShopReceipt } from "./shopClient";

export interface QueuedSale {
  sale: SaleRequest;
  /** Display-only cart snapshot so the attendant can recognise the sale. */
  summary: string;
  queuedAt: string;
  status: "pending" | "rejected";
  error?: string;
}
export interface OutboxScope { userId: string; companyId: string }
type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

const keyFor = ({ userId, companyId }: OutboxScope) => `tallybook.shop.outbox.v1:${userId}:${companyId}`;

function defaultStorage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

export function readOutbox(scope: OutboxScope, storage: Storage | null = defaultStorage()): QueuedSale[] {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(keyFor(scope)) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isQueuedSale) : [];
  } catch { return []; }
}

function writeOutbox(scope: OutboxScope, entries: QueuedSale[], storage: Storage | null) {
  if (!storage) throw new Error("This browser can't save sales while offline. Keep this page open until the sale is confirmed.");
  storage.setItem(keyFor(scope), JSON.stringify(entries));
}

function isQueuedSale(value: unknown): value is QueuedSale {
  const entry = value as QueuedSale;
  return !!entry && typeof entry === "object" && typeof entry.sale?.submissionKey === "string" &&
    (entry.status === "pending" || entry.status === "rejected");
}

function update(scope: OutboxScope, storage: Storage | null, change: (entries: QueuedSale[]) => QueuedSale[]) {
  writeOutbox(scope, change(readOutbox(scope, storage)), storage);
}

export type SendSale = (sale: SaleRequest) => Promise<ShopReceipt>;
export type SubmitResult =
  | { state: "recorded"; receipt: ShopReceipt }
  | { state: "queued" }
  | { state: "rejected"; error: string };

/** Save first, then send. Never loses a sale the attendant pressed "Record" on. */
export async function submitSale(scope: OutboxScope, sale: SaleRequest, summary: string, send: SendSale,
  storage: Storage | null = defaultStorage()): Promise<SubmitResult> {
  update(scope, storage, entries => entries.some(e => e.sale.submissionKey === sale.submissionKey)
    ? entries
    : [...entries, { sale, summary, queuedAt: new Date().toISOString(), status: "pending" }]);
  return deliver(scope, sale, send, storage);
}

async function deliver(scope: OutboxScope, sale: SaleRequest, send: SendSale, storage: Storage | null): Promise<SubmitResult> {
  try {
    const receipt = await send(sale);
    update(scope, storage, entries => entries.filter(e => e.sale.submissionKey !== sale.submissionKey));
    return { state: "recorded", receipt };
  } catch (error) {
    if (error instanceof ShopRejectedError) {
      update(scope, storage, entries => entries.map(e => e.sale.submissionKey === sale.submissionKey
        ? { ...e, status: "rejected", error: error.message } : e));
      return { state: "rejected", error: error.message };
    }
    return { state: "queued" };
  }
}

/** Re-send every pending sale in the order it was recorded. Stops at the first connection failure. */
export async function flushOutbox(scope: OutboxScope, send: SendSale, storage: Storage | null = defaultStorage()) {
  const results: SubmitResult[] = [];
  for (const entry of readOutbox(scope, storage).filter(e => e.status === "pending")) {
    const result = await deliver(scope, entry.sale, send, storage);
    results.push(result);
    if (result.state === "queued") break;
  }
  return results;
}

export function dismissQueuedSale(scope: OutboxScope, submissionKey: string, storage: Storage | null = defaultStorage()) {
  update(scope, storage, entries => entries.filter(e => !(e.sale.submissionKey === submissionKey && e.status === "rejected")));
}
