export function reconcilePrepaidLiability(input: {
  transfers: readonly import('../customers/walletTransfers').WalletTransfer[];
  benefits: readonly import('../customers/customerBenefits').CustomerBenefitEntry[];
  sales: readonly import('../sales/sales').Sale[];
  reversals: readonly import('../assistant/reversals').SaleReversal[];
  /** Partial returns; only refundMethod 'wallet' entries credit the wallet. */
  returns?: readonly import('../sales/cashPartialReturnPosting').CashPartialSaleReturn[];
},currency:string): {currency:string;liabilityMinor:number;customerCount:number};
