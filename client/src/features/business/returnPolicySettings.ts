import {nanoid} from 'nanoid';
import {db,type TallybookDB} from '@/db/TallybookDB';
import {getActiveBusinessProfileId} from '@/features/business/activeCompany';
import {requirePermission} from '@/features/staff/staff';
import {withCoordinatedRetailWrite} from '@/features/backup/coordinatedRetailWrite';
import {assertRun7RetailWriteReady} from '@/features/backup/run7RetailWriteBarrier.mjs';
import {appendCompanyReturnPolicy,currentCompanyReturnPolicy,
 type ReturnPolicySettings,type ReturnPolicySnapshot,
 type ReturnPolicyRevision} from './returnPolicy.mjs';

/** Owner-governed local policy change. Existing sales and refunds are never
 * rewritten. The company profile, revision append and staff audit commit in
 * the same IndexedDB transaction as the policy decision.
 */
export async function updateCompanyReturnPolicy(settings:ReturnPolicySettings,
 reason:string,database:TallybookDB=db):Promise<ReturnPolicySnapshot>{
 const company=getActiveBusinessProfileId();
 return withCoordinatedRetailWrite(()=>database.transaction('rw',[
  database.appMeta,database.businessProfiles,database.staffMembers,database.staffAudits
 ],async()=>{
  await assertRun7RetailWriteReady(database.appMeta);
  const actor=await requirePermission('staff',database,company);
  if(actor&&actor.role!=='owner')
   throw new Error('Only the company owner can change the refund policy.');
  if(getActiveBusinessProfileId()!==company)
   throw new Error('Company changed before return policy authorization.');
  const profile=await database.businessProfiles.get(company);
  if(!profile)throw new Error('Set up the company before changing its return policy.');
  const now=new Date().toISOString();
  const history=appendCompanyReturnPolicy(profile.returnPolicyHistory,
   settings,now,reason,actor?.id) as ReturnPolicyRevision[];
  const next=history.at(-1)!;
  if(getActiveBusinessProfileId()!==company)
   throw new Error('Company changed during return policy authorization.');
  await database.businessProfiles.put({...profile,
   returnPolicyHistory:history,updatedAt:now});
  if(actor){
   await database.staffAudits.add({
    id:nanoid(14),businessProfileId:company,staffId:actor.id,
    action:'return.policy.updated',createdAt:now,
    details:JSON.stringify({revision:next.revision,enabled:next.enabled,
     allowFullReversal:next.allowFullReversal,
     allowCashPartial:next.allowCashPartial,maxAgeDays:next.maxAgeDays})
   });
  }
  if(getActiveBusinessProfileId()!==company)
   throw new Error('Company changed before the new refund policy was committed.');
  return currentCompanyReturnPolicy(history);
 }));
}
