import type { Sale, SaleLine } from './sales';
export interface ReturnQuantityRow { saleLineId: string; quantity: number }
export interface DraftPartialReturnLine extends ReturnQuantityRow {
  previouslyReturnedQuantity: number;
  cumulativeReturnedQuantity: number;
  allocatedMinor: number;
  taxableMinor: number;
  taxMinor: number;
  discountMinor: number;
}
export interface DraftPartialReturn {
  originalSaleId: string;
  businessProfileId: string;
  draftAmountMinor: number;
  draftTaxableMinor: number;
  draftTaxMinor: number;
  draftDiscountMinor: number;
  /** True only when the original saved owner policy matches the tax amounts. */
  taxPolicyVerified: boolean;
  lines: DraftPartialReturnLine[];
  taxAllocationStatus: 'invoice-snapshot-proportional-draft' | 'historical-tax-unknown';
  status: 'DRAFT_ONLY_NO_FINANCIAL_OR_STOCK_POSTING';
}
export declare function allocateSavedInvoiceMinor(totalMinor: number, lines: ReadonlyArray<Pick<SaleLine, 'id' | 'lineTotalMinor'>>): Record<string, number>;
export declare function planPartialSaleReturn(sale: Sale, saleLines: readonly SaleLine[], previousReturns: readonly ReturnQuantityRow[], requestedLines: readonly ReturnQuantityRow[]): DraftPartialReturn;
