/** Run 5 read-only cloud catalog preview, never IndexedDB / local POS.
 * The live server route is OFF; requests fail closed until approved QA setup.
 */
import {getSupabaseClient} from '@/lib/supabase';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function assertTenant(value:unknown,companyId:string,depth=0):void{
  if(depth>20)throw Error('Invalid scoped cloud response');
  if(value===null||typeof value==='string'||typeof value==='boolean')return;
  if(typeof value==='number'&&Number.isSafeInteger(value))return;
  if(Array.isArray(value)){
    if(value.length>1000)throw Error('Invalid scoped cloud response');
    for(const item of value)assertTenant(item,companyId,depth+1);
    return;
  }
  if(!value||typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype)
    throw Error('Invalid scoped cloud response');
  for(const [key,item] of Object.entries(value)){
    if(['__proto__','prototype','constructor'].includes(key)||
       ['companyId','businessProfileId','organizationId','tenantId'].includes(key)&&
       item!==companyId)throw Error('Cross-company cloud response denied');
    assertTenant(item,companyId,depth+1);
  }
}

export async function readRun5CloudCatalog(companyId:string,expectedUserId:string){
  if(typeof window==='undefined'||window.location.protocol!=='https:'||
     !uuid.test(companyId)||!uuid.test(expectedUserId))
    throw Error('Cloud tenant preview unavailable');
  const client=getSupabaseClient();
  const original=await client.auth.getUser();
  const session=await client.auth.getSession();
  const token=session.data.session?.access_token;
  if(original.error||session.error||original.data.user?.id!==expectedUserId||
     session.data.session?.user.id!==expectedUserId||
     !Number.isSafeInteger(session.data.session?.expires_at)||
     (session.data.session?.expires_at??0)*1000<=Date.now()||
     typeof token!=='string'||token.length<20)
    throw Error('Verified cloud account is required');
  let changed=false;
  const {data:{subscription}}=client.auth.onAuthStateChange(event=>{
    if(event!=='INITIAL_SESSION')changed=true;
  });
  try{
    const res=await fetch('/api/run5/data/list',{
      method:'POST',credentials:'omit',cache:'no-store',
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
      body:JSON.stringify({companyId,collection:'products',limit:50})
    });
    if(!res.ok)throw Error('Tenant data preview was denied');
    const result:unknown=await res.json();
    const lastUser=await client.auth.getUser();
    const lastSession=await client.auth.getSession();
    if(changed||lastUser.error||lastSession.error||
       lastUser.data.user?.id!==expectedUserId||
       lastSession.data.session?.user.id!==expectedUserId||
       lastSession.data.session?.access_token!==token||
       !Number.isSafeInteger(lastSession.data.session?.expires_at)||
       (lastSession.data.session?.expires_at??0)*1000<=Date.now())
      throw Error('Cloud account changed during tenant preview');
    if(!result||typeof result!=='object'||Array.isArray(result))
      throw Error('Invalid scoped cloud response');
    const receipt=result as Record<string,unknown>;
    if(receipt.companyId!==companyId||receipt.collection!=='products'||
       !Array.isArray(receipt.rows)||receipt.rows.length>50||
       receipt.rows.some(row=>!row||row.companyId!==companyId||
         row.collection!=='products'||row.payload?.companyId!==companyId))
      throw Error('Cross-company cloud response denied');
    for(const row of receipt.rows)assertTenant(row,companyId);
    return {companyId,recordCount:receipt.rows.length,
      hasMore:receipt.nextCursor!==null&&receipt.nextCursor!==undefined};
  }finally{subscription.unsubscribe();}
}
