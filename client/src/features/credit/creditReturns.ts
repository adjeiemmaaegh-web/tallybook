import type { TallybookDB } from '@/db/TallybookDB';
import type { CashPartialSaleReturn } from '@/features/sales/cashPartialReturnPosting';

/**
 * Saved partial returns that reduced a customer's receivable (credit notes).
 * The ledger functions subtract these from the matching sales; callers must read
 * them in the SAME transaction as the sales (include `database.cashPartialReturns`).
 */
export async function creditReturnsForSales(database: TallybookDB, company: string, sales: ReadonlyArray<{ id: string }>): Promise<CashPartialSaleReturn[]> {
  if (!sales.length) return [];
  const rows = await database.cashPartialReturns.where('originalSaleId').anyOf(sales.map(sale => sale.id)).toArray();
  return rows.filter(row => row.businessProfileId === company && (row.debtReducedMinor ?? 0) > 0);
}

import { reconcileCreditLedger, reconcileRepaymentAllocations } from '@/features/sales/creditLedger.mjs';
import type { Sale } from '@/features/sales/sales';

/**
 * Receivable still owed on ONE credit/part-credit sale after repayments linked to it and
 * earlier credit-note returns. Fails closed on legacy customer-level (unallocated) repayments,
 * rewards/wallet postings, and any ledger that does not reconcile. Must run inside a
 * transaction that includes sales, saleReversals, repayments, cashPartialReturns, customerBenefits.
 */
export async function stillOwedOnSale(database: TallybookDB, company: string, sale: Sale): Promise<number> {
  const customerId = sale.customerId;
  if (customerId === undefined) throw new Error('This sale has no customer receivable.');
  const keys = new Set([`sale-points-${sale.id}`, `sale-wallet-${sale.id}`, `sale-redeemed-${sale.id}`]);
  const benefits = (await database.customerBenefits.where('customerId').equals(customerId).toArray())
    .filter(row => row.businessProfileId === company && keys.has(row.submissionKey));
  if (benefits.length)
    throw new Error('This sale earned or spent customer rewards or wallet funds; a partial return cannot yet reverse them. Use the full reconciliation workflow.');
  const [sales, reversals, repayments] = await Promise.all([
    database.sales.where('customerId').equals(customerId).and(row => row.businessProfileId === company).toArray(),
    database.saleReversals.where('customerId').equals(customerId).and(row => row.businessProfileId === company).toArray(),
    database.repayments.where('customerId').equals(customerId).and(row => row.businessProfileId === company).toArray(),
  ]);
  const credit = await creditReturnsForSales(database, company, sales);
  reconcileCreditLedger(sales, reversals, repayments, credit);
  const allocation = reconcileRepaymentAllocations(sales, reversals, repayments, credit);
  if (allocation.unallocatedMinor > 0)
    throw new Error('Customer repayments are not linked to individual sales. Reconcile their allocation before returning goods from a credit sale.');
  const priorReduced = credit.filter(row => row.originalSaleId === sale.id).reduce((n, row) => n + (row.debtReducedMinor ?? 0), 0);
  const owed = sale.outstandingMinor - priorReduced - (allocation.allocatedBySale.get(sale.id) ?? 0);
  if (!Number.isSafeInteger(owed) || owed < 0) throw new Error('Sale debt needs reconciliation before a return.');
  return owed;
}
