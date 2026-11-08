export interface ManualStatementRow {method:"card"|"mobile";reference:string;amountMinor:number;providerId?:string}
export interface ManualReconcilePayment {id:string;businessProfileId:string;method:string;amountMinor:number;cardReference?:string;mobileMoneyProviderId?:string;mobileMoneyReference?:string}
export interface ManualTenderReconcileResult {
 matched:number;amountMismatches:number;statementUnmatched:number;ledgerUnmatched:number;verifiedByGateway:false;
 rows:Array<{method:string;reference:string;amountMinor:number;status:"matched"|"unmatched"|"amount-mismatch";paymentId?:string}>;
}
export declare function parseManualTenderStatement(text:string):ManualStatementRow[];
export declare function reconcileManualTenderStatement(payments:ManualReconcilePayment[],statement:ManualStatementRow[],companyId:string):ManualTenderReconcileResult;
