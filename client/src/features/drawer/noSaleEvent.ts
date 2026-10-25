import { nanoid } from 'nanoid';
import { withCoordinatedRetailWrite } from '@/features/backup/coordinatedRetailWrite';
import { getActiveBusinessProfileId } from '@/features/business/activeCompany';
import { currentStaffId, activeStaffShift, requirePermission, unlockStaff } from '@/features/staff/staff';
import { db, type TallybookDB } from '@/db/TallybookDB';
import { sameNoSaleRequest, validateNoSaleRequest } from './noSaleEvent.mjs';

export type DrawerReason = 'change_requested'|'cash_check'|'drawer_inspection'|'other';
export interface NoSaleEvent {
 id:string; businessProfileId:string; storeId:string; deviceId:string; staffId:string; shiftId:string;
 operationKey:string; reason:DrawerReason; note:string; createdAt:string; authorizedBy:string;
}
export interface NoSaleEventRequest { staffId:string; pin:string; storeId:string; deviceId:string; operationKey:string; reason:DrawerReason; note?:string }
/** Local operational PIN is not server identity. Hardware drawer actuation is intentionally NOT implemented. */
export async function recordAuthorizedNoSale(request:NoSaleEventRequest,database:TallybookDB=db):Promise<NoSaleEvent> {
 const company=getActiveBusinessProfileId();
 if (!request.pin || typeof request.pin!=='string') throw new Error('Enter your staff PIN to open the drawer.');
 // PIN verification must run BEFORE a Dexie transaction because PBKDF2 is async.
 const unlocked=await unlockStaff(request.staffId,request.pin,database);
 if(unlocked.businessProfileId!==company || currentStaffId(company)!==unlocked.id) throw new Error('Staff authentication changed.');
 return withCoordinatedRetailWrite(() => database.transaction('rw',[
  database.staffMembers,database.staffShifts,database.staffAudits,database.noSaleEvents,
  database.storeLocations,database.storeAssignments,database.syncDevices
 ],async()=>{
  const actor=await requirePermission('sell',database,company);
  if(!actor || actor.id!==unlocked.id || currentStaffId(company)!==actor.id || company!==getActiveBusinessProfileId())
    throw new Error('Authenticated staff session is required.');
  const shift=await activeStaffShift(actor,database);
  if(!shift) throw new Error('Open a staff shift before recording drawer actions.');
  const draft=validateNoSaleRequest({...request,note:request.note??'',staffId:actor.id,shiftId:shift.id});
  const store=await database.storeLocations.get(draft.storeId);
  const assignment=await database.storeAssignments.where('[businessProfileId+staffId+storeId]').equals([company,actor.id,draft.storeId]).first();
  const device=await database.syncDevices.get(draft.deviceId);
  if (!store || store.businessProfileId!==company || store.status!=='active' || !assignment ||
      !device || device.businessProfileId!==company || device.status!=='active')
    throw new Error('Verified shop assignment and locally registered device are required.');
  const matches=await database.noSaleEvents.where('[businessProfileId+operationKey]').equals([company,draft.operationKey]).toArray();
  if(matches.length>1) throw new Error('Duplicate drawer event operation IDs.');
  const candidate:NoSaleEvent={id:nanoid(14),businessProfileId:company,storeId:draft.storeId,deviceId:draft.deviceId,
    staffId:actor.id,shiftId:draft.shiftId,operationKey:draft.operationKey,reason:draft.reason as DrawerReason,
    note:draft.note,createdAt:new Date().toISOString(),authorizedBy:actor.id};
  if(matches.length){
    if(!sameNoSaleRequest(matches[0],candidate)) throw new Error('Operation key is already used for another drawer event.');
    return matches[0];
  }
  if(company!==getActiveBusinessProfileId() || currentStaffId(company)!==actor.id) throw new Error('Company or staff changed during drawer action.');
  await database.noSaleEvents.add(candidate);
  await database.staffAudits.add({id:nanoid(14),businessProfileId:company,staffId:actor.id,action:'drawer.no_sale',
    createdAt:candidate.createdAt,details:`${candidate.id}:${draft.reason}:${draft.storeId}`});
  if(company!==getActiveBusinessProfileId() || currentStaffId(company)!==actor.id) throw new Error('Company or staff changed during drawer action.');
  return candidate;
 }));
}
