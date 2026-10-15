/** Run 3 real two-tenant REST/RLS acceptance probe - NOT AUTO-RUN.
 * Disposable Supabase project ONLY. Never use production/customer identities.
 * Required: explicit operator approval plus three independent fixture accounts.
 * This script is read-only; SQL write denial probes are a separate approved step.
 */
import assert from 'node:assert/strict';
const requireEnv=k=>{const v=process.env[k];if(!v)throw Error('Missing '+k);return v;};
const approval=requireEnv('RUN3_QA_DISPOSABLE_PROJECT_APPROVED');
if(approval!=='I_APPROVE_RUN3_DISPOSABLE_PROJECT')throw Error('Disposable-only approval missing');
const url=new URL(requireEnv('RUN3_QA_URL'));
if(url.protocol!=='https:'||!url.hostname.endsWith('.supabase.co')||
   url.hostname.startsWith('qfyydfxwvifdvffdfgeu.'))
  throw Error('Run 3 test must use a separate approved disposable Supabase project');
const base=url.origin,anon=requireEnv('RUN3_QA_PUBLISHABLE_KEY');
const companyA=requireEnv('RUN3_QA_COMPANY_A'),companyB=requireEnv('RUN3_QA_COMPANY_B');
assert.notEqual(companyA,companyB,'Fixture companies must be independent');
const tokens=[
  requireEnv('RUN3_QA_OWNER_A_TOKEN'),
  requireEnv('RUN3_QA_OWNER_B_TOKEN'),
  requireEnv('RUN3_QA_ATTENDANT_A_TOKEN')
];
async function get(path,token){
  const response=await fetch(base+path,{headers:{
    apikey:anon,Authorization:'Bearer '+token,'Cache-Control':'no-store'}});
  if(!response.ok)throw Error('Run 3 test REST request denied unexpectedly: '+response.status);
  return response.json();
}
const users=await Promise.all(tokens.map(token=>get('/auth/v1/user',token)));
for(const u of users)if(typeof u.id!=='string')throw Error('Fixture auth identity missing');
assert.equal(new Set(users.map(x=>x.id)).size,3,'Fixture accounts not independent');
async function rows(index,table,condition){
  const fields=table==='businesses'?'id,owner_id':'business_id,user_id,role';
  return get('/rest/v1/'+table+'?select='+fields+'&'+condition,tokens[index]);
}
const visibleA=await rows(0,'businesses','id=eq.'+companyA);
const hiddenB=await rows(0,'businesses','id=eq.'+companyB);
const visibleB=await rows(1,'businesses','id=eq.'+companyB);
const hiddenA=await rows(1,'businesses','id=eq.'+companyA);
const attendantCompany=await rows(2,'businesses','id=eq.'+companyA);
const attendantForeign=await rows(2,'businesses','id=eq.'+companyB);
assert.equal(visibleA.length,1);
assert.equal(visibleA[0].owner_id,users[0].id);
assert.equal(visibleB.length,1);
assert.equal(visibleB[0].owner_id,users[1].id);
assert.equal(hiddenB.length,0);assert.equal(hiddenA.length,0);
assert.equal(attendantCompany.length,1);assert.equal(attendantForeign.length,0);
for(const [idx,company,role] of [[0,companyA,'owner'],[1,companyB,'owner'],[2,companyA,'attendant']]){
  const list=await rows(idx,'business_members','business_id=eq.'+company);
  const own=list.filter(row=>row.user_id===users[idx].id);
  assert.equal(own.length,1);
  assert.equal(own[0].role,role);
  assert.ok(list.every(m=>m.user_id===users[idx].id),
    'Membership SELECT exposed another member');
}
for(const [idx,foreignCompany] of [[0,companyB],[1,companyA],[2,companyB]]){
  const list=await rows(idx,'business_members','business_id=eq.'+foreignCompany);
  assert.equal(list.length,0,'Foreign tenant membership was exposed');
}
process.stdout.write(JSON.stringify({test:'Run 3 disposable REST RLS',
  result:'read-only fixture checks passed',accounts:3,companies:2})+'\n');
