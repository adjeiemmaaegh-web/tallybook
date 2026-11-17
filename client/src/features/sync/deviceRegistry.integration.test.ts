import {afterEach,expect,it,vi} from 'vitest';
import {syncBoundaryFixture,closeSyncFixture} from '@/test/syncBoundaryFixture';
import {registerLocalSyncDevice,revokeLocalSyncDevice} from './deviceRegistry';
import {RESTORE_JOURNAL_KEY} from '@/features/backup/restoreJournal.mjs';
import {lockStaff} from '@/features/staff/staff';
import {setActiveBusinessProfileId} from '@/features/business/activeCompany';
const fixtures:Awaited<ReturnType<typeof syncBoundaryFixture>>[]=[];
const setup=async()=>{const f=await syncBoundaryFixture();fixtures.push(f);return f;};
afterEach(async()=>{vi.restoreAllMocks();for(const f of fixtures.splice(0))await closeSyncFixture(f);});
it('blocks registration and revocation while interrupted recovery evidence exists',async()=>{
 const {db,device}=await setup();const before=await db.syncDevices.toArray();
 await db.appMeta.put({key:RESTORE_JOURNAL_KEY,value:'unrecovered test marker',updatedAt:new Date().toISOString()});
 await expect(registerLocalSyncDevice(db,'primary','new-device','New device')).rejects.toThrow(/requires recovery/);
 await expect(revokeLocalSyncDevice(db,'primary',device.id)).rejects.toThrow(/requires recovery/);
 expect(await db.syncDevices.toArray()).toEqual(before);
 // Simulate completed recovery in this isolated fixture; ordinary services never remove the marker.
 await db.appMeta.delete(RESTORE_JOURNAL_KEY);
 expect((await registerLocalSyncDevice(db,'primary','new-device','New device')).status).toBe('active');
 await revokeLocalSyncDevice(db,'primary',device.id);
 expect((await db.syncDevices.get(device.id))?.status).toBe('revoked');
});
it('cannot register or revoke after lock or company switch',async()=>{
 const {db,device}=await setup();const before=await db.syncDevices.toArray();
 lockStaff('primary');
 await expect(registerLocalSyncDevice(db,'primary','new-device','New device')).rejects.toThrow();
 await expect(revokeLocalSyncDevice(db,'primary',device.id)).rejects.toThrow();
 setActiveBusinessProfileId('different-company');
 await expect(revokeLocalSyncDevice(db,'primary',device.id)).rejects.toThrow();
 expect(await db.syncDevices.toArray()).toEqual(before);
});
it('a session change during the final device read rejects revocation without a write',async()=>{
 const {db,device}=await setup();const get=db.syncDevices.get.bind(db.syncDevices);
 vi.spyOn(db.syncDevices,'get').mockImplementationOnce(async key=>{const row=await get(key);lockStaff('primary');return row;});
 await expect(revokeLocalSyncDevice(db,'primary',device.id)).rejects.toThrow(/session/);
 expect((await get(device.id))?.status).toBe('active');
});
