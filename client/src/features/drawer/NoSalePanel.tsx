import { useCallback, useEffect, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import { db } from '@/db/TallybookDB';
import { getActiveBusinessProfileId } from '@/features/business/activeCompany';
import { currentStaffId, STAFF_SESSION_CHANGED } from '@/features/staff/staff';
import { recordAuthorizedNoSale, type DrawerReason } from './noSaleEvent.ts';

/** Explicitly records a local event; it does NOT electrically actuate a drawer. */
export function NoSalePanel({companyId}:{companyId:string}) {
 const [stores,setStores]=useState<Array<{id:string;name:string}>>([]);
 const [devices,setDevices]=useState<Array<{id:string;label:string}>>([]);
 const [storeId,setStoreId]=useState('');
 const [deviceId,setDeviceId]=useState('');
 const [reason,setReason]=useState<DrawerReason>('change_requested');
 const [note,setNote]=useState('');
 const [pin,setPin]=useState('');
 const [busy,setBusy]=useState(false);
 const [feedback,setFeedback]=useState('');
 const operationKeyRef=useRef<string|null>(null);
 const load=useCallback(async()=>{
  const actor=currentStaffId(companyId);
  if(!actor || getActiveBusinessProfileId()!==companyId){setStores([]);setDevices([]);return;}
  const [locations,assignments,registered]=await Promise.all([
   db.storeLocations.where('businessProfileId').equals(companyId).toArray(),
   db.storeAssignments.where('businessProfileId').equals(companyId).toArray(),
   db.syncDevices.where('businessProfileId').equals(companyId).toArray(),
  ]);
  if(getActiveBusinessProfileId()!==companyId || currentStaffId(companyId)!==actor)return;
  setStores(locations.filter(x=>x.status==='active'&&assignments.some(a=>a.staffId===actor&&a.storeId===x.id)).map(x=>({id:x.id,name:x.name})));
  setDevices(registered.filter(x=>x.status==='active').map(x=>({id:x.id,label:x.label})));
 },[companyId]);
 useEffect(()=>{
  operationKeyRef.current=null;setPin('');setNote('');setFeedback('');setStoreId('');setDeviceId('');
  void load();
  const onSession=()=>{operationKeyRef.current=null;setStoreId('');setDeviceId('');void load();};
  window.addEventListener(STAFF_SESSION_CHANGED,onSession);
  return ()=>window.removeEventListener(STAFF_SESSION_CHANGED,onSession);
 },[companyId,load]);
 async function save(){
  const staffId=currentStaffId(companyId);
  if(!staffId){setFeedback('Unlock your staff account first.');return;}
  setBusy(true);setFeedback('');
  try {
   if(!operationKeyRef.current) operationKeyRef.current=`no-sale-${nanoid(18)}`;
   await recordAuthorizedNoSale({staffId,pin,storeId,deviceId,reason,note,operationKey:operationKeyRef.current});
   operationKeyRef.current=null;
   setPin('');setNote('');setFeedback('No-sale drawer request logged. Hardware drawer activation is not provided by Tallybook.');
  }catch(err){setFeedback(err instanceof Error?err.message:'Could not record drawer event.');}
  finally{setBusy(false);}
 }
 return <section className="rounded-xl border p-4 space-y-3" aria-label="No-sale drawer event">
  <h2 className="font-semibold">No sale / Open drawer</h2>
  <p className="text-sm text-muted-foreground">Records a reason and PIN-authorized request; this button does not control physical drawer hardware.</p>
  <div className="grid gap-2 sm:grid-cols-2">
   <select aria-label="Drawer store" className="rounded border p-3 bg-background" value={storeId} onChange={e=>setStoreId(e.target.value)}><option value="">Assigned store</option>{stores.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>
   <select aria-label="Registered device" className="rounded border p-3 bg-background" value={deviceId} onChange={e=>setDeviceId(e.target.value)}><option value="">Registered local device</option>{devices.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select>
   <select aria-label="Drawer reason" className="rounded border p-3 bg-background" value={reason} onChange={e=>setReason(e.target.value as DrawerReason)}><option value="change_requested">Change requested</option><option value="cash_check">Cash check</option><option value="drawer_inspection">Drawer inspection</option><option value="other">Other</option></select>
   <input aria-label="Drawer PIN" type="password" inputMode="numeric" value={pin} onChange={e=>setPin(e.target.value)} className="rounded border p-3" placeholder="Re-enter staff PIN" />
  </div>
  <input aria-label="Drawer note" value={note} onChange={e=>setNote(e.target.value)} maxLength={200} className="rounded border p-3 w-full" placeholder="Optional note" />
  <button className="rounded bg-primary text-primary-foreground p-3" type="button" disabled={busy||!pin||!storeId||!deviceId} onClick={()=>void save()}>{busy?'Saving…':'Record no-sale drawer request'}</button>
  {feedback&&<p role="status" className="text-sm">{feedback}</p>}
 </section>;
}
