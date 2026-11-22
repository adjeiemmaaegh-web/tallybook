import {afterEach,expect,it,vi} from 'vitest';
import {syncBoundaryFixture,closeSyncFixture} from '@/test/syncBoundaryFixture';
import {lockStaff,unlockStaff} from '@/features/staff/staff';
import {RESTORE_JOURNAL_KEY} from '@/features/backup/restoreJournal.mjs';
import {inspectRemoteClaim,listUnresolvedSyncConflicts} from './reconciliation';
const fixtures:Awaited<ReturnType<typeof syncBoundaryFixture>>[]=[];
const setup=async()=>{const f=await syncBoundaryFixture();fixtures.push(f);return f;};
afterEach(async()=>{vi.restoreAllMocks();for(const f of fixtures.splice(0))await closeSyncFixture(f);});
it('quarantines unknown metadata once without applying any financial or inventory change',async()=>{
 const {db,event}=await setup(),tables=db.tables.filter(t=>t.name!=='syncConflicts');
 const snapshot=async()=>Promise.all(tables.map(async table=>({name:table.name,rows:await table.toArray()})));
 const before=await snapshot(),claim={...event,id:'unknown-event',operationId:'unknown-operation'};
 expect(await inspectRemoteClaim(db,claim)).toBe('unknown-event');
 expect(await inspectRemoteClaim(db,claim)).toBe('unknown-event');
 expect(await listUnresolvedSyncConflicts(db,'primary')).toHaveLength(1);
 expect(await snapshot()).toEqual(before);
});
it('rolls back the conflict record if the inspector locks during the final write',async()=>{
 const {db,event}=await setup(),add=db.syncConflicts.add.bind(db.syncConflicts);
 vi.spyOn(db.syncConflicts,'add').mockImplementationOnce(async row=>{const id=await add(row);lockStaff('primary');return id;});
 await expect(inspectRemoteClaim(db,{...event,id:'unknown-event'})).rejects.toThrow(/session changed/);
 expect(await db.syncConflicts.count()).toBe(0);
});
it('preserves the exact claim inspected before asynchronous authorization',async()=>{
 const {db,event}=await setup(),claim={...event};
 const pending=inspectRemoteClaim(db,claim);claim.payloadDigest='b'.repeat(64);
 expect(await pending).toBe('identical');expect(await db.syncConflicts.count()).toBe(0);
});
it('recovery evidence prevents both conflict writes and private conflict reads',async()=>{
 const {db,event}=await setup();
 await db.appMeta.put({key:RESTORE_JOURNAL_KEY,value:'interrupted isolated restore',updatedAt:new Date().toISOString()});
 await expect(inspectRemoteClaim(db,{...event,id:'unknown-event'})).rejects.toThrow(/requires recovery/);
 await expect(listUnresolvedSyncConflicts(db,'primary')).rejects.toThrow(/requires recovery/);
 expect(await db.syncConflicts.count()).toBe(0);
});
it('same-owner re-unlock cannot inherit an in-flight conflict-inspection approval',async()=>{
 const {db,event,owner}=await setup(),request=navigator.locks.request.bind(navigator.locks);
 vi.spyOn(navigator.locks,'request').mockImplementationOnce((async(name:string,options:LockOptions,callback:LockGrantedCallback)=>{
  lockStaff('primary');await unlockStaff(owner.id,'123456',db);return request(name,options,callback);
 }) as typeof navigator.locks.request);
 await expect(inspectRemoteClaim(db,{...event,id:'unknown-event'})).rejects.toThrow(/session changed/);
 expect(await db.syncConflicts.count()).toBe(0);
});
