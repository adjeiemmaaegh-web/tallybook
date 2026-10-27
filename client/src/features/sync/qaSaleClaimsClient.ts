/** Isolated test-only read. Does not import or modify local sales/stock/IndexedDB.
 * A claim received from cloud is NOT automatically a verified sale.
 */
import {getSupabaseClient} from '@/lib/supabase';
import {resolveRun3Endpoint,QA_RUN3_ENDPOINT} from '@/cloud/run3Endpoint.mjs';
import {validateQaSalePage,type QaSaleReadScope,type QaSalePage}
  from './qaSalePageBoundary.mjs';

export async function fetchQaSaleClaims(scope:QaSaleReadScope):Promise<Readonly<QaSalePage>>{
  if(typeof window==='undefined'||window.location.protocol!=='https:'||
     !navigator.onLine)throw Error('Secure online test session required.');
  const endpoint=resolveRun3Endpoint({
    qaEndpoint:import.meta.env.VITE_TALLYBOOK_RUN3_QA_ENDPOINT,
    supabaseUrl:import.meta.env.VITE_SUPABASE_URL,
    isPreview:import.meta.env.VITE_TALLYBOOK_RUN3_MEMBERSHIP_PREVIEW==='true',
    publishableKey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  });
  if(endpoint.base!==QA_RUN3_ENDPOINT||!endpoint.key)
    throw Error('Cloud sale read is available only in isolated QA preview.');
  const client=getSupabaseClient();
  const {data:{user},error:identityError}=await client.auth.getUser();
  const {data:{session},error:sessionError}=await client.auth.getSession();
  if(identityError||sessionError||!user||!session||session.user.id!==user.id||
     !Number.isSafeInteger(session.expires_at)||
     (session.expires_at??0)*1000<=Date.now()||
     typeof session.access_token!=='string'||session.access_token.length<20)
    throw Error('Cloud test session is not verified.');
  let changed=false;
  const {data:{subscription}}=client.auth.onAuthStateChange(event=>{
    if(event!=='INITIAL_SESSION')changed=true;
  });
  try{
    // JSON payload is read-only; the server independently validates Auth,
    // revoked session, company membership, device, staff and store assignment.
    const response=await fetch(endpoint.base+'/pullSales',{
      method:'POST',cache:'no-store',credentials:'omit',
      headers:{'Content-Type':'application/json',apikey:endpoint.key,
        Authorization:'Bearer '+session.access_token},
      body:JSON.stringify({companyId:scope.companyId,deviceId:scope.deviceId,
        afterUtc:scope.afterUtc,afterOperationId:scope.afterOperationId})
    });
    if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))
      throw Error('Authorized QA sale read denied or unavailable.');
    const data:unknown=await response.json();
    const verified=validateQaSalePage(data,scope);
    const final=await client.auth.getUser();
    const current=await client.auth.getSession();
    if(changed||final.error||current.error||
       final.data.user?.id!==user.id||
       !current.data.session||current.data.session.access_token!==session.access_token||
       current.data.session.user.id!==user.id||
       (current.data.session.expires_at??0)*1000<=Date.now())
      throw Error('Cloud identity changed while reading QA claims.');
    return verified;
  }finally{subscription.unsubscribe();}
}
