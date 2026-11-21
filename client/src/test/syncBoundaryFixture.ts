import Dexie from 'dexie';
import {TallybookDB,initializeDatabase} from '@/db/TallybookDB';
import {setActiveBusinessProfileId} from '@/features/business/activeCompany';
import {saveBusinessProfile} from '@/features/business/businessProfile';
import {createStaff,unlockStaff,lockStaff} from '@/features/staff/staff';
import {setSyncConsent,enqueueSyncEvent,type SyncOutboxEvent} from '@/features/sync/syncFoundation';
import {registerLocalSyncDevice} from '@/features/sync/deviceRegistry';
export async function syncBoundaryFixture(){
  setActiveBusinessProfileId('primary');
  const db=new TallybookDB(`sync-boundary-${crypto.randomUUID()}`);await initializeDatabase(db);
  await saveBusinessProfile({name:'Sync boundary fixture',country:'Ghana',currency:'GHS',businessType:'Retail shop'},db);
  const owner=await createStaff('Sync owner','owner','123456',db);await unlockStaff(owner.id,'123456',db);
  await setSyncConsent(db,'primary',true);
  const device=await registerLocalSyncDevice(db,'primary','fixture-device','Test device');
  const event:SyncOutboxEvent={id:'fixture-event',businessProfileId:'primary',deviceId:device.id,
    operationId:'fixture-operation',entityType:'sale',entityId:'fixture-sale',payloadDigest:'a'.repeat(64),
    createdAt:new Date().toISOString(),status:'pending'};
  await enqueueSyncEvent(db,event);
  const receipt={organizationId:'primary',eventId:event.id,operationId:event.operationId,
    status:'stored' as const,reason:null,financialReplicationEnabled:false as const};
  return {db,owner,device,event,receipt};
}
export async function closeSyncFixture(fixture:Awaited<ReturnType<typeof syncBoundaryFixture>>){
  lockStaff('primary');setActiveBusinessProfileId('primary');fixture.db.close();await new Dexie(fixture.db.name).delete();
}
