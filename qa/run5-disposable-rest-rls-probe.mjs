/** NOT AUTO-RUN: read-only Run 5 real Supabase REST/RLS negative probe.
 * Explicit disposable test project and two independently authenticated accounts.
 * Does NOT create users, insert rows, drop policies or change customer data.
 */
import assert from 'node:assert/strict';
const required=name=>{
  const val=process.env[name];if(!val)throw Error('Missing '+name);return val;
};
if(required('RUN5_DISPOSABLE_APPROVAL')!=='APPROVED_DISPOSABLE_RUN5')
  throw Error('Test-project approval missing');
const url=new URL(required('RUN5_SUPABASE_URL'));
if(url.protocol!=='https:'||!url.hostname.endsWith('.supabase.co')||
   url.hostname==='qfyydfxwvifdvffdfgeu.supabase.co')
  throw Error('Refusing live/unknown Supabase URL');
const key=required('RUN5_PUBLISHABLE_KEY');
const tokens=[required('RUN5_USER_A_TOKEN'),required('RUN5_USER_B_TOKEN')];
const companies=[required('RUN5_COMPANY_A'),required('RUN5_COMPANY_B')];
assert.notEqual(companies[0],companies[1]);
async function fetchJson(path,token){
  const res=await fetch(url.origin+path,{
    headers:{apikey:key,Authorization:'Bearer '+token,'Cache-Control':'no-store'}});
  if(res.status===404)throw Error('Required Run 5 schema unavailable in disposable project');
  const body=await res.json().catch(()=>null);
  return {status:res.status,body};
}
const identities=await Promise.all(tokens.map(t=>fetchJson('/auth/v1/user',t)));
if(identities.some(x=>x.status!==200||!x.body?.id)||
  identities[0].body.id===identities[1].body.id)
  throw Error('Two independently authenticated accounts required');
for(const token of tokens){
  for(const company of companies){
    const data=await fetchJson('/rest/v1/company_tenant_records?select=company_id,collection,record_id&company_id=eq.'+
      encodeURIComponent(company),token);
    if(data.status===200){
      if(!Array.isArray(data.body)||data.body.length!==0)
        throw Error('Browser token unexpectedly exposed tenant data');
    }else if(![401,403].includes(data.status))
      throw Error('Unexpected REST permission response '+data.status);
    const audit=await fetchJson('/rest/v1/company_tenant_data_audit?select=id&company_id=eq.'+
      encodeURIComponent(company),token);
    if(audit.status===200){
      if(!Array.isArray(audit.body)||audit.body.length!==0)
        throw Error('Browser token unexpectedly exposed tenant audit');
    }else if(![401,403].includes(audit.status))
      throw Error('Unexpected audit permission response '+audit.status);
  }
}
process.stdout.write(JSON.stringify({suite:'Run5 disposable REST RLS',
  accounts:2,companies:2,readOnly:true,result:'PASS'})+'\n');
