/**
 * Run 13 proposed store-transfer journal reducer.
 *
 * Read-only validation of an ordered, append-only *proposed* transfer ledger.
 * It does not post inventory, attest physical delivery, or enable checkout.
 * A request is not evidence that a transfer happened.
 */
import { reconcileStoreStockPlan } from "./run13StockConservation.mjs";

const validId = v => typeof v === "string" && v.length > 0 && v.length <= 200;
const validQuantity = v => Number.isSafeInteger(v) && v > 0 && v <= 9_999_999;
const fail = message => { throw new Error(message); };

export function auditProposedStoreTransferJournal({
  companyId, products, stores, allocations, journal
}) {
  if (!validId(companyId) || !Array.isArray(journal)) fail("Invalid store transfer journal.");
  const seenId = new Set();
  const seenSubmission = new Set();
  const ordered = [];
  for (const event of journal) {
    if (!event || event.businessProfileId !== companyId ||
        !validId(event.id) || !validId(event.submissionKey) ||
        !validId(event.requestId) || !validId(event.authorizedByStaffId) ||
        !validId(event.sourceStoreId) || !validId(event.destinationStoreId) ||
        !validId(event.productId) || !validQuantity(event.quantity) ||
        !Number.isFinite(Date.parse(event.createdAt)) ||
        new Date(event.createdAt).toISOString() !== event.createdAt ||
        event.sourceStoreId === event.destinationStoreId ||
        event.kind !== "proposed-transfer") fail("Invalid proposed transfer event.");
    if (seenId.has(event.id) || seenSubmission.has(event.submissionKey))
      fail("Duplicate proposed transfer identity or submission key.");
    seenId.add(event.id);
    seenSubmission.add(event.submissionKey);
    ordered.push({
      id: event.id,
      businessProfileId: event.businessProfileId,
      sourceStoreId: event.sourceStoreId,
      destinationStoreId: event.destinationStoreId,
      productId: event.productId,
      quantity: event.quantity,
    });
  }
  const reconciliation = reconcileStoreStockPlan({
    companyId, products, stores, allocations, transfers: ordered,
  });
  return {
    ...reconciliation,
    journalEntryCount: journal.length,
    verifiedPhysicalDelivery: false,
    financialPostingPerformed: false,
    authoritative: false,
  };
}

/** Exact replay identity only: never treat a changed intent as idempotent. */
export function compareProposedTransferIntent(saved, incoming) {
  const fields = [
    "businessProfileId", "submissionKey", "requestId",
    "sourceStoreId", "destinationStoreId", "productId", "quantity"
  ];
  if (!saved || !incoming || fields.some(field => saved[field] !== incoming[field]))
    fail("Proposed transfer submission key was reused with different intent.");
  return true;
}
