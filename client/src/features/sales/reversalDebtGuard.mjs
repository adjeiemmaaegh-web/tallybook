import { reconcileCreditLedger, reconcileRepaymentAllocations } from './creditLedger.mjs';
/**
 * Repayments can have exact sale links or legacy unallocated balances.
 * An aggregate positive debt balance cannot prove that THIS sale is unpaid.
 * Fail closed rather than erase previously collected money from another sale.
 */
export function assertDebtReversalIsUnallocatedPaymentSafe(sale, customerSales, reversals, repayments) {
  if (!sale || !Number.isSafeInteger(sale.outstandingMinor) || sale.outstandingMinor < 0)
    throw new Error('Sale debt needs reconciliation before reversal.');
  reconcileCreditLedger(customerSales, reversals, repayments);
  if (!customerSales.some(row => row.id === sale.id && row.businessProfileId === sale.businessProfileId && row.customerId === sale.customerId))
    throw new Error('Reversal sale is not part of the customer ledger.');
  if (reversals.some(row => row.originalSaleId === sale.id)) throw new Error('Sale is already reversed.');
  if (sale.outstandingMinor > 0) {
    const allocation = reconcileRepaymentAllocations(customerSales, reversals, repayments);
    if (allocation.unallocatedMinor > 0)
      throw new Error('Customer repayments are not linked to individual sales. Reconcile their allocation before reversing a credit sale.');
    if ((allocation.allocatedBySale.get(sale.id) ?? 0) > 0)
      throw new Error('This credit sale has linked repayments and cannot be fully reversed without a separate settlement adjustment.');
  }
}
