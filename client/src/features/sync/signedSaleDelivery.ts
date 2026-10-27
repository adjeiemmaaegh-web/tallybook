/** Explicit, opt-in sale upload. The immutable local sale event is the durable
 * source; outbox metadata can be reconstructed after a crash or restore.
 */
import type {TallybookDB} from '@/db/TallybookDB';
import {currentStaffId} from '@/features/staff/staff';
import {validateCentralSaleEvent, type CentralSaleEvent} from './centralSaleEvent';
import {enqueueSyncEvent, type SyncOutboxEvent} from './syncFoundation';
import {signLocalSaleEvent} from './signedSaleEnvelope';
import type {CentralUploadAdapter, PreparedUpload, ServerOperationReceipt} from './supabaseUploader.ts';

const ID=/^[A-Za-z0-9:_-]{1,128}$/;
async function digest(event:CentralSaleEvent,subtle:SubtleCrypto):Promise<string> {
  const bytes=new TextEncoder().encode(JSON.stringify(event));
  const hash=new Uint8Array(await subtle.digest('SHA-256',bytes as BufferSource));
  return Array.from(hash,b=>b.toString(16).padStart(2,'0')).join('');
}
export function validateSignedSaleEndpoint(endpoint:string):string {
  let url:URL;
  try {url=new URL(endpoint);} catch {throw Error('Invalid signed sale endpoint.');}
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||
     url.pathname!=='/api/central/sales'||url.origin==='null')
    throw Error('Signed sale upload requires the HTTPS central endpoint.');
  return url.href;
}

/** Rebuild a missing metadata outbox row from the already committed sale.
 * Only the currently unlocked staff member may claim their own local event.
 */
export async function queueSignedLocalSale(db:TallybookDB,businessProfileId:string,
  eventId:string,deviceId:string,subtle:SubtleCrypto=globalThis.crypto.subtle):Promise<SyncOutboxEvent> {
  if(![businessProfileId,eventId,deviceId].every(id=>ID.test(id)))throw Error('Invalid sale queue scope.');
  const event=await db.centralSaleEvents.get(eventId);
  if(!event||event.businessProfileId!==businessProfileId||event.staffId!==currentStaffId(businessProfileId)||
     !event.shopId)throw Error('Sale cannot be queued by this staff member.');
  validateCentralSaleEvent(event);
  const payloadDigest=await digest(event,subtle);
  const queued:SyncOutboxEvent={id:event.id,businessProfileId,deviceId,
    operationId:event.operationId,entityType:'sale',entityId:event.entityId,
    payloadDigest,createdAt:event.createdAt,status:'pending'};
  const existing=await db.syncOutbox.get(event.id);
  if(existing){
    if(existing.businessProfileId!==businessProfileId||existing.deviceId!==deviceId||
       existing.operationId!==event.operationId||existing.entityType!=='sale'||
       existing.entityId!==event.entityId||existing.payloadDigest!==payloadDigest)
      throw Error('Existing sale queue differs from immutable evidence.');
    return existing;
  }
  await enqueueSyncEvent(db,queued);
  return queued;
}

export function createSignedSaleUploadAdapter({database,deviceId,privateKey,endpoint,accessToken,
  subtle=globalThis.crypto.subtle,transport=fetch}:{database:TallybookDB;deviceId:string;
  privateKey:CryptoKey;endpoint:string;accessToken:string;subtle?:SubtleCrypto;
  transport?:(url:string,init:RequestInit)=>Promise<Response>}):CentralUploadAdapter {
  const url=validateSignedSaleEndpoint(endpoint);
  if(!ID.test(deviceId)||typeof accessToken!=='string'||
     !/^[A-Za-z0-9._~-]{20,16384}$/.test(accessToken))throw Error('Invalid sale upload identity.');
  return {
    async prepare(item):Promise<PreparedUpload> {
      if(item.entityType!=='sale'||item.deviceId!==deviceId||
         item.status!=='pending')throw Error('Not a pending sale upload.');
      const event=await database.centralSaleEvents.get(item.id);
      if(!event||event.businessProfileId!==item.businessProfileId||
         event.operationId!==item.operationId||event.entityId!==item.entityId||
         event.staffId!==currentStaffId(item.businessProfileId)||!event.shopId)
        throw Error('Local sale provenance does not match the queue.');
      validateCentralSaleEvent(event);
      const sha256=await digest(event,subtle);
      if(sha256!==item.payloadDigest)throw Error('Local sale payload changed after queueing.');
      return {event:item,immutablePayload:event,sha256};
    },
    async send(upload):Promise<ServerOperationReceipt> {
      const event=upload.immutablePayload as CentralSaleEvent;
      if(await digest(event,subtle)!==upload.sha256||upload.event.deviceId!==deviceId||
         event.staffId!==currentStaffId(event.businessProfileId))
        throw Error('Sale upload changed before transmission.');
      const envelope=await signLocalSaleEvent(event,deviceId,privateKey,subtle);
      const response=await transport(url,{method:'POST',mode:'cors',redirect:'error',
        cache:'no-store',credentials:'omit',headers:{'content-type':'application/json',
          authorization:`Bearer ${accessToken}`},body:JSON.stringify({envelope})});
      if(response.status!==200||response.redirected||response.type==='opaque'||response.url!==url||
         !/^application\/json(?:\s*;|\s*$)/i.test(response.headers.get('content-type')??''))
        throw Error('Untrusted signed sale response; queue remains pending.');
      const raw=await response.text();
      if(raw.length>2048)throw Error('Oversized sale receipt.');
      let receipt:ServerOperationReceipt;
      try{receipt=JSON.parse(raw) as ServerOperationReceipt;}catch{throw Error('Invalid sale receipt.');}
      return receipt;
    },
  };
}
