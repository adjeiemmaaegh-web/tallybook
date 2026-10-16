export interface Run15SignedMockEvent {
 businessProfileId:string;intentId:string;eventId:string;
 action:"timeout"|"succeed"|"fail"|"refund"|"chargeback";
 amountMinor:number;createdAt:string;mockOnly:true;provider:"mock-only";
}
export interface Run15VerifiedMockEvent extends Run15SignedMockEvent {
 simulated:true;authoritativeSettlement:false;financialPostingPerformed:false
}
export function signRun15MockCallback(event:Run15SignedMockEvent,key:string):Readonly<{body:string;signature:string;simulated:true}>;
export function verifyRun15MockCallback(body:string,signature:string,key:string,options?:{
 companyId:string;now?:number
}):Readonly<Run15VerifiedMockEvent>;
