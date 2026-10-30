import {getSupabaseClient} from '@/lib/supabase';
import {QA_RUN3_ENDPOINT,QA_SUPABASE_ORIGIN,resolveRun3Endpoint} from '@/cloud/run3Endpoint.mjs';
import {db} from '@/db/TallybookDB';
import {currentStaffId,requirePermission} from '@/features/staff/staff';
import {getActiveBusinessProfileId} from '@/features/business/activeCompany';
import {activateDeviceKey,createPendingDeviceKey,inspectDeviceKeyState,signDeviceEnrollmentProof,type DeviceKeyScope} from './deviceKeyVault';
import {verifiedDeviceKeyGuards} from './verifiedDeviceKeyScope';

export async function callQaDevice(action:string,body:Record<string,string>,userId:string,localCompanyId:string){
 if(!['deviceProvision','deviceInvite','deviceRedeem','deviceRevoke'].includes(action))throw Error('Unknown device action.');
 if(typeof window==='undefined'||location.protocol!=='https:'||!navigator.onLine)
  throw Error('Connect online using HTTPS to manage a cloud device.');
 const endpoint=resolveRun3Endpoint({qaEndpoint:import.meta.env.VITE_TALLYBOOK_RUN3_QA_ENDPOINT,
  supabaseUrl:import.meta.env.VITE_SUPABASE_URL,isPreview:import.meta.env.VITE_TALLYBOOK_RUN3_MEMBERSHIP_PREVIEW==='true',
  publishableKey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY});
 if(endpoint.base!==QA_RUN3_ENDPOINT||!endpoint.key)throw Error('Device enrollment is available only in isolated QA.');
 const actor=await requirePermission(action==='deviceRedeem'?'sell':'staff',db,localCompanyId);
 if(!actor)throw Error('Unlock a local staff account first.');
 if(action==='deviceProvision'){
  const [shop,staff]=await Promise.all([db.storeLocations.get(body.storeId),db.staffMembers.get(body.staffId)]);
  if(body.localCompanyId!==localCompanyId||!shop||shop.businessProfileId!==localCompanyId||shop.status!=='active'||
     !staff||staff.businessProfileId!==localCompanyId||staff.disabledAt)
   throw Error('Select active staff and a shop from this local company.');
 }
 const localGuard=()=>{
  if(getActiveBusinessProfileId()!==localCompanyId||currentStaffId(localCompanyId)!==actor.id)
   throw Error('Local company or staff account changed.');
 };
 localGuard();
 const client=getSupabaseClient();
 const identity=await client.auth.getUser(),session=await client.auth.getSession();
 const auth=session.data.session;
 if(identity.error||session.error||identity.data.user?.id!==userId||auth?.user.id!==userId||
    !Number.isSafeInteger(auth.expires_at)||(auth.expires_at??0)*1000<=Date.now())throw Error('Verify your cloud sign-in first.');
 let changed=false;
 const {data:{subscription}}=client.auth.onAuthStateChange(event=>{if(event!=='INITIAL_SESSION')changed=true;});
 try{
  localGuard();
  const url=endpoint.base+'/'+action;
  const response=await fetch(url,{method:'POST',redirect:'error',cache:'no-store',credentials:'omit',
   headers:{'Content-Type':'application/json',apikey:endpoint.key,Authorization:'Bearer '+auth.access_token},
   body:JSON.stringify(body)});
  if(!response.ok||response.redirected||response.url!==url||
     !response.headers.get('content-type')?.includes('application/json'))
   throw Error('Device action denied. Check the approved company link, membership and shop assignment.');
  const raw=await response.text();
  if(raw.length>4096)throw Error('Invalid device response.');
  const result=JSON.parse(raw) as Record<string,unknown>;
  const final=await client.auth.getUser(),latest=await client.auth.getSession();
  localGuard();
  if(changed||final.error||latest.error||final.data.user?.id!==userId||
    latest.data.session?.access_token!==auth.access_token||(latest.data.session?.expires_at??0)*1000<=Date.now())
   throw Error('Cloud account changed during device enrollment.');
  await requirePermission(action==='deviceRedeem'?'sell':'staff',db,localCompanyId);
  localGuard();
  if(!result||typeof result!=='object'||Array.isArray(result)||result.companyId!==body.companyId)
   throw Error('Device response does not match this company.');
  return result;
 }finally{subscription.unsubscribe();}
}

export async function prepareQaDevice(userId:string,cloudCompanyId:string,shopId:string):Promise<DeviceKeyScope>{
 const company=getActiveBusinessProfileId();
 const actor=await requirePermission('sell',db,company);
 const shop=await db.storeLocations.get(shopId);
 if(!actor||!shop||shop.businessProfileId!==company||shop.status!=='active')throw Error('Unlock staff and select an active local shop.');
 const scope:DeviceKeyScope={supabaseOrigin:QA_SUPABASE_ORIGIN,userId,cloudCompanyId,
  localCompanyId:company,staffId:actor.id,shopId,deviceId:crypto.randomUUID()};
 const guards=verifiedDeviceKeyGuards(scope);
 await createPendingDeviceKey(scope,guards.resolveUserId,guards.currentLocalScope);
 return scope;
}
export async function redeemQaDevice(scope:DeviceKeyScope,token:string){
 const guards=verifiedDeviceKeyGuards(scope);
 const proof=await signDeviceEnrollmentProof(scope,token,guards.resolveUserId,guards.currentLocalScope);
 const receipt=await callQaDevice('deviceRedeem',{companyId:scope.cloudCompanyId,storeId:scope.shopId,
  token,staffId:scope.staffId,deviceId:scope.deviceId,...proof},scope.userId,scope.localCompanyId);
 if(receipt.storeId!==scope.shopId||receipt.userId!==scope.userId||receipt.staffId!==scope.staffId||
   receipt.deviceId!==scope.deviceId||receipt.publicKeyBound!==true||receipt.hardwareBound!==false)
  throw Error('Device receipt does not match the enrolled key.');
 await activateDeviceKey(scope,{companyId:scope.cloudCompanyId,storeId:scope.shopId,userId:scope.userId,
  staffId:scope.staffId,deviceId:scope.deviceId,publicKeyBound:true,hardwareBound:false},guards.resolveUserId,guards.currentLocalScope);
}

const savedScopeKey=(user:string,cloud:string,local:string)=>'tallybook.qa.device.scope:'+JSON.stringify([user,cloud,local]);
export function rememberQaDeviceScope(scope:DeviceKeyScope){
 localStorage.setItem(savedScopeKey(scope.userId,scope.cloudCompanyId,scope.localCompanyId),JSON.stringify(scope));
}
export async function recoverQaDeviceScope(userId:string,cloudCompanyId:string,localCompanyId:string){
 const raw=localStorage.getItem(savedScopeKey(userId,cloudCompanyId,localCompanyId));
 if(!raw)return null;
 const scope=JSON.parse(raw) as DeviceKeyScope;
 if(!scope||scope.userId!==userId||scope.cloudCompanyId!==cloudCompanyId||scope.localCompanyId!==localCompanyId||
    scope.supabaseOrigin!==QA_SUPABASE_ORIGIN)throw Error('Saved QA device belongs to a different account.');
 const guards=verifiedDeviceKeyGuards(scope);
 const status=await inspectDeviceKeyState(scope,guards.resolveUserId,guards.currentLocalScope);
 return {scope,status};
}
