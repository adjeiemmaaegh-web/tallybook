import type {Customer} from '../customers/customers';
import type {Sale} from '../sales/sales';
import type {DebtRepayment} from '../credit/credit';
import type {SaleReversal} from '../assistant/reversals';
export interface Run10ReceivableAudit {
 readonly outstandingMinor:number;
 readonly salesOutstandingMinor:number;
 readonly repaidMinor:number;
 readonly allocatedRepaymentMinor:number;
 readonly unallocatedRepaymentMinor:number;
 readonly indebtedCustomers:number;
 readonly historicalUnknownCurrencyCustomers:number;
 readonly customerCount:number;
}
export function auditRun10CompanyReceivables(input:{
 company:string;customers:Customer[];sales:Sale[];
 repayments:DebtRepayment[];reversals:SaleReversal[];
}):Run10ReceivableAudit;
