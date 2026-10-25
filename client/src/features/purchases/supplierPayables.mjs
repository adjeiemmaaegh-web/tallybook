/**
 * Supplier liability evidence, denominated in the recorded purchase's minor units.
 * A stock receipt is NOT evidence of unpaid debt. Only an explicit recognition
 * event establishes a payable; missing recognition means UNKNOWN, not zero.
 * Payments are offline, manually attested events, not provider confirmations.
 */
const MAX_MINOR = Number.MAX_SAFE_INTEGER;
function validAmount(amount) { return Number.isSafeInteger(amount) && amount > 0; }
function identity(value) { return typeof value === 'string' && value.length > 0 && value.length <= 100; }

/** Build the as-of balance for exactly one company-scoped purchase. */
export function reconcileSupplierPayable(purchase, entries) {
  if (!purchase || !identity(purchase.id) || !identity(purchase.businessProfileId) ||
      !identity(purchase.supplierId) || !validAmount(purchase.totalCostMinor) || !Array.isArray(entries)) {
    throw new Error('Supplier purchase requires reconciliation.');
  }
  const seenIds = new Set();
  const seenKeys = new Set();
  let recognized = false, settledMinor = 0, paidMinor = 0, creditedMinor = 0;
  // IndexedDB index reads use primary-key order, not event time. Recognition
  // precedes settlements at the same millisecond; older settlements still fail.
  const ordered = [...entries].sort((a, b) =>
    Date.parse(a?.createdAt) - Date.parse(b?.createdAt) ||
    Number(b?.kind === 'recognition') - Number(a?.kind === 'recognition'));
  for (const row of ordered) {
    if (!row || !identity(row.id) || !identity(row.submissionKey) || seenIds.has(row.id) || seenKeys.has(row.submissionKey) ||
        row.businessProfileId !== purchase.businessProfileId || row.purchaseId !== purchase.id ||
        row.supplierId !== purchase.supplierId || !identity(purchase.currency) || row.currency !== purchase.currency || !validAmount(row.amountMinor) ||
        typeof row.createdAt !== 'string' || !Number.isFinite(Date.parse(row.createdAt))) {
      throw new Error('Supplier payable contains a duplicate, foreign or malformed entry.');
    }
    seenIds.add(row.id); seenKeys.add(row.submissionKey);
    if (row.kind === 'recognition') {
      if (recognized || row.amountMinor !== purchase.totalCostMinor || row.method !== undefined) {
        throw new Error('Supplier payable has invalid or repeated recognition.');
      }
      recognized = true;
    } else if (row.kind === 'payment' || row.kind === 'credit') {
      if (!recognized) throw new Error('Supplier settlement lacks an explicit liability recognition.');
      if (row.kind === 'payment' && !['cash', 'bank', 'card', 'mobile', 'other'].includes(row.method)) {
        throw new Error('Supplier payment has no valid tender method.');
      }
      if (row.kind === 'credit' && row.method !== undefined) throw new Error('Supplier credit must not claim a tender method.');
      if (row.amountMinor > MAX_MINOR - settledMinor) throw new Error('Supplier ledger exceeds safe monetary limits.');
      settledMinor += row.amountMinor;
      if (settledMinor > purchase.totalCostMinor) throw new Error('Supplier settlement exceeds the recognized liability.');
      if (row.kind === 'payment') paidMinor += row.amountMinor;
      else creditedMinor += row.amountMinor;
    } else {
      throw new Error('Supplier payable contains an unsupported entry type.');
    }
  }
  if (!recognized) return { status: 'unknown', recognizedMinor: null, paidMinor: null, creditedMinor: null, outstandingMinor: null };
  return { status: settledMinor === purchase.totalCostMinor ? 'settled' : 'outstanding', recognizedMinor: purchase.totalCostMinor, paidMinor, creditedMinor, outstandingMinor: purchase.totalCostMinor - settledMinor };
}

/** Reconstruct company-wide explicit liabilities; unrecognized receipts stay unknown. */
export function reconcileSupplierPayables(purchases, entries) {
  if (!Array.isArray(purchases) || !Array.isArray(entries)) throw new Error('Supplier payable snapshot unavailable.');
  const purchasesById = new Map();
  for (const purchase of purchases) {
    if (!identity(purchase?.id) || purchasesById.has(purchase.id)) throw new Error('Supplier payable snapshot has duplicate purchases.');
    purchasesById.set(purchase.id, purchase);
  }
  const byPurchase = new Map();
  const allIds = new Set(), allKeys = new Set();
  for (const entry of entries) {
    if (!identity(entry?.id) || !identity(entry?.submissionKey) || allIds.has(entry.id) || allKeys.has(entry.submissionKey)) {
      throw new Error('Supplier payable snapshot has duplicate event identities.');
    }
    allIds.add(entry.id); allKeys.add(entry.submissionKey);
    if (!purchasesById.has(entry.purchaseId)) throw new Error('Supplier payable event refers to a missing purchase.');
    const group=byPurchase.get(entry.purchaseId)??[];
    group.push(entry);
    byPurchase.set(entry.purchaseId,group);
  }
  let unknownPurchases = 0;
  const balances = new Map();
  const results = purchases.map(purchase => {
    const result = reconcileSupplierPayable(purchase, byPurchase.get(purchase.id) ?? []);
    if (result.status === 'unknown') unknownPurchases++;
    else {
      const total = (balances.get(purchase.currency) ?? 0) + result.outstandingMinor;
      if (!Number.isSafeInteger(total)) throw new Error('Supplier payable totals exceed safe integer precision.');
      balances.set(purchase.currency, total);
    }
    return { purchaseId: purchase.id, ...result };
  });
  const outstandingByCurrency = [...balances].filter(([, amountMinor]) => amountMinor !== 0).map(([currency, amountMinor]) => ({ currency, amountMinor })).sort((a,b) => a.currency.localeCompare(b.currency));
  return { outstandingMinor: outstandingByCurrency.length === 1 ? outstandingByCurrency[0].amountMinor : null, outstandingByCurrency, unknownPurchases, complete: unknownPurchases === 0, results };
}
