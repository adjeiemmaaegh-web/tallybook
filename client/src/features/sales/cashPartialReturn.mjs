import { planPartialSaleReturn } from './partialReturnPlan.mjs';

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
export const RETURN_SETTLEMENT_METHODS = Object.freeze([...MANUAL_REFUND_TENDERS,'credit']);

/**
 * Independently validate the append-only, cash-only return journal. This is an
 * intentionally restricted first posting lane: no customer, wallet, points,
 * provider settlement, credit, money-only returns, batches or services.
 * Returning cash is a PHYSICAL action the authorized cashier confirms; posting
 * here records that completed local action, not an external refund promise.
 */
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
        (entry.refundMethod !== 'cash' && entry.refundMethod !== 'credit' && entry.disbursementEvidence !== 'staff_confirmed_manual_unverified') ||
        ((entry.refundMethod === 'cash' || entry.refundMethod === 'credit') && entry.disbursementEvidence !== undefined) ||
        (entry.manualReference !== undefined && (typeof entry.manualReference !== 'string' || !entry.manualReference.trim() || entry.manualReference.length > 64 || entry.refundMethod === 'cash' || entry.refundMethod === 'credit')) ||
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
        (entry.refundMethod === 'credit' ? !['credit',...MANUAL_REFUND_TENDERS].includes(sale.paymentMethod) : sale.paymentMethod !== entry.refundMethod) ||
        !/^[A-Z]{3}$/.test(sale.currency ?? '') || sale.currency !== entry.currency ||
        !money(sale.totalMinor) || !money(sale.amountPaidMinor) || !money(sale.outstandingMinor) ||
        (sale.customerId === undefined
          ? (sale.amountPaidMinor !== sale.totalMinor || sale.outstandingMinor !== 0 || (entry.debtReducedMinor ?? 0) !== 0)
          : sale.outstandingMinor === 0) ||
        sale.walletAppliedMinor || sale.loyaltyRedeemedMinor || sale.loyaltyRedeemedPoints ||
        entry.originalReceiptNumber !== sale.receiptNumber ||
        Date.parse(entry.createdAt) < Date.parse(sale.createdAt)) {
      throw new Error('Cash return is not linked to a supported, fully paid original sale.');
    }
    if (sale.tax?.ghana) throw new Error("Ghana VAT partial refund evidence requires a separate certified tax-correction process.");
    const paid = payments.filter(p => p.saleId === sale.id);
    if (sale.amountPaidMinor === 0 ? paid.length !== 0 :
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
      if (!originalLine || originalLine.productId !== row.productId || originalLine.stockTracked === false || !originalLine.costEventId ||
          (originalLine.batchAllocations?.length ?? 0) !== 0) throw new Error('Cash return contains unsupported stock, batch or line evidence.');
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
    bySale.set(sale.id,[...existing,entry]);
  }
  return {bySale, verifiedReturns: returns.length};
}
