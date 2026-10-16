export interface Run12SupplierCashAudit {
 readonly companyCurrency:string;
 readonly localSupplierPaymentsMinor:number;
 readonly collectionsLessExpensesAndLocalSupplierPaymentsMinor:number;
 readonly foreignCurrencySupplierPayments:readonly {currency:string;amountMinor:number}[];
 readonly foreignSupplierPaymentsExcluded:boolean;
 readonly unknownSupplierLiabilityPurchases:number;
 readonly supplierLiabilityComplete:boolean;
}
export function auditRun12SupplierCashConservation(
 summary:{expensesMinor:number;collectionsMinor:number;netRecordedCashMovementMinor:number},
 report:{
  recognizedByCurrency:{currency:string;amountMinor:number}[];
  paidToDateByCurrency:{currency:string;amountMinor:number}[];
  creditedToDateByCurrency:{currency:string;amountMinor:number}[];
  outstandingByCurrency:{currency:string;amountMinor:number}[];
  periodPaymentsByCurrency:{currency:string;amountMinor:number}[];
  unknownPurchases:number;complete:boolean;
 },companyCurrency:string
):Run12SupplierCashAudit;
