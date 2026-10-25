import type { TallybookDB } from '@/db/TallybookDB';
import { getActiveBusinessProfileId } from '@/features/business/activeCompany';
import { requirePermission } from '@/features/staff/staff';
import { listPendingSyncEvents, type SyncOutboxEvent } from './syncFoundation';
import { assertUploadPayload, verifyCentralReceipt } from './supabaseUploader.mjs';

export interface ServerOperationReceipt {
 businessId:string; deviceId:string; operationId:string; payloadDigest:string;
 receivedAtUtc:string; status:'accepted'|'rejected';
}
export interface PreparedUpload { event:SyncOutboxEvent; immutablePayload:unknown; sha256:string }
export interface CentralUploadAdapter {
 /** Must reconstruct the already persisted immutable operation and validate digest. */
 prepare(event:SyncOutboxEvent):Promise<PreparedUpload>;
 /** Calls a trusted ingestion endpoint; transport itself is NOT supplied by this module. */
 send(upload:PreparedUpload):Promise<ServerOperationReceipt>;
}
/** Manual, controlled upload of one existing outbox operation. Not a live auto-sync integration. */
export async function uploadOnePendingOperation(database:TallybookDB, company:string, adapter:CentralUploadAdapter) {
 if(getActiveBusinessProfileId()!==company) throw new Error('Company changed before sync.');
 await requirePermission('staff',database,company);
 if((await database.syncConsents.get(company))?.enabled!==true) throw new Error('Synchronization is disabled.');
 const pending=await listPendingSyncEvents(database,company);
 const event=pending[0];if(!event)return {uploaded:false};
 const prepared=await adapter.prepare(event);
 if(prepared.event.id!==event.id || prepared.event.operationId!==event.operationId ||
    prepared.event.businessProfileId!==company || prepared.event.deviceId!==event.deviceId)
   throw new Error('Prepared upload differs from queued operation.');
 assertUploadPayload(event,prepared.sha256);
 if(getActiveBusinessProfileId()!==company) throw new Error('Company changed during sync.');
 const receipt=await adapter.send(prepared);
 const acknowledgedAt=verifyCentralReceipt(event,receipt);
 await database.transaction('rw',[database.syncOutbox,database.syncConsents,database.syncDevices,database.staffMembers],async()=>{
  await requirePermission('staff',database,company);
  if(getActiveBusinessProfileId()!==company || (await database.syncConsents.get(company))?.enabled!==true)
    throw new Error('Company changed or synchronization disabled before acknowledgment.');
  const device=await database.syncDevices.get(event.deviceId);
  if(!device || device.businessProfileId!==company || device.status!=='active')
    throw new Error('Device revoked; central receipt must be reconciled manually.');
  const current=await database.syncOutbox.get(event.id);
  if(!current || current.operationId!==event.operationId || current.payloadDigest!==event.payloadDigest)
    throw new Error('Local outbox operation changed after upload.');
  if(current.status==='acknowledged') return;
  if(current.status!=='pending')throw new Error('Unknown sync state.');
  await database.syncOutbox.update(event.id,{status:'acknowledged',acknowledgedAt});
 });
 return {uploaded:true,operationId:event.operationId,acknowledgedAt};
}
