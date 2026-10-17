/**
 * Supplier liability evidence, denominated in the recorded purchase's minor units.
 * A stock receipt is NOT evidence of unpaid debt. Only an explicit recognition
 * event establishes a payable; missing recognition means UNKNOWN, not zero.
 * Payments are offline, manually attested events, not provider confirmations.
 */
const MAX_MINOR = Number.MAX_SAFE_INTEGER;
function validAmount(amount) { return Number.isSafeInteger(amount) && amount > 0; }
function identity(value) { return typeof value === 'string' && value.length > 0 && value.length <= 100; }
const currency = value => typeof value === 'string' && /^[A-Z]{3}$/.test(value);
const timestamp = value => typeof value === 'string' &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value) &&
  Number.isFinite(Date.parse(value));

/** Build the as-of balance for exactly one company-scoped purchase. */
export function reconcileSupplierPayable(purchase, entries) {
  if (!purchase || !identity(purchase.id) || !identity(purchase.businessProfileId) ||
      !identity(purchase.supplierId) || !validAmount(purchase.totalCostMinor) ||
      !currency(purchase.currency) || !timestamp(purchase.createdAt) || !Array.isArray(entries)) {
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
        row.supplierId !== purchase.supplierId || row.currency !== purchase.currency || !validAmount(row.amountMinor) ||
        !timestamp(row.createdAt) || Date.parse(row.createdAt) < Date.parse(purchase.createdAt) ||
        (row.reference !== undefined && (typeof row.reference !== 'string' || row.reference.length > 120))) {
      throw new Error('Supplier payable contains a duplicate, foreign or malformed entry.');
    }
    seenIds.add(row.id); seenKeys.add(row.submissionKey);
    if (row.kind === 'recognition') {
      if (recognized || row.amountMinor !== purchase.totalCostMinor ||
          row.method !== undefined || row.reference !== undefined) {
        throw new Error('Supplier payable has invalid or repeated recognition.');
      }
      recognized = true;
    } else if (row.kind === 'payment' || row.kind === 'credit') {
      if (!recognized) throw new Error('Supplier settlement lacks an explicit liability recognition.');
      if (row.kind === 'payment' && !['cash', 'bank', 'card', 'mobile', 'other'].includes(row.method)) {
        throw new Error('Supplier payment has no valid tender method.');
      }
      if (row.kind === 'credit' && row.method !== undefined) throw new Error('Supplier credit must not claim a tender method.');
      if (row.kind === 'credit' && row.reference === '') throw new Error('Supplier credit reference may not be empty.');
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
  const outstandingByCurrency = [...balances].map(([currency, amountMinor]) => ({ currency, amountMinor })).sort((a,b) => a.currency.localeCompare(b.currency));
  // Supplier-level view is derived from already validated, exact purchase
  // balances. Do not merge currencies or treat unrecognized invoices as zero.
  const supplierMap = new Map();
  for (let i=0;i<purchases.length;i++) {
    const purchase=purchases[i],result=results[i];
    let summary=supplierMap.get(purchase.supplierId);
    if(!summary) {
      summary={supplierId:purchase.supplierId,unknownPurchases:0,
        purchaseCount:0,byCurrency:new Map()};
      supplierMap.set(purchase.supplierId,summary);
    }
    summary.purchaseCount++;
    if(result.status==='unknown') {summary.unknownPurchases++;continue;}
    const old=summary.byCurrency.get(purchase.currency)??0;
    const next=old+result.outstandingMinor;
    if(!Number.isSafeInteger(next)||next<0)
      throw new Error('Supplier-level liability exceeds safe monetary limits.');
    summary.byCurrency.set(purchase.currency,next);
  }
  const outstandingBySupplier=[...supplierMap.values()].map(row=>({
    supplierId:row.supplierId,purchaseCount:row.purchaseCount,
    unknownPurchases:row.unknownPurchases,complete:row.unknownPurchases===0,
    outstandingByCurrency:[...row.byCurrency].map(([currency,amountMinor])=>({
      currency,amountMinor
    })).sort((a,b)=>a.currency.localeCompare(b.currency))
  })).sort((a,b)=>a.supplierId.localeCompare(b.supplierId));
  return { outstandingMinor: outstandingByCurrency.length === 1 ? outstandingByCurrency[0].amountMinor : null, outstandingByCurrency, outstandingBySupplier, unknownPurchases, complete: unknownPurchases === 0, results };
}
