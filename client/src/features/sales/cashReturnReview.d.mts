import type { Sale, SaleLine, Payment, Receipt } from './sales';
import type { Product } from '../inventory/inventory';
import type { InventoryCostEvent } from '../inventory/costLedger';
import type { CashPartialSaleReturn } from './cashPartialReturnPosting';
import type { SaleReversal } from '../assistant/reversals';
import type { InventoryBatch } from '../inventory/stage2Inventory';
export interface CashReturnReview {
  sale: Sale;
  saleLines: SaleLine[];
  prior: Array<{ saleLineId: string; quantity: number }>;
  options: Array<{ saleLineId: string; productName: string; remainingQuantity: number }>;
  currency: string;
  receiptNumber: string;
  priorReturnCount: number;
}
export function prepareCashReturnReview(input: {
  company:string; sale: Sale; saleLines: SaleLine[]; payments: Payment[]; receipts: Receipt[];
  priorReturns: CashPartialSaleReturn[]; fullReversals: SaleReversal[]; products: Product[];
  costEvents: InventoryCostEvent[]; batches: InventoryBatch[];
}): CashReturnReview;
export function quoteReviewedCashReturn(review:CashReturnReview,saleLineId:string,quantity:number):{
  amountMinor:number;taxMinor:number;discountMinor:number;taxableMinor:number;
};
