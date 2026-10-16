export interface Run15MockIntent {
 id:string;businessProfileId:string;submissionKey:string;
 amountMinor:number;currency:string;method:"card"|"mobile";
 createdAt:string;status:"pending"|"succeeded"|"failed"|"partially-refunded"|"refunded"|"charged-back";
 refundedMinor:number;mockOnly:true;provider:"mock-only";
 financialPostingPerformed:false;authoritativeSettlement:false
}
export interface Run15MockEvent {
 id:string;intentId:string;businessProfileId:string;action:"timeout"|"succeed"|"fail"|"refund"|"chargeback";
 amountMinor:number;createdAt:string;sequence:number;mockOnly:true;
 financialPostingPerformed:false;authoritativeSettlement:false
}
export const RUN15_PROVIDER_NAME:"mock-only";
export function validateRun15MockIntent(value:unknown):Run15MockIntent;
export function validateRun15MockEvent(value:unknown):Run15MockEvent;
export function applyRun15MockEvent(
 intent:Run15MockIntent,event:Run15MockEvent,priorEvents?:Run15MockEvent[]
):Readonly<{intent:Run15MockIntent;replayed:boolean;financialPostingPerformed:false}>;
export function auditRun15MockTimeline(intent:Run15MockIntent,events:Run15MockEvent[]):Readonly<{
 intent:Run15MockIntent;eventCount:number;financialPostingPerformed:false;authoritativeSettlement:false
}>;
