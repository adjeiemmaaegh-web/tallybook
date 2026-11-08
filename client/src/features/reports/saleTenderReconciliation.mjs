/** Independent full-history sale-to-tender reconstruction for management QA.
 * It checks immutable saved checkout/tender evidence, without inferring gateway
 * settlement or allocating old customer repayments to individual sales.
 */
import {assertSplitPaymentLedger} from "../sales/splitTender.mjs";
const validMinor = n => Number.isSafeInteger(n) && n >= 0;
const validId = s => typeof s === 'string' && s.length > 0;
export function assertSavedSaleTenderReconciliation(sales, payments) {
  if (!Array.isArray(sales) || !Array.isArray(payments))
    throw new Error('Sale tender reconciliation requires the full saved ledger.');
  const bySale=new Map(), sums=new Map(), seenPayments=new Set();
  for (const sale of sales) {
    if (!validId(sale?.id) || bySale.has(sale.id) || !validId(sale.businessProfileId) ||
        !validMinor(sale.totalMinor) || !validMinor(sale.amountPaidMinor) ||
        !validMinor(sale.outstandingMinor) || !validMinor(sale.walletAppliedMinor ?? 0) ||
        BigInt(sale.amountPaidMinor) + BigInt(sale.outstandingMinor) !== BigInt(sale.totalMinor) ||
        (sale.outstandingMinor > 0 && !validId(sale.customerId)) ||
        (sale.walletAppliedMinor > 0 && (sale.paymentMethod !== 'wallet' || !validId(sale.customerId) || sale.walletAppliedMinor !== sale.amountPaidMinor))) {
      throw new Error('Sale amounts or wallet settlement do not reconcile with the immutable checkout.');
    }
    bySale.set(sale.id,sale);
  }
  for (const pay of payments) {
    if (!validId(pay?.id) || seenPayments.has(pay.id) || !validId(pay.saleId) || !validMinor(pay.amountMinor) || !pay.amountMinor)
      throw new Error('Sale payment contains an invalid or duplicated identity or amount.');
    seenPayments.add(pay.id);
    const sale=bySale.get(pay.saleId);
    if (!sale || pay.businessProfileId !== sale.businessProfileId ||
        (pay.customerId ?? undefined) !== (sale.customerId ?? undefined) ||
        (sale.paymentMethod !== 'split' && pay.method !== sale.paymentMethod) || pay.method === 'wallet' || pay.method === 'credit' || pay.method === 'split' ||
        typeof pay.createdAt !== 'string' || !Number.isFinite(Date.parse(pay.createdAt))) {
      throw new Error('Sale payment is foreign, orphaned or has a mismatched original tender.');
    }
    const next=(sums.get(pay.saleId) ?? 0n) + BigInt(pay.amountMinor);
    if (next > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Sale payments exceed safe monetary precision.');
    sums.set(pay.saleId,next);
  }
  for (const sale of sales) {
    assertSplitPaymentLedger(sale,payments.filter(p=>p.saleId===sale.id));
    const externalPaid=BigInt(sale.amountPaidMinor) - BigInt(sale.walletAppliedMinor ?? 0);
    if (externalPaid !== (sums.get(sale.id) ?? 0n))
      throw new Error('Sale payments do not reconcile to the saved amount received.');
  }
  return true;
}
