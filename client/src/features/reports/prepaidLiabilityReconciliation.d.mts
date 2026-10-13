export function reconcilePrepaidLiability(input: {
  transfers: readonly import('../customers/walletTransfers').WalletTransfer[];
  benefits: readonly import('../customers/customerBenefits').CustomerBenefitEntry[];
  sales: readonly import('../sales/sales').Sale[];
  reversals: readonly import('../assistant/reversals').SaleReversal[];
},currency:string): {currency:string;liabilityMinor:number;customerCount:number};
