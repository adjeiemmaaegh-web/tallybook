/** Device-local quarantine for signed QA cloud sale claims. These rows never
 * participate in local sales, stock, receivables, or financial reports. */
import {db, type TallybookDB} from '@/db/TallybookDB';
import {getActiveBusinessProfileId} from '@/features/business/activeCompany';
import {currentStaffId, requirePermission} from '@/features/staff/staff';
import {withCoordinatedRetailWrite} from '@/features/backup/coordinatedRetailWrite';
import {assertRun7RetailWriteReady} from '@/features/backup/run7RetailWriteBarrier.mjs';
import {fetchQaSaleClaims} from './qaSaleClaimsClient';
import {loadActiveDeviceKey,type DeviceKeyScope} from './deviceKeyVault';
import {verifiedDeviceKeyGuards} from './verifiedDeviceKeyScope';
import type {QaSaleEvent} from './qaSalePageBoundary.mjs';

export interface QaSaleClaimRecord extends QaSaleEvent {
  id:string;
  businessProfileId:string;
  cloudCompanyId:string;
  deviceId:string;
  financialApplied:false;
  quarantinedAt:string;
}
export interface QaSaleClaimCursor {
  id:string;
  businessProfileId:string;
  cloudCompanyId:string;
  deviceId:string;
  storeId:string;
  afterUtc:string;
  afterOperationId:string;
}
const START='1970-01-01T00:00:00.000Z';

/** Fetch one signed page and commit its claims and cursor together. The
 * enrolled, nonextractable key is loaded from its exact local/cloud scope. */
export async function pullQaSaleClaimsToQuarantine(
  scope:DeviceKeyScope,
  database:TallybookDB=db
):Promise<{received:number;hasMore:boolean}> {
  const company=getActiveBusinessProfileId();
  if(scope.localCompanyId!==company)throw Error('QA device belongs to another local company.');
  const actor=await requirePermission('reports',database,company);
  if(!actor || currentStaffId(company)!==actor.id || scope.staffId!==actor.id)
    throw Error('An unlocked authorized staff member is required for QA cloud claims.');
  const {resolveUserId,currentLocalScope}=verifiedDeviceKeyGuards(scope);
  const activeDevicePrivateKey=await loadActiveDeviceKey(scope,resolveUserId,currentLocalScope);
  const cloudCompanyId=scope.cloudCompanyId,deviceId=scope.deviceId;
  const id=JSON.stringify([company,cloudCompanyId,deviceId]);
  const previous=await database.qaSaleClaimCursors.get(id);
  if(previous && (previous.businessProfileId!==company ||
    previous.cloudCompanyId!==cloudCompanyId || previous.deviceId!==deviceId))
    throw Error('QA cloud cursor scope is inconsistent.');
  const page=await fetchQaSaleClaims({companyId:cloudCompanyId,deviceId,
    afterUtc:previous?.afterUtc??START,
    afterOperationId:previous?.afterOperationId??''},activeDevicePrivateKey);
  if(page.storeId!==scope.shopId)throw Error('QA claim store differs from enrolled shop.');
  if(previous && previous.storeId!==page.storeId)
    throw Error('QA device store changed. Review its enrollment before continuing.');
  if(company!==getActiveBusinessProfileId() || currentStaffId(company)!==actor.id)
    throw Error('Company or staff session changed during QA cloud read.');
  await withCoordinatedRetailWrite(()=>database.transaction('rw',[
    database.appMeta,database.qaSaleClaimInbox,database.qaSaleClaimCursors,
    database.staffMembers,database.businessProfiles
  ],async()=>{
    await assertRun7RetailWriteReady(database.appMeta);
    const current=await database.qaSaleClaimCursors.get(id);
    if((current?.afterUtc??START)!==(previous?.afterUtc??START) ||
      (current?.afterOperationId??'')!==(previous?.afterOperationId??''))
      throw Error('Another QA pull advanced this cursor. Retry the read.');
    if(company!==getActiveBusinessProfileId() || currentStaffId(company)!==actor.id)
      throw Error('Company or staff session changed before QA claims were stored.');
    const authorized=await requirePermission('reports',database,company);
    if(authorized?.id!==actor.id)throw Error('QA claim read permission changed.');
    const quarantinedAt=new Date().toISOString();
    for(const event of page.events){
      const claimId=JSON.stringify([company,cloudCompanyId,event.operationId]);
      const existing=await database.qaSaleClaimInbox.get(claimId);
      if(existing)throw Error('A QA claim was already received at a different cursor. Review the duplicate.');
      await database.qaSaleClaimInbox.add({...event,id:claimId,
        businessProfileId:company,cloudCompanyId,deviceId,
        financialApplied:false,quarantinedAt});
    }
    if(page.events.length){
      await database.qaSaleClaimCursors.put({id,businessProfileId:company,
        cloudCompanyId,deviceId,storeId:page.storeId,
        afterUtc:page.nextReceivedAtUtc!,afterOperationId:page.nextOperationId!});
    }
  }));
  return {received:page.events.length,hasMore:page.hasMore};
}
