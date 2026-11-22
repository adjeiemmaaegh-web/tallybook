import {jsonResponseFixture} from "@/test/httpResponseFixture";
/** Real local records with injected transport only; no live replication/provider claim. */
import {afterEach,expect,it,vi} from 'vitest';
import {syncBoundaryFixture,closeSyncFixture} from '@/test/syncBoundaryFixture';
import {acknowledgeStagedEvent} from './outboxAcknowledgements';
import {deliverPendingOutboxEvent} from './outboxDelivery';
import {uploadOnePendingOperation,type CentralUploadAdapter} from './supabaseUploader.ts';
import {lockStaff,unlockStaff} from '@/features/staff/staff';
import {setActiveBusinessProfileId} from '@/features/business/activeCompany';
import {RESTORE_JOURNAL_KEY} from '@/features/backup/restoreJournal.mjs';
const fixtures:Awaited<ReturnType<typeof syncBoundaryFixture>>[]=[];
const setup=async()=>{const f=await syncBoundaryFixture();fixtures.push(f);return f;};
afterEach(async()=>{vi.restoreAllMocks();for(const f of fixtures.splice(0))await closeSyncFixture(f);});
const endpoint='https://fixture.invalid/api/sync/events/stage';
const credentials={capability:'abc.def',session:'ghi.jkl'};
it('acknowledges a matching staged receipt once without modifying business records',async()=>{
 const f=await setup();
 const transport=vi.fn(async()=>jsonResponseFixture(endpoint,f.receipt,201));
 expect(await deliverPendingOutboxEvent(f.db,'primary',f.event.id,endpoint,credentials,transport)).toBe('acknowledged');
 const acknowledged=await f.db.syncOutbox.get(f.event.id);
 expect(await acknowledgeStagedEvent(f.db,'primary',f.event.id,f.receipt)).toBe('already-acknowledged');
 expect(await f.db.syncOutbox.get(f.event.id)).toEqual(acknowledged);
 expect(transport).toHaveBeenCalledTimes(1);
 expect(await Promise.all([f.db.sales.count(),f.db.payments.count(),f.db.purchases.count(),f.db.inventoryMovements.count()])).toEqual([0,0,0,0]);
});
it('locked or switched staff cannot transmit metadata or acknowledge it',async()=>{
 const f=await setup();const transport=vi.fn();lockStaff('primary');
 await expect(deliverPendingOutboxEvent(f.db,'primary',f.event.id,endpoint,credentials,transport)).rejects.toThrow();
 await expect(acknowledgeStagedEvent(f.db,'primary',f.event.id,f.receipt)).rejects.toThrow();
 setActiveBusinessProfileId('foreign-company');
 await expect(acknowledgeStagedEvent(f.db,'primary',f.event.id,f.receipt)).rejects.toThrow();
 expect(transport).not.toHaveBeenCalled();expect(await f.db.syncOutbox.get(f.event.id)).toEqual(f.event);
});
it('recovery evidence blocks metadata delivery and acknowledgement with no false success',async()=>{
 const f=await setup();const transport=vi.fn();
 await f.db.appMeta.put({key:RESTORE_JOURNAL_KEY,value:'interrupted fixture recovery',updatedAt:new Date().toISOString()});
 await expect(deliverPendingOutboxEvent(f.db,'primary',f.event.id,endpoint,credentials,transport)).rejects.toThrow(/requires recovery/);
 await expect(acknowledgeStagedEvent(f.db,'primary',f.event.id,f.receipt)).rejects.toThrow(/requires recovery/);
 expect(transport).not.toHaveBeenCalled();expect(await f.db.syncOutbox.get(f.event.id)).toEqual(f.event);
});
it('a session change during acknowledgement leaves the event pending',async()=>{
 const f=await setup();const get=f.db.syncOutbox.get.bind(f.db.syncOutbox);
 vi.spyOn(f.db.syncOutbox,'get').mockImplementationOnce(async key=>{const row=await get(key);lockStaff('primary');return row;});
 await expect(acknowledgeStagedEvent(f.db,'primary',f.event.id,f.receipt)).rejects.toThrow(/session/);
 expect(await get(f.event.id)).toEqual(f.event);
});
it('central receipt acknowledgement rechecks every immutable local scope field after transport',async()=>{
 const f=await setup();
 for(const mutation of [{businessProfileId:'foreign-company'},{deviceId:'different-device'},
   {entityType:'purchase'},{entityId:'different-sale'},{createdAt:new Date(Date.now()+1000).toISOString()}]){
   const changed={...f.event,...mutation};
   const adapter:CentralUploadAdapter={
     prepare:async event=>({event,sha256:event.payloadDigest,immutablePayload:{synthetic:true}}),
     send:async()=>{
       await f.db.syncOutbox.put(changed);
       return {businessId:'primary',deviceId:f.device.id,operationId:f.event.operationId,
         payloadDigest:f.event.payloadDigest,receivedAtUtc:new Date().toISOString(),status:'accepted'};
     },
   };
   await expect(uploadOnePendingOperation(f.db,'primary',adapter)).rejects.toThrow(/operation changed/);
   expect(await f.db.syncOutbox.get(f.event.id)).toEqual(changed);
   await f.db.syncOutbox.put(f.event);
 }
 const accepted:CentralUploadAdapter={prepare:async event=>({event,sha256:event.payloadDigest,immutablePayload:{synthetic:true}}),
   send:async()=>({businessId:'primary',deviceId:f.device.id,operationId:f.event.operationId,
     payloadDigest:f.event.payloadDigest,receivedAtUtc:new Date().toISOString(),status:'accepted'})};
 expect((await uploadOnePendingOperation(f.db,'primary',accepted)).uploaded).toBe(true);
 expect((await uploadOnePendingOperation(f.db,'primary',accepted)).uploaded).toBe(false);
});
it('recovery beginning during an upload prevents late acknowledgement',async()=>{
 const f=await setup();
 const adapter:CentralUploadAdapter={prepare:async event=>({event,sha256:event.payloadDigest,immutablePayload:{synthetic:true}}),
   send:async()=>{
     await f.db.appMeta.put({key:RESTORE_JOURNAL_KEY,value:'recovery began during transport',updatedAt:new Date().toISOString()});
     return {businessId:'primary',deviceId:f.device.id,operationId:f.event.operationId,
       payloadDigest:f.event.payloadDigest,receivedAtUtc:new Date().toISOString(),status:'accepted'};
   }};
 await expect(uploadOnePendingOperation(f.db,'primary',adapter)).rejects.toThrow(/requires recovery/);
 expect(await f.db.syncOutbox.get(f.event.id)).toEqual(f.event);
});
it('does not acknowledge a replacement payload using the original metadata-only receipt',async()=>{
 const f=await setup();
 const transport=async()=>{
   await f.db.syncOutbox.update(f.event.id,{payloadDigest:'b'.repeat(64)});
   return jsonResponseFixture(endpoint,f.receipt,201);
 };
 await expect(deliverPendingOutboxEvent(f.db,'primary',f.event.id,endpoint,credentials,transport)).rejects.toThrow(/Outbox changed/);
 expect(await f.db.syncOutbox.get(f.event.id)).toMatchObject({status:'pending',payloadDigest:'b'.repeat(64)});
});
it('consent withdrawn during preparation prevents transmission',async()=>{
 const f=await setup();const send=vi.fn();
 const adapter:CentralUploadAdapter={prepare:async event=>{
   await f.db.syncConsents.update('primary',{enabled:false});
   return {event,sha256:event.payloadDigest,immutablePayload:{synthetic:true}};
 },send};
 await expect(uploadOnePendingOperation(f.db,'primary',adapter)).rejects.toThrow(/consent changed/);
 expect(send).not.toHaveBeenCalled();expect(await f.db.syncOutbox.get(f.event.id)).toEqual(f.event);
});

it('an oversized chunked metadata response leaves the exact event pending and every financial row untouched',async()=>{
 const f=await setup();let cancelled=false;
 const response=new Response(new ReadableStream<Uint8Array>({pull(controller){controller.enqueue(new Uint8Array(4096));},cancel(){cancelled=true;}}),{status:201,headers:{'content-type':'application/json'}});
 Object.defineProperty(response,'url',{value:endpoint});
 await expect(deliverPendingOutboxEvent(f.db,'primary',f.event.id,endpoint,credentials,async()=>response)).rejects.toThrow(/Oversized/);
 expect(cancelled).toBe(true);expect(await f.db.syncOutbox.get(f.event.id)).toEqual(f.event);
 expect(await Promise.all([f.db.sales.count(),f.db.payments.count(),f.db.purchases.count(),f.db.inventoryMovements.count()])).toEqual([0,0,0,0]);
});
it('a fresh unlock of the same employee cannot acknowledge an operation begun by the prior session',async()=>{
 const f=await setup();
 const transport=async()=>{lockStaff('primary');await unlockStaff(f.owner.id,'123456',f.db);return jsonResponseFixture(endpoint,f.receipt,201);};
 await expect(deliverPendingOutboxEvent(f.db,'primary',f.event.id,endpoint,credentials,transport)).rejects.toThrow(/session changed/);
 expect(await f.db.syncOutbox.get(f.event.id)).toEqual(f.event);
 const adapter:CentralUploadAdapter={prepare:async event=>({event,sha256:event.payloadDigest,immutablePayload:{synthetic:true}}),send:async()=>{
  lockStaff('primary');await unlockStaff(f.owner.id,'123456',f.db);
  return {businessId:'primary',deviceId:f.device.id,operationId:f.event.operationId,payloadDigest:f.event.payloadDigest,receivedAtUtc:new Date().toISOString(),status:'accepted'};
 }};
 await expect(uploadOnePendingOperation(f.db,'primary',adapter)).rejects.toThrow(/session changed/);
 expect(await f.db.syncOutbox.get(f.event.id)).toEqual(f.event);
});
