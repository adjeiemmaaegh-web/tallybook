import type {Supplier,Purchase} from '../purchases/purchases';
import type {SupplierPayableEntry} from '../purchases/supplierPayables.ts';
import type {Expense} from '../expenses/expenses';
export interface Run12SupplierFinancialAudit {
 readonly unknownPurchases:number;
 readonly recognizedPurchases:number;
 readonly manuallyAttestedPayments:number;
 readonly paymentsWithoutReferences:number;
 readonly supplierCreditsWithoutReferences:number;
 readonly periodSupplierPaymentsByCurrency:Array<{currency:string;amountMinor:number}>;
 readonly periodSupplierPaymentsInCompanyCurrencyMinor:number;
 readonly otherCurrencyPayments:Array<{currency:string;amountMinor:number}>;
 readonly recordedOperatingExpenseCount:number;
 readonly expensesWithUnknownCurrency:number;
 readonly expensesInOtherCurrency:number;
 readonly providerSettlementVerified:false;
 readonly potentialExpensePaymentOverlapUnresolved:true;
}
export function auditRun12SupplierFinance(input:{
 company:string;companyCurrency:string;suppliers:Supplier[];
 purchases:Purchase[];entries:SupplierPayableEntry[];expenses:Expense[];
 range:{start:Date;end:Date};
}):Run12SupplierFinancialAudit;
