/** V48: deliberately opt-in owner/attendant HTTP + RLS acceptance.
 * ONLY against the fixed disposable project. No production secrets or customer IDs.
 * Tokens belong in local environment variables, NEVER in command arguments or logs.
 */
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROJECT='lmneuqxfyxplrxjswpma';
const AUTH_ORIGIN='https://lmneuqxfyxplrxjswpma.supabase.co';
const approval='I_APPROVE_RUN3_DISPOSABLE_PROJECT';
const writingApproval='I_APPROVE_RUN3_MEMBERSHIP_WRITES';
const required=['RUN3_QA_PUBLISHABLE_KEY','RUN3_QA_COMPANY_A','RUN3_QA_COMPANY_B',
  'RUN3_QA_OWNER_A_TOKEN','RUN3_QA_OWNER_B_TOKEN','RUN3_QA_ATTENDANT_A_TOKEN',
  'RUN3_QA_MEMBERSHIP_API'];
const denied=m=>{throw Error('Run 3 disposable acceptance preflight failed: '+m);};

export function validateConfig(env){
  if(env.RUN3_QA_DISPOSABLE_PROJECT_APPROVED!==approval ||
     env.RUN3_QA_RUN_MUTATIONS!==writingApproval)denied('explicit approval absent');
  if(env.RUN3_QA_URL!==AUTH_ORIGIN)denied('test project origin mismatch');
  for(const name of required)if(typeof env[name]!=='string'||!env[name].trim())
    denied('missing '+name);
  if(!UUID.test(env.RUN3_QA_COMPANY_A)||!UUID.test(env.RUN3_QA_COMPANY_B)||
     env.RUN3_QA_COMPANY_A===env.RUN3_QA_COMPANY_B)denied('separate company UUIDs required');
  const endpoint=new URL(env.RUN3_QA_MEMBERSHIP_API);
  if(endpoint.href!==AUTH_ORIGIN+'/functions/v1/tallybook-run3-qa'||
     endpoint.username||endpoint.password||endpoint.search||endpoint.hash)
    denied('exact isolated QA Edge membership API required');
  const tokens=required.filter(n=>n.endsWith('_TOKEN')).map(n=>env[n]);
  if(new Set(tokens).size!==3||tokens.some(t=>t.length<20))denied('three independent user sessions required');
  return Object.freeze({authOrigin:AUTH_ORIGIN,api:endpoint.href.replace(/\/$/,''),
    key:env.RUN3_QA_PUBLISHABLE_KEY, companyA:env.RUN3_QA_COMPANY_A,
    companyB:env.RUN3_QA_COMPANY_B,tokens:Object.freeze(tokens)});
}

async function request(fetcher,url,{token,key,method='GET',body}={}){
  const response=await fetcher(url,{method,redirect:'error',cache:'no-store',
    headers:{'Accept':'application/json','Cache-Control':'no-store',
      ...(body?{'Origin':AUTH_ORIGIN}:{}),
      ...(key?{'apikey':key}:{}),...(token?{'Authorization':'Bearer '+token}:{}),
      ...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{})});
  if(!response||typeof response.status!=='number')throw Error('No HTTP response');
  const json=response.headers.get('content-type')?.includes('application/json');
  if(!json)throw Error('Non-JSON response: membership backend may be a static SPA');
  return {status:response.status,data:await response.json()};
}
const success=(result,name)=>{if(result.status!==200)throw Error(name+' HTTP '+result.status);return result.data;};
const forbidden=(result,name)=>{if(![401,403].includes(result.status))throw Error(name+' must deny with 401/403, got '+result.status);};

export async function runJourney(config,fetcher=fetch){
  const {authOrigin,api,key,companyA,companyB,tokens}=config;
  const [ownerA,ownerB,attendant]=tokens;
  const user=async token=>success(await request(fetcher,authOrigin+'/auth/v1/user',
    {token,key}),'Auth verification');
  const [a,b,c]=await Promise.all(tokens.map(user));
  if(![a,b,c].every(u=>UUID.test(u.id??''))||new Set([a.id,b.id,c.id]).size!==3)
    throw Error('Independent verified Auth identities required');
  const scoped=async(token,table,company)=>{
    const cols=table==='businesses'?'id,owner_id':'business_id,user_id,role';
    const column=table==='businesses'?'id':'business_id';
    const url=authOrigin+'/rest/v1/'+table+'?select='+cols+'&'+column+'=eq.'+encodeURIComponent(company);
    const data=success(await request(fetcher,url,{token,key}),'RLS read');
    if(!Array.isArray(data))throw Error('Invalid RLS response');
    return data;
  };
  const visible=async(token,company)=>scoped(token,'businesses',company);
  const member=async(token,company)=>scoped(token,'business_members',company);
  const call=(operation,token,body)=>request(fetcher,api+'/'+operation,{token,key,method:'POST',body});
  const before=await Promise.all([
    visible(ownerA,companyA),visible(ownerA,companyB),
    visible(ownerB,companyB),visible(ownerB,companyA),
    visible(attendant,companyA),visible(attendant,companyB)
  ]);
  if(before[0].length!==1||before[0][0].owner_id!==a.id||before[1].length||
     before[2].length!==1||before[2][0].owner_id!==b.id||before[3].length||
     before[4].length||before[5].length)
    throw Error('Expected isolated companies and an unassigned attendant at start');
  const aMembers=await member(ownerA,companyA), bMembers=await member(ownerB,companyB);
  if(aMembers.length!==1||aMembers[0].user_id!==a.id||aMembers[0].role!=='owner'||
     bMembers.length!==1||bMembers[0].user_id!==b.id||bMembers[0].role!=='owner')
    throw Error('Owner memberships are not clean fixture baselines');
  // Probe wrong-owner writes before issuing any invitation.
  forbidden(await call('invite',ownerB,{companyId:companyA,targetUserId:c.id}),
    'foreign-owner invitation');
  let invitation=null, accepted=false;
  try {
    invitation=success(await call('invite',ownerA,{companyId:companyA,targetUserId:c.id}),
      'owner invitation');
    if(invitation.companyId!==companyA||invitation.targetUserId!==c.id||
       !UUID.test(invitation.invitationId??'')||
       !/^v1\.[A-Za-z0-9_-]{43}$/.test(invitation.inviteToken??''))
      throw Error('Invalid target-specific invitation receipt');
    forbidden(await call('accept',ownerB,{inviteToken:invitation.inviteToken}),
      'wrong-account redemption');
    const receipt=success(await call('accept',attendant,{inviteToken:invitation.inviteToken}),
      'attendant acceptance');
    accepted=true;
    if(receipt.companyId!==companyA||receipt.userId!==c.id||receipt.role!=='attendant')
      throw Error('Attendant receipt mismatch');
    forbidden(await call('accept',attendant,{inviteToken:invitation.inviteToken}),
      'invitation replay');
    const [newVisible,foreignVisible,ownMembership]=await Promise.all([
      visible(attendant,companyA),visible(attendant,companyB),member(attendant,companyA)]);
    if(newVisible.length!==1||foreignVisible.length!==0||ownMembership.length!==1||
       ownMembership[0].user_id!==c.id||ownMembership[0].role!=='attendant')
      throw Error('Accepted attendant does not have exact company A membership');
    forbidden(await call('listMembers',attendant,{companyId:companyA}),
      'attendant owner-only enumeration');
    forbidden(await call('revokeMember',ownerB,{companyId:companyA,targetUserId:c.id}),
      'foreign-owner revocation');
    const revoked=success(await call('revokeMember',ownerA,{companyId:companyA,targetUserId:c.id}),
      'owner revocation');
    if(revoked.companyId!==companyA||revoked.targetUserId!==c.id||revoked.revoked!==true)
      throw Error('Revocation receipt mismatch');
    accepted=false;
    invitation=null;
    const [afterVisible,afterMembership,ownOwner,foreignOwner]=await Promise.all([
      visible(attendant,companyA),member(attendant,companyA),
      visible(ownerA,companyA),visible(ownerB,companyB)]);
    if(afterVisible.length||afterMembership.length||ownOwner.length!==1||foreignOwner.length!==1)
      throw Error('Revocation/cross-company isolation not reflected in RLS');
    return Object.freeze({status:'PASS',realAccounts:3,companies:2,
      checks:'invitation, replay, wrong-account, cross-tenant, revocation and RLS'});
  }finally{
    // Best-effort cleanup of disposable membership; never claim cleanup succeeded.
    if(accepted)await call('revokeMember',ownerA,{companyId:companyA,targetUserId:c.id})
      .catch(()=>{});
    else if(invitation?.invitationId){
      await call('revokeInvite',ownerA,{companyId:companyA,invitationId:invitation.invitationId})
        .catch(()=>{});
    }
  }
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const result=await runJourney(validateConfig(process.env));
    process.stdout.write(JSON.stringify(result)+'\n');
  }catch(e){
    // Do not print tokens, invitation receipts, user identifiers or response bodies.
    process.stderr.write('Run3 acceptance NOT PASSED: '+
      (String(e?.message||'Unknown failure').replace(/https?:\/\/\S+/g,'[URL]'))+'\n');
    process.exitCode=1;
  }
}