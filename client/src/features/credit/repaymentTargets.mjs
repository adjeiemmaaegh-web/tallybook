import { reconcileCreditLedger, reconcileRepaymentAllocations } from '../sales/creditLedger.mjs';

/**
 * Offer explicit repayment-to-sale links only when saved sale currency and
 * remaining sale-level debt are demonstrable. Never impute a destination for
 * historical, customer-level repayments. This is a pure, read-only projection;
 * recordRepayment must revalidate in its write transaction.
 */
export function getRepaymentTargetsFromLedger(sales, reversals, repayments, {customerId, businessProfileId, currency}) {
  if (typeof customerId !== 'string' || !customerId || typeof businessProfileId !== 'string' || !businessProfileId ||
      typeof currency !== 'string' || !currency) throw new Error('Repayment target scope or currency is missing.');
  for (const row of [...sales, ...reversals, ...repayments]) {
    if (row?.businessProfileId !== businessProfileId || row?.customerId !== customerId)
      throw new Error('Repayment target ledger contains another customer or business.');
  }
  const debt = reconcileCreditLedger(sales, reversals, repayments);
  const allocation = reconcileRepaymentAllocations(sales, reversals, repayments);
  const reversed = new Set(reversals.map(row => row.originalSaleId));
  const eligible = sales.filter(row => !reversed.has(row.id) && row.currency === currency && row.outstandingMinor > 0);
  if (eligible.some(row => typeof row.receiptNumber !== 'string' || !row.receiptNumber.trim()))
    throw new Error('Sale receipt identity is missing from repayment targets.');
  const targets = eligible.map(row => ({
      saleId: row.id,
      receiptNumber: row.receiptNumber,
      remainingMinor: row.outstandingMinor - (allocation.allocatedBySale.get(row.id) ?? 0),
    }))
    .filter(row => row.remainingMinor > 0)
    .sort((a, b) => a.receiptNumber.localeCompare(b.receiptNumber) || a.saleId.localeCompare(b.saleId));
  const hasUnallocated = allocation.unallocatedMinor > 0;
  const reason = hasUnallocated
    ? 'Some earlier payments were recorded against the customer, not a specific sale. Record this payment against the customer until those older allocations are independently established.'
    : targets.length === 0
      ? 'No eligible sale has both a recorded matching currency and an unpaid, unreversed balance. Older sales without currency evidence cannot be linked automatically.'
      : null;
  return { canLink: !reason && debt.outstandingMinor > 0, reason, targets: hasUnallocated ? [] : targets, unallocatedMinor: allocation.unallocatedMinor };
}
