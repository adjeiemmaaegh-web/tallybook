import type {Sale} from '../sales/sales';
import type {Customer} from '../customers/customers';
import type {DebtRepayment} from '../credit/credit';
import type {SaleReversal} from '../assistant/reversals';
export interface ReceivableAgeingGroup {currency:string;outstandingMinor:number;currentMinor:number;days1to30Minor:number;days31to60Minor:number;days61to90Minor:number;over90Minor:number;unknownTermsMinor:number;unknownAllocationMinor:number}
export interface ReceivableAgeing {asOfDate:string;groups:ReceivableAgeingGroup[];unknownCurrencyCustomers:number}
export function summarizeReceivableAgeing(input:{company:string;customers:Customer[];sales:Sale[];repayments:DebtRepayment[];reversals:SaleReversal[]},asOfDate:string):ReceivableAgeing;
