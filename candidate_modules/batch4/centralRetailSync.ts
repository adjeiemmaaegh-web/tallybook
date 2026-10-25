/** Idempotent sync planning and acknowledgement validation; NO network requests or data writes. */
export interface SyncEnvelope { eventId:string; companyId:string;storeId:string;kind:'sale'|'shift'|'drawer'|'void'|'discount'|'momo';occurredAt:string;payload:Record<string,unknown>;version:number }
export interface SyncAck { eventId:string;companyId:string;serverSequence:number;acceptedAt:string }
export function prepareSyncBatch(events:readonly SyncEnvelope[],companyId:string,maxBatch=100):SyncEnvelope[]{
 if(!companyId)throw new Error('Company scope required.');if(!Number.isInteger(maxBatch)||maxBatch<1||maxBatch>1000)throw new Error('Invalid batch size.');const seen=new Set<string>();
 return events.slice(0,maxBatch).map(event=>{if(event.companyId!==companyId||!event.storeId||!event.eventId||!Number.isFinite(Date.parse(event.occurredAt))||event.version!==1)throw new Error('Invalid or cross-company sync event.');if(seen.has(event.eventId))throw new Error('Duplicate event ID.');seen.add(event.eventId);return event;});
}
export function verifySyncAcknowledgements(batch:readonly SyncEnvelope[],acks:readonly SyncAck[],companyId:string){
 const sent=new Set<string>(),acknowledged=new Set<string>();
 for(const event of batch){
  if(event.companyId!==companyId||!event.storeId||!event.eventId||!Number.isFinite(Date.parse(event.occurredAt))||event.version!==1||sent.has(event.eventId))throw new Error('Invalid or duplicate sync batch event.');
  sent.add(event.eventId);
 }
 for(const ack of acks){if(ack.companyId!==companyId||!sent.has(ack.eventId)||acknowledged.has(ack.eventId)||!Number.isSafeInteger(ack.serverSequence)||ack.serverSequence<1||!Number.isFinite(Date.parse(ack.acceptedAt)))throw new Error('Invalid sync acknowledgement.');acknowledged.add(ack.eventId);}return {acknowledged:[...acknowledged],pending:batch.filter(e=>!acknowledged.has(e.eventId)).map(e=>e.eventId)};
}
export function retryDelayMs(attempt:number):number {if(!Number.isSafeInteger(attempt)||attempt<0)throw new Error('Invalid retry attempt.');return Math.min(300000,1000*2**Math.min(attempt,18));}
