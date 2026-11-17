import type { TallybookDB } from '@/db/TallybookDB';
import { getActiveBusinessProfileId } from '@/features/business/activeCompany';
import { currentStaffId, currentStaffSessionGeneration, requirePermission } from '@/features/staff/staff';
import {withCoordinatedRetailWrite} from '@/features/backup/coordinatedRetailWrite';
import {assertRun7RetailWriteReady} from '@/features/backup/run7RetailWriteBarrier.mjs';
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
const QUEUE_IDENTITY_KEYS=['id','businessProfileId','deviceId','operationId','entityType','entityId','payloadDigest','createdAt'] as const;
/** Manual, controlled upload of one existing outbox operation. Not a live auto-sync integration. */
export async function uploadOnePendingOperation(database:TallybookDB, company:string, adapter:CentralUploadAdapter) {
 const actor=currentStaffId(company),generation=currentStaffSessionGeneration(company);
 const scope=()=>{
  if(!actor||getActiveBusinessProfileId()!==company||currentStaffId(company)!==actor||currentStaffSessionGeneration(company)!==generation)
   throw new Error('Company or staff session changed during upload.');
 };
 scope();
 if(getActiveBusinessProfileId()!==company) throw new Error('Company changed before sync.');
 await requirePermission('staff',database,company);
 if((await database.syncConsents.get(company))?.enabled!==true) throw new Error('Synchronization is disabled.');
 const pending=await listPendingSyncEvents(database,company);
 if(!pending.length)return {uploaded:false};
 const event=Object.freeze(structuredClone(pending[0]));
 const prepared=await adapter.prepare(event);
 if(prepared.event.status!=='pending'||!QUEUE_IDENTITY_KEYS.every(key=>prepared.event[key]===event[key]))
   throw new Error('Prepared upload differs from queued operation.');
 assertUploadPayload(event,prepared.sha256);
 await database.transaction('r',[database.appMeta,database.staffMembers,database.syncConsents,database.syncDevices],async()=>{
  await assertRun7RetailWriteReady(database.appMeta);
  const staff=await requirePermission('staff',database,company);
  if(staff?.id!==actor||(await database.syncConsents.get(company))?.enabled!==true)
   throw new Error('Upload authorization or consent changed before transmission.');
  const device=await database.syncDevices.get(event.deviceId);
  if(!device||device.businessProfileId!==company||device.status!=='active')
   throw new Error('Upload device revoked before transmission.');
  scope();
 });
 const receipt=await adapter.send(prepared);
 const acknowledgedAt=verifyCentralReceipt(event,receipt);
 await withCoordinatedRetailWrite(()=>database.transaction('rw',[database.appMeta,database.businessProfiles,database.syncOutbox,database.syncConsents,database.syncDevices,database.staffMembers],async()=>{
  await assertRun7RetailWriteReady(database.appMeta);
  const staff=await requirePermission('staff',database,company);
  if(staff?.id!==actor)throw new Error('Upload actor changed before acknowledgment.');
  if(getActiveBusinessProfileId()!==company || (await database.syncConsents.get(company))?.enabled!==true)
    throw new Error('Company changed or synchronization disabled before acknowledgment.');
  const device=await database.syncDevices.get(event.deviceId);
  if(!device || device.businessProfileId!==company || device.status!=='active')
    throw new Error('Device revoked; central receipt must be reconciled manually.');
  const current=await database.syncOutbox.get(event.id);
  if(!current || !QUEUE_IDENTITY_KEYS.every(key=>current[key]===event[key]))
    throw new Error('Local outbox operation changed after upload.');
  scope();
  if(current.status==='acknowledged') return;
  if(current.status!=='pending')throw new Error('Unknown sync state.');
  await database.syncOutbox.update(event.id,{status:'acknowledged',acknowledgedAt});
 }));
 return {uploaded:true,operationId:event.operationId,acknowledgedAt};
}
