import type { Sale } from '../sales/sales';
import type { DebtRepayment } from '../credit/credit';
import type { Expense } from '../expenses/expenses';
import type { WalletTransfer } from '../customers/walletTransfers';
import type { CashPartialSaleReturn } from '../sales/cashPartialReturnPosting';
export function assertSingleCurrencyFinancialEvidence(input: {
  sales: Sale[];
  repayments: DebtRepayment[];
  expenses: Expense[];
  walletTransfers: WalletTransfer[];
  cashReturns: CashPartialSaleReturn[];
}, currency: string): true;
