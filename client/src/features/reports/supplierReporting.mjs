import { reconcileSupplierPayables } from '../purchases/supplierPayables.mjs';

const validCurrency = value => typeof value === 'string' && /^[A-Z]{3}$/.test(value);
const safeNumber = value => Number.isSafeInteger(value) && value >= 0;
const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
function add(map, currency, amount) {
  const result = (map.get(currency) ?? 0n) + BigInt(amount);
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Supplier reporting exceeds safe monetary precision.');
  map.set(currency, result);
}
function rows(map, field) {
  return [...map].map(([currency, amount]) => ({ currency, [field]: Number(amount) }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

/**
 * Independently reconstruct PERIOD supplier tender outflows and AS-OF explicitly
 * recognized liabilities from immutable purchases and events. Supplier credits
 * reduce a liability but do not create a cash outflow. Unrecognized purchases
 * are UNKNOWN, never assumed paid. No historical currency is invented.
 *
 * Chronological reordering is necessary because Dexie `toArray()` returns key
 * order, not creation order. Earlier settlements cannot be made valid by that
 * reordering. Equal-timestamp events place recognition first, since timestamps
 * alone have no sub-millisecond order evidence.
 */
export function reconcileSupplierFinancialReport(purchases, entries, range) {
  if (!Array.isArray(purchases) || !Array.isArray(entries) ||
      !(range?.start instanceof Date) || !(range?.end instanceof Date) ||
      !Number.isFinite(range.start.getTime()) || !Number.isFinite(range.end.getTime()) ||
      range.end <= range.start) throw new Error('Supplier report requires a valid source snapshot and period.');
  const purchaseIds = new Set();
  const expectedCompany = purchases[0]?.businessProfileId;
  for (const p of purchases) {
    if (!p || typeof p.id !== 'string' || !p.id || purchaseIds.has(p.id) ||
        typeof p.businessProfileId !== 'string' || !p.businessProfileId ||
        typeof p.supplierId !== 'string' || !p.supplierId ||
        p.businessProfileId !== expectedCompany ||
        !safeNumber(p.totalCostMinor) || p.totalCostMinor === 0 ||
        (p.currency !== undefined && !validCurrency(p.currency))) {
      throw new Error('Supplier report has duplicate, invalid or unsupported purchase evidence.');
    }
    purchaseIds.add(p.id);
  }
  const byId = new Map(purchases.map(p => [p.id, p]));
  // Entry-level identities, amounts, timestamps and per-purchase constraints are
  // also independently checked in reconcileSupplierPayables.
  for (const e of entries) {
    const p = byId.get(e?.purchaseId);
    if (!p || !validTime(e.createdAt) || !validCurrency(e.currency) ||
        e.currency !== p.currency || e.businessProfileId !== p.businessProfileId ||
        e.supplierId !== p.supplierId) {
      throw new Error('Supplier report contains orphan, foreign or invalid currency/date evidence.');
    }
  }
  const ordered = [...entries].sort((a, b) =>
    Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
    (a.kind === 'recognition' ? -1 : b.kind === 'recognition' ? 1 : 0) ||
    String(a.id).localeCompare(String(b.id)));
  const reconciled = reconcileSupplierPayables(purchases, ordered);
  // Recalculate the evidence conservation independently from grouped balances.
  const knownDue = new Map(), recognized = new Map(), paid = new Map(), credited = new Map();
  for (let i = 0; i < purchases.length; i++) {
    const p = purchases[i], state = reconciled.results[i];
    if (state.status === 'unknown') continue;
    if (state.recognizedMinor !== state.paidMinor + state.creditedMinor + state.outstandingMinor) {
      throw new Error('Supplier report liability components do not conserve their recognized amount.');
    }
    add(knownDue, p.currency, state.outstandingMinor);
    add(recognized, p.currency, state.recognizedMinor);
    add(paid, p.currency, state.paidMinor);
    add(credited, p.currency, state.creditedMinor);
  }
  for (const item of reconciled.outstandingByCurrency) {
    if (Number(knownDue.get(item.currency) ?? 0n) !== item.amountMinor)
      throw new Error('Supplier report balance differs from the payable ledger.');
  }
  const outgoing = new Map();
  for (const entry of ordered) {
    const when = Date.parse(entry.createdAt);
    if (entry.kind === 'payment' && when >= range.start.getTime() && when < range.end.getTime()) {
      add(outgoing, entry.currency, entry.amountMinor);
    }
  }
  return {
    unknownPurchases: reconciled.unknownPurchases,
    complete: reconciled.complete,
    outstandingByCurrency: reconciled.outstandingByCurrency,
    recognizedByCurrency: rows(recognized, 'amountMinor'),
    paidToDateByCurrency: rows(paid, 'amountMinor'),
    creditedToDateByCurrency: rows(credited, 'amountMinor'),
    periodPaymentsByCurrency: rows(outgoing, 'amountMinor'),
  };
}
