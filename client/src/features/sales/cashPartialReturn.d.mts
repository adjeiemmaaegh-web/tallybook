import type { Sale, SaleLine, Payment } from './sales';
import type { SaleReversal } from '../assistant/reversals';
import type { CashPartialSaleReturn } from './cashPartialReturnPosting';
export function reconcileCashPartialReturns(sales: Sale[], saleLines: SaleLine[], payments: Payment[], returns: CashPartialSaleReturn[], fullReversals?: SaleReversal[]): { bySale: Map<string,CashPartialSaleReturn[]>; verifiedReturns:number };
