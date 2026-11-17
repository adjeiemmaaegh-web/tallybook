import Dexie from 'dexie';
import {afterEach,expect,it,vi} from 'vitest';
import {syncBoundaryFixture,closeSyncFixture} from '@/test/syncBoundaryFixture';
import {lockStaff,unlockStaff} from '@/features/staff/staff';
import {setSyncConsent,enqueueSyncEvent,listPendingSyncEvents} from './syncFoundation';
const fixtures:Awaited<ReturnType<typeof syncBoundaryFixture>>[]=[];
const setup=async()=>{const f=await syncBoundaryFixture();fixtures.push(f);return f;};
afterEach(async()=>{vi.restoreAllMocks();for(const f of fixtures.splice(0))await closeSyncFixture(f);});
it('consent cannot commit after an owner lock during its final write',async()=>{
 const {db}=await setup(),before=await db.syncConsents.toArray(),put=db.syncConsents.put.bind(db.syncConsents);
 vi.spyOn(db.syncConsents,'put').mockImplementationOnce(async value=>{const id=await put(value);lockStaff('primary');return id;});
 await expect(setSyncConsent(db,'primary',false)).rejects.toThrow(/session changed/);
 expect(await db.syncConsents.toArray()).toEqual(before);
});
it('queue metadata and every financial table remain unchanged after a final-write session interruption',async()=>{
 const {db,event}=await setup(),tables=db.tables.filter(t=>t.name!=='appMeta');
 const snapshot=async()=>Promise.all(tables.map(async table=>({name:table.name,rows:await table.toArray()})));
 const before=await snapshot(),add=db.syncOutbox.add.bind(db.syncOutbox);
 vi.spyOn(db.syncOutbox,'add').mockImplementationOnce(async value=>{const id=await add(value);lockStaff('primary');return id;});
 await expect(enqueueSyncEvent(db,{...event,id:'interrupted-event',operationId:'interrupted-operation'})).rejects.toThrow(/session changed/);
 expect(await snapshot()).toEqual(before);
});
it('event metadata is captured before callers can mutate its tenant, device or digest',async()=>{
 const {db,event}=await setup(),approved={...event,id:'approved-event',operationId:'approved-operation'};
 const pending=enqueueSyncEvent(db,approved);
 approved.payloadDigest='b'.repeat(64);approved.deviceId='different-device';
 await pending;
 expect(await db.syncOutbox.get('approved-event')).toMatchObject({deviceId:event.deviceId,payloadDigest:event.payloadDigest});
});
it('a fresh unlock of the same owner cannot inherit in-flight consent approval',async()=>{
 const {db,owner}=await setup(),before=await db.syncConsents.toArray(),request=navigator.locks.request.bind(navigator.locks);
 vi.spyOn(navigator.locks,'request').mockImplementationOnce((async(name:string,options:LockOptions,callback:LockGrantedCallback)=>{
  lockStaff('primary');await unlockStaff(owner.id,'123456',db);return request(name,options,callback);
 }) as typeof navigator.locks.request);
 await expect(setSyncConsent(db,'primary',false)).rejects.toThrow(/session changed/);
 expect(await db.syncConsents.toArray()).toEqual(before);
});
it('a fresh unlock during pending-list authorization cannot inherit the original private read',async()=>{
 const {db,owner}=await setup(),get=db.syncConsents.get.bind(db.syncConsents);
 vi.spyOn(db.syncConsents,'get').mockImplementationOnce(async key=>{
  const row=await get(key);lockStaff('primary');
  await Dexie.waitFor(unlockStaff(owner.id,'123456',db));return row;
 });
 await expect(listPendingSyncEvents(db,'primary')).rejects.toThrow(/session changed/);
});
