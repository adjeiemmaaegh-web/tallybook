import {useEffect,useRef,useState} from 'react';
import {db} from '@/db/TallybookDB';
import {useBusinessProfile} from '@/contexts/BusinessProfileContext';
import {currentStaffId,requirePermission,STAFF_SESSION_CHANGED,type StaffMember} from '@/features/staff/staff';
import type {StoreLocation} from '@/features/stores/storeDirectory';
import type {DeviceKeyScope} from '@/features/sync/deviceKeyVault';
import {callQaDevice,prepareQaDevice,redeemQaDevice,rememberQaDeviceScope,recoverQaDeviceScope} from '@/features/sync/qaDeviceClient';
import {pullQaSaleClaimsToQuarantine} from '@/features/sync/qaSaleClaimInbox';
import {listCloudMembers,type Run3Member} from './run3MembershipClient';

export function QaDeviceEnrollmentPanel(props:{userId:string;companyId:string;isOwner:boolean}){
 const {activeCompanyId}=useBusinessProfile();
 return <EnrollmentForm key={JSON.stringify([props.userId,props.companyId,activeCompanyId])}
   {...props} localCompanyId={activeCompanyId}/>;
}
function EnrollmentForm({userId,companyId,isOwner,localCompanyId}:{
 userId:string;companyId:string;isOwner:boolean;localCompanyId:string}){
 const [shops,setShops]=useState<StoreLocation[]>([]),[staff,setStaff]=useState<StaffMember[]>([]);
 const [members,setMembers]=useState<Run3Member[]>([]);
 const [shop,setShop]=useState(''),[staffId,setStaffId]=useState(''),[target,setTarget]=useState('');
 const [token,setToken]=useState(''),[issued,setIssued]=useState('');
 const [scope,setScope]=useState<DeviceKeyScope|null>(null),[enrolled,setEnrolled]=useState(false);
 const [revokeId,setRevokeId]=useState('');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const mounted=useRef(true),inFlight=useRef(false);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{
  const clear=()=>{setToken('');setIssued('');setStaff([]);setMembers([]);setScope(null);setEnrolled(false);
   setStaffId('');setTarget('');setMessage('Staff session changed. Reload the shop and account choices.');};
  window.addEventListener(STAFF_SESSION_CHANGED,clear);
  return()=>window.removeEventListener(STAFF_SESSION_CHANGED,clear);
 },[]);
 async function run(task:()=>Promise<string>){
  if(inFlight.current)return;
  inFlight.current=true;setBusy(true);setMessage('');
  try{const result=await task();if(mounted.current)setMessage(result);}
  catch(error){if(mounted.current)setMessage(error instanceof Error?error.message:'Device action failed.');}
  finally{inFlight.current=false;if(mounted.current)setBusy(false);}
 }
 async function load(){
  const actor=await requirePermission(isOwner?'staff':'sell',db,localCompanyId);
  if(!actor)throw Error('Unlock a local staff account before enrolling a device.');
  const [stores,people,accounts]=await Promise.all([
   db.storeLocations.where('businessProfileId').equals(localCompanyId).toArray(),
   isOwner?db.staffMembers.where('businessProfileId').equals(localCompanyId).toArray():Promise.resolve([actor]),
   isOwner?listCloudMembers(companyId):Promise.resolve([])
  ]);
  if(currentStaffId(localCompanyId)!==actor.id)throw Error('Staff session changed.');
  if(mounted.current){setShops(stores.filter(s=>s.status==='active'));
   setStaff(people.filter(s=>!s.disabledAt));setMembers(accounts);}
  return 'Choose the shop and account for this enrollment.';
 }
 return <section className="rounded border p-4 space-y-3" aria-label="QA device enrollment">
  <h3 className="font-semibold">Device enrollment — isolated QA</h3>
  <p className="text-sm">Use a previously approved local-to-cloud company link. Enrollment authorizes this device for the selected shop; it does not upload sales or change stock.</p>
  <button type="button" disabled={busy} onClick={()=>void run(load)} className="rounded border px-3 py-2">Load shops and accounts</button>
  <button type="button" disabled={busy||!!scope} className="rounded border px-3 py-2" onClick={()=>void run(async()=>{
   const saved=await recoverQaDeviceScope(userId,companyId,localCompanyId);
   if(!saved)return 'No saved QA enrollment on this device.';
   if(mounted.current){setScope(saved.scope);setShop(saved.scope.shopId);setEnrolled(saved.status==='active');}
   return saved.status==='active'?'Local device key restored. Server permissions are rechecked on every request.':'Pending device key restored. Enter the same invitation token to retry enrollment.';
  })}>Resume saved device</button>
  <label className="block">Shop<select className="block rounded border p-2" value={shop}
   disabled={busy||!!scope} onChange={e=>setShop(e.target.value)}>
   <option value="">Choose a shop</option>{scope&&!shops.some(s=>s.id===scope.shopId)?<option value={scope.shopId}>Saved shop: {scope.shopId}</option>:null}
   {shops.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
  {isOwner?<div className="space-y-2 border-t pt-3">
   <label className="block">Local staff<select className="block rounded border p-2" value={staffId} disabled={busy} onChange={e=>setStaffId(e.target.value)}>
    <option value="">Choose staff</option>{staff.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
   <label className="block">Verified cloud account<select className="block rounded border p-2" value={target} disabled={busy} onChange={e=>setTarget(e.target.value)}>
    <option value="">Choose an account</option>{members.map(m=><option key={m.userId} value={m.userId}>{m.role}: {m.userId}</option>)}</select></label>
   <button type="button" className="rounded border px-3 py-2" disabled={busy||!shop||!staffId||!target}
    onClick={()=>void run(async()=>{
     const result=await callQaDevice('deviceProvision',{companyId,localCompanyId,storeId:shop,staffId,targetUserId:target},userId,localCompanyId);
     if(result.status!=='active'||result.staffId!==staffId||result.userId!==target)throw Error('Staff binding receipt differs.');
     return 'Staff account assigned to this shop.';
    })}>Approve shop assignment</button>
   <button type="button" className="rounded border px-3 py-2" disabled={busy||!shop||!target}
    onClick={()=>void run(async()=>{
     const result=await callQaDevice('deviceInvite',{companyId,storeId:shop,targetUserId:target},userId,localCompanyId);
     if(result.targetUserId!==target||result.storeId!==shop||typeof result.token!=='string')throw Error('Invitation receipt differs.');
     if(mounted.current)setIssued(result.token);
     return 'Invitation expires in ten minutes. Share it privately with this account.';
    })}>Create device invitation</button>
   {issued?<p className="break-all text-sm">One-use invitation: <code>{issued}</code></p>:null}
  </div>:null}
  <div className="space-y-2 border-t pt-3">
   <p className="text-sm">Sign in as the invited account and unlock its local staff account before preparing this device.</p>
   <button type="button" className="rounded border px-3 py-2" disabled={busy||!shop||!!scope}
    onClick={()=>void run(async()=>{
     const next=await prepareQaDevice(userId,companyId,shop);
     if(mounted.current)setScope(next);
     rememberQaDeviceScope(next);
     return 'Device key prepared. Enter the invitation token to finish enrollment.';
    })}>Prepare this device</button>
   {scope?<p className="text-sm break-all">Device ID: <code>{scope.deviceId}</code></p>:null}
   <label className="block">Device invitation token<input className="block w-full rounded border p-2" autoComplete="off" spellCheck={false}
    value={token} onChange={e=>setToken(e.target.value)} disabled={busy||enrolled}/></label>
   <button type="button" className="rounded border px-3 py-2" disabled={busy||!scope||!token.trim()||enrolled}
    onClick={()=>void run(async()=>{
     await redeemQaDevice(scope!,token.trim());
     if(mounted.current){setToken('');setEnrolled(true);}
     return 'Device enrolled with an eight-hour grant. Financial synchronization is not enabled.';
    })}>Enroll this device</button>
   <button type="button" className="rounded border px-3 py-2" disabled={busy||!scope||!enrolled}
    onClick={()=>void run(async()=>{
     const result=await pullQaSaleClaimsToQuarantine(scope!);
     return `${result.received} claims stored for review. ${result.hasMore?'More are available.':''} No financial records were posted.`;
    })}>Read next QA claim page</button>
  </div>
  {isOwner?<div className="space-y-2 border-t pt-3">
   <label className="block">Device ID to revoke<input className="block w-full rounded border p-2" value={revokeId} disabled={busy}
    onChange={e=>setRevokeId(e.target.value)}/></label>
   <button type="button" className="rounded border px-3 py-2" disabled={busy||!shop||!revokeId.trim()}
    onClick={()=>void run(async()=>{
     const result=await callQaDevice('deviceRevoke',{companyId,storeId:shop,deviceId:revokeId.trim()},userId,localCompanyId);
     if(result.revoked!==true||result.deviceId!==revokeId.trim())throw Error('Revocation receipt differs.');
     if(scope?.deviceId===revokeId.trim()&&mounted.current)setEnrolled(false);
     return 'Device key revoked by the owner.';
    })}>Revoke device</button>
  </div>:null}
  <p role="status" className="text-sm">{message}</p>
 </section>;
}
