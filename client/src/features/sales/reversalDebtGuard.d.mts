import type { Sale } from './sales';
import type { SaleReversal } from '../assistant/reversals';
import type { DebtRepayment } from '../credit/credit';
export declare function assertDebtReversalIsUnallocatedPaymentSafe(
  sale: Sale,
  customerSales: readonly Sale[],
  reversals: readonly SaleReversal[],
  repayments: readonly DebtRepayment[],
): void;
