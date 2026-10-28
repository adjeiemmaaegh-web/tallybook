/** Run 3 opt-in cloud membership client. Never authorizes local company data.
 * All actions use bearer auth verified anew in the private server transaction.
 */
import {getSupabaseClient} from '@/lib/supabase';
import {resolveRun3Endpoint} from './run3Endpoint.mjs';
export type Run3Member={companyId:string;userId:string;role:'owner'|'attendant';status:'active'};
async function call(action:string,body:Record<string,string>){
  if(typeof window==='undefined'||window.location.protocol!=='https:')
    throw Error('Secure online account required for cloud invitations.');
  const endpoint=resolveRun3Endpoint({
    qaEndpoint:import.meta.env.VITE_TALLYBOOK_RUN3_QA_ENDPOINT,
    supabaseUrl:import.meta.env.VITE_SUPABASE_URL,
    isPreview:import.meta.env.VITE_TALLYBOOK_RUN3_MEMBERSHIP_PREVIEW==='true',
    publishableKey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  });
  const client=getSupabaseClient();
  const {data:identity,error:userError}=await client.auth.getUser();
  const {data:sessionData,error:sessionError}=await client.auth.getSession();
  const auth=sessionData.session;
  if(userError||sessionError||!identity.user||!auth||
     auth.user.id!==identity.user.id||
     !Number.isSafeInteger(auth.expires_at)||auth.expires_at!*1000<=Date.now())
    throw Error('Your account session changed. Sign in again.');
  // A signed-out account or token rotation invalidates a response already
  // in flight. The authenticated server still authorizes the actual mutation.
  let changed=false;
  const {data:{subscription}}=client.auth.onAuthStateChange(event=>{
    if(event!=='INITIAL_SESSION')changed=true;
  });
  try{
    const res=await fetch(endpoint.base+'/'+action,{
      method:'POST',credentials:'omit',cache:'no-store',
      headers:{'Content-Type':'application/json',
        Authorization:'Bearer '+auth.access_token,
        ...(endpoint.key?{apikey:endpoint.key}:{})},
      body:JSON.stringify(body)
    });
    if(!res.ok)throw Error('Cloud membership operation was denied or unavailable.');
    const result:unknown=await res.json();
    const {data:finalIdentity,error:identityError}=await client.auth.getUser();
    const {data:finalSession,error:finalError}=await client.auth.getSession();
    if(changed||identityError||finalError||
      finalIdentity.user?.id!==identity.user.id||
      finalSession.session?.user.id!==identity.user.id||
      finalSession.session?.access_token!==auth.access_token||
      !Number.isSafeInteger(finalSession.session?.expires_at)||
      (finalSession.session?.expires_at??0)*1000<=Date.now())
      throw Error('Account changed before the cloud operation completed.');
    if(!result||typeof result!=='object'||Array.isArray(result))
      throw Error('Invalid cloud membership response.');
    return result as Record<string,unknown>;
  }finally{
    subscription.unsubscribe();
  }
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
