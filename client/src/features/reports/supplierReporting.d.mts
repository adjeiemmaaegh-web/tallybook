import type { Purchase } from '../purchases/purchases';
import type { SupplierPayableEntry } from '../purchases/supplierPayables';
export interface CurrencyAmount { currency: string; amountMinor: number }
export interface SupplierFinancialReconciliation {
  unknownPurchases: number;
  complete: boolean;
  outstandingByCurrency: CurrencyAmount[];
  recognizedByCurrency: CurrencyAmount[];
  paidToDateByCurrency: CurrencyAmount[];
  creditedToDateByCurrency: CurrencyAmount[];
  periodPaymentsByCurrency: CurrencyAmount[];
}
export function reconcileSupplierFinancialReport(purchases: Purchase[], entries: SupplierPayableEntry[], range: { start: Date; end: Date }): SupplierFinancialReconciliation;
