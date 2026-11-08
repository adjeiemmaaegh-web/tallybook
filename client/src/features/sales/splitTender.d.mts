export type SplitTenderMethod="cash"|"card"|"mobile";
export interface SplitTenderEvidence {method:SplitTenderMethod;amountMinor:number;providerId?:string;reference?:string}
export declare function normalizeSplitTenders(tenders:SplitTenderEvidence[],paidMinor:number,totalMinor:number):SplitTenderEvidence[];
export declare function assertSplitPaymentLedger(sale:{
 id:string;businessProfileId:string;customerId?:string;paymentMethod:string;amountPaidMinor:number;totalMinor:number;splitTendersAtSale?:SplitTenderEvidence[];
},payments:Array<{
 saleId:string;businessProfileId:string;customerId?:string;method:string;amountMinor:number;cardReference?:string;
 mobileMoneyProviderId?:string;mobileMoneyReference?:string
}>):true;
