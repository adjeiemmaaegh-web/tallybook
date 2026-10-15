/** Run 3 opt-in cloud membership client. Never authorizes local company data.
 * All actions use bearer auth verified anew in the private server transaction.
 */
import {getSupabaseClient} from '@/lib/supabase';
export type Run3Member={companyId:string;userId:string;role:'owner'|'attendant';status:'active'};
async function call(action:string,body:Record<string,string>){
  if(typeof window==='undefined'||window.location.protocol!=='https:')
    throw Error('Secure online account required for cloud invitations.');
  const client=getSupabaseClient();
  const {data:identity,error:userError}=await client.auth.getUser();
  const {data:sessionData,error:sessionError}=await client.auth.getSession();
  const auth=sessionData.session;
  if(userError||sessionError||!identity.user||!auth||
     auth.user.id!==identity.user.id||
     !Number.isSafeInteger(auth.expires_at)||auth.expires_at!*1000<=Date.now())
    throw Error('Your account session changed. Sign in again.');
  const res=await fetch('/api/run3/membership/'+action,{
    method:'POST',credentials:'omit',cache:'no-store',
    headers:{'Content-Type':'application/json',
      Authorization:'Bearer '+auth.access_token},
    body:JSON.stringify(body)
  });
  if(!res.ok)throw Error('Cloud membership operation was denied or unavailable.');
  const result:unknown=await res.json();
  if(!result||typeof result!=='object'||Array.isArray(result))
    throw Error('Invalid cloud membership response.');
  return result as Record<string,unknown>;
}
export async function inviteCloudAttendant(companyId:string,targetUserId:string){
  const r=await call('invite',{companyId,targetUserId});
  if(r.companyId!==companyId||r.targetUserId!==targetUserId||
    typeof r.inviteToken!=='string'||typeof r.invitationId!=='string')
    throw Error('Invitation response did not match the selected company.');
  return {inviteToken:r.inviteToken,invitationId:r.invitationId};
}
export async function acceptCloudInvitation(inviteToken:string){
  const r=await call('accept',{inviteToken});
  if(r.role!=='attendant'||typeof r.companyId!=='string'||
    typeof r.userId!=='string')throw Error('Membership receipt invalid.');
  return {companyId:r.companyId,userId:r.userId};
}
export async function revokeCloudAttendant(companyId:string,targetUserId:string){
  const r=await call('revokeMember',{companyId,targetUserId});
  if(r.companyId!==companyId||r.targetUserId!==targetUserId||r.revoked!==true)
    throw Error('Revocation receipt invalid.');
}
export async function revokeCloudInvitation(companyId:string,invitationId:string){
  const r=await call('revokeInvite',{companyId,invitationId});
  if(r.invitationId!==invitationId||r.revoked!==true)
    throw Error('Invitation revocation receipt invalid.');
}
export async function listCloudMembers(companyId:string):Promise<Run3Member[]>{
  const r=await call('listMembers',{companyId});
  if(r.companyId!==companyId||!Array.isArray(r.members)||
    r.members.some(m=>!m||m.companyId!==companyId||
      typeof m.userId!=='string'||!['owner','attendant'].includes(m.role)))
    throw Error('Membership list invalid.');
  return r.members as Run3Member[];
}
