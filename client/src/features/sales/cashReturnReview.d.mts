import type { Sale, SaleLine, Payment, Receipt } from './sales';
import type { Product } from '../inventory/inventory';
import type { InventoryCostEvent } from '../inventory/costLedger';
import type { CashPartialSaleReturn } from './cashPartialReturnPosting';
import type { SaleReversal } from '../assistant/reversals';
import type { InventoryBatch } from '../inventory/stage2Inventory';
export interface CashReturnReview {
  refundMethod: 'cash'|'mobile'|'card'|'credit'|'wallet'|'split';
  choices: { refundAllocation: 'proportional'|'reverse-order'; loyaltyOnReturn: 'reverse'|'keep' };
  legsCapacity?: Array<{ method: string; capacityMinor: number }>;
  earnedPoints: number; pointsBalance: number; refundedTenderBeforeMinor: number;
  stillOwedMinor: number;
  refundableTenderMinor: number;
  storeMode?: boolean;
  receivingStores?: Array<{id:string;name:string}>;
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
  costEvents: InventoryCostEvent[]; batches: InventoryBatch[]; stillOwedMinor?: number;
  choices?: { refundAllocation?: 'proportional'|'reverse-order'; loyaltyOnReturn?: 'reverse'|'keep' }; earnedPoints?: number; pointsBalance?: number;
}): CashReturnReview;
export function quoteReviewedCashReturn(review:CashReturnReview,saleLineId:string,quantity:number):{
  amountMinor:number;debtReducedMinor:number;refundMinor:number;taxMinor:number;discountMinor:number;taxableMinor:number;
  legs?: Array<{ method: 'cash'|'mobile'|'card'; amountMinor: number }>;
  points?: { reverse: number; shortfall: number; due: number };
};
