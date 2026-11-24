import { planPartialSaleReturn } from './partialReturnPlan.mjs';
import { normalizeSplitTenders } from './splitTender.mjs';

const validId = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 140;
const money = value => Number.isSafeInteger(value) && value >= 0;
/**
 * Single-tender sales may be refunded back to their ORIGINAL tender only. Mobile
 * Money and card refunds are manual, staff-confirmed local evidence: they are
 * never provider-confirmed settlement. Credit, wallet, split and customer sales
 * stay outside this lane until their liability postings exist.
 */
export const MANUAL_REFUND_TENDERS = Object.freeze(['cash','mobile','card']);
/**
 * 'credit' = NO money leaves the till: the return only reduces the customer's
 * recorded receivable on THIS sale (a credit note). Debt is reduced first;
 * only the remainder (if any) is refunded through the original single tender.
 */
/** 'wallet' = the refund of a WALLET-PAID sale goes back into the customer's prepaid wallet (a liability): no drawer cash, no provider money. */
export const RETURN_SETTLEMENT_METHODS = Object.freeze([...MANUAL_REFUND_TENDERS,'credit','wallet','split']);
/** 'split' = a split-tender sale refunded through its ORIGINAL tenders: entry.legs lists the amount returned through each. */
const LEG_METHODS = Object.freeze(['cash','mobile','card']);
const legsValid = entry => {
  if (entry.refundMethod !== 'split') return entry.legs === undefined;
  if (!Array.isArray(entry.legs) || entry.legs.length < 1 || entry.legs.length > 3) return false;
  const seen = new Set(); let sum = 0n;
  for (const leg of entry.legs) {
    if (!leg || typeof leg !== 'object' || Object.keys(leg).some(k => k !== 'method' && k !== 'amountMinor') ||
        !LEG_METHODS.includes(leg.method) || seen.has(leg.method) || !Number.isSafeInteger(leg.amountMinor) || leg.amountMinor <= 0) return false;
    seen.add(leg.method); sum += BigInt(leg.amountMinor);
  }
  return sum === BigInt(entry.refundedMinor);
};
const expectedEvidence = entry =>
  (entry.refundMethod === 'cash' || entry.refundMethod === 'credit' || entry.refundMethod === 'wallet') ? undefined
  : entry.refundMethod === 'split' ? (entry.legs?.some(leg => leg.method !== 'cash') ? 'staff_confirmed_manual_unverified' : undefined)
  : 'staff_confirmed_manual_unverified';
/** Loyalty evidence on a return: what the sale earned, what was taken back, and any part the customer had already spent. */
const loyaltyValid = entry => {
  const l = entry.loyalty;
  if (l === undefined) return true;
  if (!l || typeof l !== 'object' || Object.keys(l).sort().join() !== 'earnedPoints,pointsReversed,pointsShortfall,policy' ||
      !['reverse','keep'].includes(l.policy) || entry.customerId === undefined) return false;
  const ok = v => Number.isSafeInteger(v) && v >= 0;
  return ok(l.earnedPoints) && l.earnedPoints > 0 && ok(l.pointsReversed) && ok(l.pointsShortfall) &&
    l.pointsReversed + l.pointsShortfall <= l.earnedPoints && (l.policy !== 'keep' || (l.pointsReversed === 0 && l.pointsShortfall === 0));
};

/**
 * Independently validate the append-only, cash-only return journal. This is an
 * intentionally restricted first posting lane: no customer, wallet, points,
 * provider settlement, credit, money-only returns, batches or services.
 * Returning cash is a PHYSICAL action the authorized cashier confirms; posting
 * here records that completed local action, not an external refund promise.
 */
/** Batch-tracked lines must say which source batches got the units back; never more per batch than it supplied to the line. */
function batchRestorationsValid(originalLine, row, earlierReturns) {
  const allocations = originalLine.batchAllocations ?? [];
  if (!allocations.length) { if (row.batchRestorations !== undefined) throw new Error('Cash return restores batches the original line never used.'); return; }
  const r = row.batchRestorations;
  if (!Array.isArray(r) || r.length === 0 || new Set(r.map(b => b?.batchId)).size !== r.length ||
      r.some(b => !b || Object.keys(b).sort().join(',') !== 'batchId,quantity' || !validId(b.batchId) || !Number.isSafeInteger(b.quantity) || b.quantity <= 0) ||
      r.reduce((n, b) => n + b.quantity, 0) !== row.quantity) throw new Error('Cash return batch restorations are missing, malformed or do not add up.');
  for (const b of r) {
    const a = allocations.find(x => x.batchId === b.batchId);
    const before = earlierReturns.flatMap(e => e.lines).filter(l => l.saleLineId === row.saleLineId)
      .flatMap(l => l.batchRestorations ?? []).filter(x => x.batchId === b.batchId).reduce((n, x) => n + x.quantity, 0);
    if (!a || before + b.quantity > a.quantity) throw new Error('Cash return restores more to a batch than that batch supplied to the line.');
  }
}

export function reconcileCashPartialReturns(sales, saleLines, payments, returns, fullReversals = []) {
  if (![sales,saleLines,payments,returns,fullReversals].every(Array.isArray)) throw new Error('Partial-return ledger is unavailable.');
  const saleById = new Map();
  for (const sale of sales) {
    if (!validId(sale?.id) || saleById.has(sale.id)) throw new Error('Missing or duplicate sale identity.');
    saleById.set(sale.id,sale);
  }
  const bySale = new Map();
  const ids = new Set(), keys = new Set(), movementIds = new Set(), costIds = new Set();
  const reversed = new Set();
  for (const row of fullReversals) {
    const original = saleById.get(row?.originalSaleId);
    if (!original || row.businessProfileId !== original.businessProfileId || reversed.has(row.originalSaleId))
      throw new Error('Cash-return history contains an orphaned or duplicate full reversal.');
    reversed.add(row.originalSaleId);
  }
  const ordered = [...returns].sort((a,b) => (a.returnSequence ?? 0) - (b.returnSequence ?? 0) || String(a.id).localeCompare(String(b.id)));
  for (const entry of ordered) {
    if (!validId(entry?.id) || ids.has(entry.id) || !validId(entry.submissionKey) ||
        keys.has(JSON.stringify([entry.businessProfileId, entry.submissionKey])) ||
        !validId(entry.originalSaleId) || !validId(entry.businessProfileId) ||
        typeof entry.createdAt !== 'string' || !Number.isFinite(Date.parse(entry.createdAt)) ||
        !RETURN_SETTLEMENT_METHODS.includes(entry.refundMethod) ||
        !legsValid(entry) || !loyaltyValid(entry) ||
        entry.disbursementEvidence !== expectedEvidence(entry) ||
        (entry.manualReference !== undefined && (typeof entry.manualReference !== 'string' || !entry.manualReference.trim() || entry.manualReference.length > 64 || entry.refundMethod === 'cash' || entry.refundMethod === 'credit' || entry.refundMethod === 'wallet' || entry.refundMethod === 'split')) ||
        (entry.refundMethod === 'wallet' && ((entry.debtReducedMinor ?? 0) !== 0 || entry.customerId === undefined)) ||
        (entry.debtReducedMinor !== undefined && !money(entry.debtReducedMinor)) ||
        (entry.customerId !== undefined && !validId(entry.customerId)) ||
        ((entry.debtReducedMinor ?? 0) > 0 && entry.customerId === undefined) ||
        (entry.refundMethod === 'credit' ? (entry.refundedMinor !== 0 || !((entry.debtReducedMinor ?? 0) > 0)) : entry.refundedMinor === 0) ||
        entry.disposition !== 'restockable' ||
        !Number.isSafeInteger(entry.returnSequence) || entry.returnSequence < 1 ||
        !money(entry.refundedMinor) ||
        !money(entry.returnedTaxMinor) || !money(entry.returnedTaxableMinor) || !money(entry.returnedDiscountMinor) ||
        !Array.isArray(entry.lines) || entry.lines.length === 0 || entry.lines.length > 256) {
      throw new Error('Saved cash return has malformed or duplicated evidence.');
    }
    ids.add(entry.id);keys.add(JSON.stringify([entry.businessProfileId, entry.submissionKey]));
    const sale = saleById.get(entry.originalSaleId);
    if (!sale || sale.businessProfileId !== entry.businessProfileId || reversed.has(sale.id) ||
        sale.customerId !== entry.customerId ||
        (entry.refundMethod === 'credit' ? !['credit','split',...MANUAL_REFUND_TENDERS].includes(sale.paymentMethod) : sale.paymentMethod !== entry.refundMethod) ||
        !/^[A-Z]{3}$/.test(sale.currency ?? '') || sale.currency !== entry.currency ||
        !money(sale.totalMinor) || !money(sale.amountPaidMinor) || !money(sale.outstandingMinor) ||
        (sale.customerId === undefined
          ? (sale.amountPaidMinor !== sale.totalMinor || sale.outstandingMinor !== 0 || (entry.debtReducedMinor ?? 0) !== 0)
          : (entry.refundMethod === 'wallet'
              ? (sale.outstandingMinor !== 0 || sale.walletAppliedMinor !== sale.amountPaidMinor || sale.amountPaidMinor !== sale.totalMinor)
              : (sale.outstandingMinor === 0 && (entry.debtReducedMinor ?? 0) > 0))) ||
        (sale.walletAppliedMinor && entry.refundMethod !== 'wallet') || sale.loyaltyRedeemedMinor || sale.loyaltyRedeemedPoints ||
        entry.originalReceiptNumber !== sale.receiptNumber ||
        Date.parse(entry.createdAt) < Date.parse(sale.createdAt)) {
      throw new Error('Cash return is not linked to a supported, fully paid original sale.');
    }
    if (sale.tax?.ghana) throw new Error("Ghana VAT partial refund evidence requires a separate certified tax-correction process.");
    const paid = payments.filter(p => p.saleId === sale.id);
    if (sale.paymentMethod === 'split') {
      // Every original tender must still be saved exactly as paid; the legs below are checked against these.
      let tenders;
      try { tenders = normalizeSplitTenders(sale.splitTendersAtSale, sale.amountPaidMinor, sale.totalMinor); } catch { throw new Error('Cash return has unverified original split-tender evidence.'); }
      if (paid.length !== tenders.length || tenders.some(t => paid.filter(p => p.method === t.method && p.amountMinor === t.amountMinor && p.businessProfileId === sale.businessProfileId).length !== 1))
        throw new Error('Cash return has unverified original tender evidence.');
    } else if (entry.refundMethod === 'wallet' ? paid.length !== 0 : sale.amountPaidMinor === 0 ? paid.length !== 0 :
        (paid.length !== 1 || paid[0].method !== sale.paymentMethod || paid[0].businessProfileId !== sale.businessProfileId ||
         paid[0].amountMinor !== sale.amountPaidMinor))
      throw new Error('Cash return has unverified original tender evidence.');
    const lines = saleLines.filter(line => line.saleId === sale.id);
    for (const row of entry.lines) {
      if (!validId(row.saleLineId) || !validId(row.productId) ||
          !validId(row.movementId) || movementIds.has(row.movementId) ||
          !validId(row.costEventId) || costIds.has(row.costEventId) ||
          !Number.isSafeInteger(row.quantity) || row.quantity <= 0) throw new Error('Cash return stock and cost evidence is duplicated or invalid.');
      movementIds.add(row.movementId);costIds.add(row.costEventId);
      const originalLine = lines.find(line => line.id === row.saleLineId);
      if (!originalLine || originalLine.productId !== row.productId || originalLine.stockTracked === false || !originalLine.costEventId)
        throw new Error('Cash return contains unsupported stock, batch or line evidence.');
      batchRestorationsValid(originalLine, row, bySale.get(sale.id) ?? []);
    }
    const existing = bySale.get(sale.id) ?? [];
    if (entry.returnSequence !== existing.length + 1 ||
        (existing.length > 0 && Date.parse(entry.createdAt) < Date.parse(existing.at(-1).createdAt)))
      throw new Error("Cash return journal sequence is missing, duplicated or out of order.");
    if (new Set(entry.lines.map(row=>row.saleLineId)).size !== entry.lines.length)
      throw new Error("Cash return contains duplicate original sale lines.");
    const requested = entry.lines.map(row => ({saleLineId:row.saleLineId,quantity:row.quantity}));
    const prior = existing.flatMap(p => p.lines.map(row => ({saleLineId:row.saleLineId,quantity:row.quantity})));
    const plan = planPartialSaleReturn(sale,lines,prior,requested);
    if (sale.tax && !plan.taxPolicyVerified) throw new Error('Cash return requires verified original tax policy evidence.');
    if (BigInt(plan.draftAmountMinor) !== BigInt(entry.refundedMinor) + BigInt(entry.debtReducedMinor ?? 0) || plan.draftTaxMinor !== entry.returnedTaxMinor ||
        plan.draftTaxableMinor !== entry.returnedTaxableMinor || plan.draftDiscountMinor !== entry.returnedDiscountMinor) {
      throw new Error('Cash return saved amounts do not reconcile with original invoice components.');
    }
    const debtSoFar = [...existing,entry].reduce((n,row)=>n+BigInt(row.debtReducedMinor ?? 0),0n);
    const cashSoFar = [...existing,entry].reduce((n,row)=>n+BigInt(row.refundedMinor),0n);
    if (debtSoFar > BigInt(sale.outstandingMinor) || cashSoFar > BigInt(sale.amountPaidMinor))
      throw new Error('Saved returns exceed the original sale debt or the amount actually paid.');
    if (sale.paymentMethod === 'split') {
      // No tender may ever be refunded more than was paid through it.
      const perMethod = new Map();
      for (const row of [...existing, entry]) for (const leg of row.legs ?? []) perMethod.set(leg.method, (perMethod.get(leg.method) ?? 0n) + BigInt(leg.amountMinor));
      for (const [method, refunded] of perMethod) {
        const paidThrough = sale.splitTendersAtSale?.find(t => t.method === method);
        if (!paidThrough || refunded > BigInt(paidThrough.amountMinor)) throw new Error('Saved returns refund more through a tender than the customer paid through it.');
      }
    }
    bySale.set(sale.id,[...existing,entry]);
  }
  return {bySale, verifiedReturns: returns.length};
}
