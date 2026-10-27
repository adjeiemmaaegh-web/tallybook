/** V49: QA-only HTTPS bridge for canonical UUID membership. NOT for production.
 * Runs exclusively in isolated project lmneuqxfyxplrxjswpma.
 * The only privileged operation is the isolated atomic service_role RPC.
 */
import {createClient} from 'npm:@supabase/supabase-js@2.117.3';

const TEST_ORIGIN='https://lmneuqxfyxplrxjswpma.supabase.co';
const ROOT='/functions/v1/tallybook-run3-qa/';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const B64=/^v1\.[A-Za-z0-9_-]{43}$/;
const allowed={
  invite:['companyId','targetUserId'],
  accept:['inviteToken'],
  revokeMember:['companyId','targetUserId'],
  revokeInvite:['companyId','invitationId'],
  listMembers:['companyId'],
  pullSales:['companyId','deviceId','afterUtc','afterOperationId']
} as const;

function response(origin:string|null,status:number,data:object){
  const h:Record<string,string>={'Content-Type':'application/json',
    'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
    'Vary':'Origin'};
  if(origin)h['Access-Control-Allow-Origin']=origin;
  return new Response(JSON.stringify(data),{status,headers:h});
}
function configValid():boolean{
  return Deno.env.get('SUPABASE_URL')===TEST_ORIGIN&&
    !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
}
function qaOrigin():string {
  const supplied=Deno.env.get('RUN3_QA_ALLOWED_ORIGIN');
  if(!supplied)return TEST_ORIGIN; // Only isolated project origin; Node acceptance runner
  try{
    const v=new URL(supplied);
    if(v.protocol==='https:'&&v.origin===supplied&&
       !['tallybook-eight.vercel.app'].includes(v.hostname))return supplied;
  }catch{/* fail closed */}
  return ''; // Invalid environment configuration
}
function decodeClaims(token:string):Record<string,unknown>{
  const s=token.split('.');
  if(s.length!==3||!s.every(x=>x.length>0&&x.length<=8192&&/^[A-Za-z0-9_-]+$/.test(x)))
    throw Error('Invalid JWT');
  const encoded=s[1].replace(/-/g,'+').replace(/_/g,'/');
  const text=atob(encoded+'='.repeat((4-encoded.length%4)%4));
  const claims=JSON.parse(text);
  if(!claims||typeof claims!=='object'||Array.isArray(claims))
    throw Error('Invalid JWT claims');
  return claims as Record<string,unknown>;
}
function tokenFromRandom(){
  const entropy=new Uint8Array(32);
  crypto.getRandomValues(entropy);
  const token=btoa(String.fromCharCode(...entropy)).replace(/=/g,'')
    .replace(/\+/g,'-').replace(/\//g,'_');
  return 'v1.'+token;
}
async function digest(token:string){
  const bytes=new TextEncoder().encode(token);
  const hashed=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  return [...hashed].map(x=>x.toString(16).padStart(2,'0')).join('');
}
Deno.serve(async(req:Request)=>{
  const origin=req.headers.get('origin');
  const allowedOrigin=qaOrigin();
  if(!configValid()||!allowedOrigin)
    return response(null,503,{error:'QA membership service unavailable'});
  if(req.method==='OPTIONS'){
    if(origin!==allowedOrigin)
      return response(null,403,{error:'QA origin denied'});
    return new Response(null,{status:204,headers:{
      'Access-Control-Allow-Origin':allowedOrigin,
      'Access-Control-Allow-Methods':'POST, OPTIONS',
      'Access-Control-Allow-Headers':'authorization, apikey, content-type',
      'Access-Control-Max-Age':'300','Cache-Control':'no-store','Vary':'Origin'
    }});
  }
  if(req.method!=='POST'||origin!==allowedOrigin)
    return response(null,403,{error:'QA membership request denied'});
  const op=new URL(req.url).pathname.replace(ROOT,'');
  if(!new URL(req.url).pathname.startsWith(ROOT)||!Object.hasOwn(allowed,op))
    return response(allowedOrigin,404,{error:'Unknown QA operation'});
  const header=req.headers.get('authorization');
  if(!header||!/^Bearer [A-Za-z0-9._~-]{20,16384}$/.test(header)||
     !(req.headers.get('content-type')||'').toLowerCase().startsWith('application/json')||
     !!req.headers.get('cookie'))
    return response(allowedOrigin,403,{error:'QA membership request denied'});
  const contentLength=Number(req.headers.get('content-length')||0);
  if(!Number.isSafeInteger(contentLength)||contentLength>4096||contentLength<0)
    return response(allowedOrigin,413,{error:'QA request too large'});
  let body:Record<string,unknown>;
  try{
    const source=await req.text();
    if(source.length>4096)throw Error('Too large');
    body=JSON.parse(source);
    if(!body||typeof body!=='object'||Array.isArray(body))throw Error('Body invalid');
    const keys=Object.keys(body);
    const names=allowed[op as keyof typeof allowed] as readonly string[];
    if(keys.length!==names.length||keys.some(k=>!names.includes(k))||
      names.some(k=>typeof body[k]!=='string'||(body[k] as string).length>512))
      throw Error('Unexpected parameters');
  }catch{
    return response(allowedOrigin,400,{error:'Invalid QA membership parameters'});
  }
  try{
    const token=header.slice(7);
    const url=Deno.env.get('SUPABASE_URL')!;
    const serverKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const client=createClient(url,serverKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data,error}=await client.auth.getUser(token);
    const claims=decodeClaims(token);
    const actor=data?.user?.id;
    const session=claims.session_id;
    if(error||!UUID.test(actor??'')||!UUID.test(String(session??''))||
       claims.sub!==actor||claims.role!=='authenticated'||claims.aud!=='authenticated'||
       !Number.isSafeInteger(claims.exp)||Number(claims.exp)*1000<=Date.now())
      throw Error('Invalid or expired verified session');
    const args:Record<string,string|null>={
      p_operation:op,p_actor:actor!,p_session:String(session),
      p_company:null,p_target:null,p_token_hash:null,p_invitation:null
    };
    let inviteToken:string|undefined;
    let pullArgs:Record<string,string>|null=null;
    if(op==='pullSales'){
      if(!UUID.test(String(body.companyId))||
         !/^[A-Za-z0-9:_-]{1,128}$/.test(String(body.deviceId))||
         !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(String(body.afterUtc))||
         !Number.isFinite(Date.parse(String(body.afterUtc)))||
         !/^[A-Za-z0-9:_-]{0,128}$/.test(String(body.afterOperationId)))
        throw Error('Pull cursor/scope invalid');
      pullArgs={p_actor:actor!,p_session:String(session),
        p_company:body.companyId as string,p_device:body.deviceId as string,
        p_after:body.afterUtc as string,p_after_operation:body.afterOperationId as string};
    } else if(op==='invite'){
      if(!UUID.test(String(body.companyId))||!UUID.test(String(body.targetUserId)))
        throw Error('IDs invalid');
      args.p_company=body.companyId as string;
      args.p_target=body.targetUserId as string;
      inviteToken=tokenFromRandom();
      args.p_token_hash=await digest(inviteToken);
    } else if(op==='accept'){
      if(!B64.test(String(body.inviteToken)))throw Error('Token invalid');
      args.p_token_hash=await digest(body.inviteToken as string);
    } else if(op==='revokeMember'){
      if(!UUID.test(String(body.companyId))||!UUID.test(String(body.targetUserId)))
        throw Error('IDs invalid');
      args.p_company=body.companyId as string;
      args.p_target=body.targetUserId as string;
    } else if(op==='revokeInvite'){
      if(!UUID.test(String(body.companyId))||!UUID.test(String(body.invitationId)))
        throw Error('IDs invalid');
      args.p_company=body.companyId as string;
      args.p_invitation=body.invitationId as string;
    } else {
      if(!UUID.test(String(body.companyId)))throw Error('ID invalid');
      args.p_company=body.companyId as string;
    }
    const result=op==='pullSales'
      ?await client.rpc('run3_qa_pull_sales',pullArgs!)
      :await client.rpc('run3_qa_membership_rpc',args);
    if(result.error||!result.data||typeof result.data!=='object')
      throw Error('SQL authorization denied');
    const payload=op==='invite'?{...result.data,inviteToken}:result.data;
    return response(allowedOrigin,200,payload);
  }catch{
    // No SQL diagnostics, JWT, usernames, company identifiers or tokens in responses.
    return response(allowedOrigin,403,{error:'QA membership operation denied'});
  }
});
