/**
 * Pure, deterministic allocation of a returned subset of an original FIFO sale issue.
 * This does not post inventory or authorize a refund: a posting caller must write the
 * stock movement, cost event, batch disposition and financial return atomically.
 * Restorations consume the original issue's receipt allocations in fixed order.
 */
const safePositive = (value) => Number.isSafeInteger(value) && value > 0;
const sameCost = (a, b) => a === b;
const validId = (value) => typeof value === 'string' && value.trim().length > 0 && value.length <= 140;

function originalIssue(original) {
  if (!original || original.kind !== 'issue' || !validId(original.id) ||
      !validId(original.businessProfileId) || !validId(original.productId) ||
      !Number.isSafeInteger(original.quantityDelta) || original.quantityDelta >= 0 ||
      !Array.isArray(original.allocations) || !original.allocations.length) {
    throw new Error('Original FIFO sale issue is unavailable or malformed.');
  }
  const ids = new Set();
  let quantity = 0n;
  for (const row of original.allocations) {
    if (!validId(row?.receiptId) || ids.has(row.receiptId) || !safePositive(row.quantity) ||
        (row.unitCostMinor !== undefined && (!Number.isSafeInteger(row.unitCostMinor) || row.unitCostMinor < 0))) {
      throw new Error('Original FIFO receipt allocations are malformed.');
    }
    ids.add(row.receiptId);
    quantity += BigInt(row.quantity);
  }
  if (quantity !== BigInt(-original.quantityDelta)) throw new Error('Original FIFO issue quantity does not reconcile.');
  return quantity;
}

/** Slice original allocation receipts without manufacturing a new cost/receipt layer. */
function slice(original, consumed, units) {
  const result = [];
  let position = 0n;
  const end = consumed + units;
  for (const allocation of original.allocations) {
    const next = position + BigInt(allocation.quantity);
    const taken = (next < end ? next : end) - (position > consumed ? position : consumed);
    if (taken > 0n) result.push({ receiptId: allocation.receiptId, quantity: Number(taken),
      ...(allocation.unitCostMinor === undefined ? {} : { unitCostMinor: allocation.unitCostMinor }) });
    position = next;
  }
  return result;
}

function equalAllocations(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length && actual.every((row, i) =>
    row?.receiptId === expected[i].receiptId && row.quantity === expected[i].quantity &&
    sameCost(row.unitCostMinor, expected[i].unitCostMinor));
}

/**
 * Prior reversal events MUST be in original posting order. Corruption, over-restoration,
 * cross-company/sale cost attribution, and altered allocation costs all fail closed.
 * Returns deterministic allocations for the next requested number of units.
 */
export function planPartialCostRestoration(original, priorReversals, returnQuantity) {
  const originalQuantity = originalIssue(original);
  if (!Array.isArray(priorReversals)) throw new Error('Prior inventory restorations are unavailable.');
  const seen = new Set();
  const sources = new Set();
  let consumed = 0n;
  for (const previous of priorReversals) {
    if (previous?.kind !== 'reversal' || previous.reversesEventId !== original.id ||
        previous.businessProfileId !== original.businessProfileId || previous.productId !== original.productId ||
        (original.saleId !== undefined && previous.saleId !== original.saleId) ||
        !validId(previous.id) || seen.has(previous.id) || !validId(previous.sourceId) ||
        sources.has(previous.sourceId) || !safePositive(previous.quantityDelta)) {
      throw new Error('Saved FIFO restoration is missing, duplicated or belongs to another issue.');
    }
    seen.add(previous.id);
    sources.add(previous.sourceId);
    const units = BigInt(previous.quantityDelta);
    if (consumed + units > originalQuantity || !equalAllocations(previous.allocations, slice(original, consumed, units))) {
      throw new Error('Saved FIFO restoration exceeds or alters the original allocations.');
    }
    consumed += units;
  }
  if (!safePositive(returnQuantity) || consumed + BigInt(returnQuantity) > originalQuantity) {
    throw new Error('Partial cost restoration exceeds the original remaining issue quantity.');
  }
  return {
    quantityDelta: returnQuantity,
    allocations: slice(original, consumed, BigInt(returnQuantity)),
    previouslyRestoredQuantity: Number(consumed),
    remainingQuantity: Number(originalQuantity - consumed - BigInt(returnQuantity)),
  };
}

/** Validate persisted event using the same deterministic, original-issue allocation rules. */
export function assertPartialCostRestoration(original, priorReversals, event) {
  const expected = planPartialCostRestoration(original, priorReversals, event?.quantityDelta);
  if (!validId(event?.id) || !validId(event?.sourceId) ||
      priorReversals.some(previous => previous.id === event.id || previous.sourceId === event.sourceId) ||
      event?.kind !== 'reversal' || event.reversesEventId !== original.id ||
      event.businessProfileId !== original.businessProfileId || event.productId !== original.productId ||
      (original.saleId !== undefined && event.saleId !== original.saleId) ||
      !equalAllocations(event.allocations, expected.allocations)) {
    throw new Error('Inventory restoration cannot change original FIFO cost allocations.');
  }
  return expected;
}
