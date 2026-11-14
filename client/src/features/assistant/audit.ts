/**
 * Tallybook Assistant — activity log.
 *
 * A device-local record of what the Assistant saved for the owner (or tried to), and when: the words they used, exactly what
 * the preview showed them, and the result. It lets the owner answer "what did the assistant record today?" and trace any entry
 * the Assistant made.
 *
 * Design choices:
 *  - Only confirmed saves and failed save attempts are logged. Questions, previews and cancellations are not (privacy, and growth).
 *  - Writing the log can never undo or block a saved transaction: failures here are swallowed (and noted in the console).
 *  - It lives in its own table, outside the business records and outside backups (a backup is the business's books, not a diary
 *    of chat activity). It is removed with the company when that company's data is cleared.
 *  - It keeps the newest MAX_AUDIT_ENTRIES_PER_COMPANY entries per company.
 *  - It is written just after the ledger write, not in the same database transaction, so a crash in between could lose one entry
 *    but never a sale, payment or stock change.
 */
import { nanoid } from "nanoid";
import type { TallybookDB } from "@/db/TallybookDB";
import type { ReplyDetail } from "./types";
import { selectAssistantAuditPruneIds } from "./assistantDataSafety.mjs";

export const AUDIT_ACTIONS = ["sale", "stock_receipt", "customer_payment", "create_customer", "create_supplier", "create_category", "create_product", "stock_count", "sale_reversal", "expense"] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AssistantAuditEntry {
  id: string;
  businessProfileId: string;
  /** ISO time the save was attempted. */
  createdAt: string;
  action: AuditAction;
  outcome: "saved" | "failed";
  /** What happened, in the words the owner saw (or the reason it failed). */
  summary: string;
  /** What the owner asked for, as they wrote or said it. */
  request: string;
  /** The preview rows the owner approved. */
  details: ReplyDetail[];
  /** The record that was created or changed, when there is one. */
  recordId?: string;
  /** Entries from one multi-line message share a batch id and keep their order. */
  batchId?: string;
  batchPosition?: number;
}

export const MAX_AUDIT_ENTRIES_PER_COMPANY = 1000;
const MAX_REQUEST_LENGTH = 300;

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  sale: "Sale", stock_receipt: "Stock received", customer_payment: "Customer payment", create_customer: "Customer added",
  create_supplier: "Supplier added", create_category: "Category added", create_product: "Product added", stock_count: "Stock count", sale_reversal: "Sale reversed", expense: "Expense recorded",
};

let sequence = 0;
/** Ids sort in the order entries were written (time, then a counter), so the log has a strict order even within one millisecond. */
const auditId = (now: Date) => `${now.getTime().toString(36).padStart(9, "0")}${(sequence = (sequence + 1) % 1_679_616).toString(36).padStart(4, "0")}${nanoid(8)}`;

export type NewAuditEntry = Omit<AssistantAuditEntry, "id" | "createdAt" | "request"> & { request?: string };

/** Saves one log entry. Never throws: the transaction it describes has already happened. */
export async function recordAudit(database: TallybookDB, entry: NewAuditEntry, now: Date): Promise<boolean> {
  try {
    const request = (entry.request ?? "").replace(new RegExp("\\p{Cc}", "gu"), " ").replace(/\s+/g, " ").trim().slice(0, MAX_REQUEST_LENGTH);
    // Append/prune in a single IndexedDB transaction. A failed prune must
    // roll back the append instead of leaving a partially updated activity log;
    // simultaneous writers are serialized by the object-store write lock.
    await database.transaction("rw", database.assistantAudit, async () => {
      await database.assistantAudit.add({ ...entry, request, id: auditId(now), createdAt: now.toISOString() });
      const scoped = await database.assistantAudit.where("businessProfileId").equals(entry.businessProfileId).toArray();
      const pruneIds = selectAssistantAuditPruneIds(scoped, MAX_AUDIT_ENTRIES_PER_COMPANY);
      if (pruneIds.length) await database.assistantAudit.bulkDelete(pruneIds);
    });
    return true;
  } catch (error) {
    console.warn("Tallybook Assistant: could not write the activity log.", error);
    return false;
  }
}

/** Entries for one company, newest first, optionally within [since, until). */
export async function listAudit(database: TallybookDB, companyId: string, range: { since?: Date; until?: Date; limit?: number } = {}): Promise<AssistantAuditEntry[]> {
  const entries = await database.assistantAudit.where("businessProfileId").equals(companyId).toArray();
  return entries
    .filter((entry) => (!range.since || new Date(entry.createdAt) >= range.since) && (!range.until || new Date(entry.createdAt) < range.until))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
    .slice(0, range.limit ?? entries.length);
}
