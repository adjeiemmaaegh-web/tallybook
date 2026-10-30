export type CreditTermsSnapshot={version:1;paymentDueDays:number|null;dueDateUtc:string|null};
export function snapshotCreditTerms(createdAt:string,paymentDueDays?:number):CreditTermsSnapshot;
export function validateCreditTerms(sale:{createdAt:string;customerId?:string;outstandingMinor:number;creditTermsAtSale?:CreditTermsSnapshot}):void;
