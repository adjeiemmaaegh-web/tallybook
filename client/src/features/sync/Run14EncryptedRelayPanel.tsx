/** Run 14 — deliberate opt-in encrypted replica console.
 * No periodic jobs, auto uploads, stored credentials or remote ledger apply.
 */
import {useCallback,useEffect,useState} from "react";
import {db} from "@/db/TallybookDB";
import {getActiveBusinessProfileId} from "@/features/business/activeCompany";
import {requirePermission} from "@/features/staff/staff";
import {setSyncConsent} from "@/features/sync/syncFoundation";
import {registerLocalSyncDevice,listLocalSyncDevices,type LocalSyncDevice} from "@/features/sync/deviceRegistry";
import {queueRun14Evidence,pendingRun14Envelopes,inspectRun14InboxItem,
 type Run14SourceTable,type Run14QueuedEnvelope} from "@/features/sync/run14LocalRelay";
import {sendOneRun14Event,pullOneRun14Page,RUN14_NETWORK_RELEASE_ENABLED} from "@/features/sync/run14RelayTransport";

const tables:Array<{key:Run14SourceTable;label:string}>=[
 {key:"sales",label:"Sales"},
 {key:"purchases",label:"Supplier purchases"},
 {key:"inventoryMovements",label:"Inventory movements"},
 {key:"inventoryCostEvents",label:"Inventory costing evidence"},
 {key:"storeTransferRequests",label:"Store transfer requests"},
 {key:"saleReversals",label:"Full-sale reversal"},
 {key:"cashPartialReturns",label:"Cash partial returns"}
];
export function Run14EncryptedRelayPanel({companyId}:{companyId:string}){
 const [consent,setConsent]=useState(false);
 const [devices,setDevices]=useState<LocalSyncDevice[]>([]);
 const [deviceId,setDeviceId]=useState("");
 const [deviceLabel,setDeviceLabel]=useState("");
 const [table,setTable]=useState<Run14SourceTable>("sales");
 const [sourceRecords,setSourceRecords]=useState<Array<{id:string;description:string}>>([]);
 const [sourceId,setSourceId]=useState("");
 const [passphrase,setPassphrase]=useState("");
 const [endpoint,setEndpoint]=useState("");
 const [capability,setCapability]=useState("");
 const [session,setSession]=useState("");
 const [pending,setPending]=useState<Run14QueuedEnvelope[]>([]);
 const [inboxCount,setInboxCount]=useState(0);
 const [conflictCount,setConflictCount]=useState(0);
 const [inspectCursor,setInspectCursor]=useState("");
 const [inspection,setInspection]=useState("");
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const refresh=useCallback(async()=>{
   if(companyId!==getActiveBusinessProfileId())throw Error("Company changed.");
   const [preference,registered,queued,received,conflicts]=await Promise.all([
     db.syncConsents.get(companyId),listLocalSyncDevices(db,companyId),
     pendingRun14Envelopes(companyId,db),
     db.syncReplicaInbox.where("businessProfileId").equals(companyId).count(),
     db.syncReplicaConflicts.where("businessProfileId").equals(companyId).count(),
   ]);
   if(companyId!==getActiveBusinessProfileId())throw Error("Company changed.");
   setConsent(preference?.enabled===true);
   setDevices(registered);setPending(queued);
   setInboxCount(received);setConflictCount(conflicts);
 },[companyId]);
 useEffect(()=>{setDevices([]);setDeviceId("");setPassphrase("");
   setEndpoint("");setCapability("");setSession("");
   setPending([]);setInspection("");setMessage("");setSourceId("");
   void refresh().catch(error=>setMessage(error instanceof Error?error.message:"Could not read local encrypted sync state."));
 },[refresh]);
 useEffect(()=>{
   let active=true;setSourceId("");setSourceRecords([]);
   if(!companyId)return;
   void db.transaction("r",db.staffMembers,db.table(table),async()=>{
     await requirePermission("staff",db,companyId);
     const rows=await db.table(table).where("businessProfileId").equals(companyId).reverse().limit(25).toArray();
     if(companyId!==getActiveBusinessProfileId())throw Error("Company changed.");
     return rows as Array<{id:string;createdAt?:string}>;
   }).then(rows=>{if(active)setSourceRecords(rows.map(r=>({
     id:r.id,description:r.id+(r.createdAt?" · "+new Date(r.createdAt).toLocaleString():"")
   })));}).catch(error=>{if(active)setMessage(error instanceof Error?error.message:"Cannot read ledger evidence.");});
   return()=>{active=false;};
 },[companyId,table]);
 const perform=async(fn:()=>Promise<unknown>)=>{
   setBusy(true);setMessage("");
   try{await fn();await refresh();}
   catch(error){setMessage(error instanceof Error?error.message:"Encrypted sync operation failed.");}
   finally{setBusy(false);}
 };
 return <section className="space-y-3 rounded border p-4" aria-label="Run 14 encrypted replica preparation">
  <h2 className="text-lg font-semibold">Optional encrypted evidence relay</h2>
  <p className="text-sm">Encrypted copies only. No remote entry can create a sale, alter stock, settle a payment or change staff permissions. Cloud relay remains disabled until formal acceptance and owner activation.</p>
  <p role="status" className="text-sm">Network relay: <strong>{RUN14_NETWORK_RELEASE_ENABLED?"Activation available":"Disabled pending acceptance"}</strong>. Local consent: {consent?"Enabled":"Off"}. Pending encrypted copies: {pending.length}. Locally inspected ciphertext copies: {inboxCount}. Unresolved relay conflicts: {conflictCount}.</p>
  {message?<p className="rounded border p-2 text-sm" role="alert">{message}</p>:null}
  <div className="flex flex-wrap gap-2">
   <button type="button" className="rounded border p-2" disabled={busy||consent} onClick={()=>void perform(()=>setSyncConsent(db,companyId,true))}>Enable local opt-in</button>
   <button type="button" className="rounded border p-2" disabled={busy||!consent} onClick={()=>void perform(()=>setSyncConsent(db,companyId,false))}>Disable local opt-in</button>
  </div>
  <label className="block text-sm">Local device label (not server authentication)
    <input className="block w-full rounded border p-2" maxLength={80} value={deviceLabel} onChange={e=>setDeviceLabel(e.target.value)} placeholder="Store office laptop"/>
  </label>
  <button className="rounded border p-2" type="button" disabled={busy||!consent||deviceLabel.trim().length<2} onClick={()=>void perform(async()=>{
    const id=crypto.randomUUID();
    await registerLocalSyncDevice(db,companyId,id,deviceLabel);
    setDeviceId(id);setDeviceLabel("");
  })}>Register local device</button>
  <label className="block text-sm">Device
   <select className="block w-full rounded border p-2" value={deviceId} onChange={e=>setDeviceId(e.target.value)}>
    <option value="">Choose active device</option>{devices.filter(x=>x.status==="active").map(x=><option key={x.id} value={x.id}>{x.label}</option>)}
   </select>
  </label>
  <label className="block text-sm">Saved local evidence
   <select className="block w-full rounded border p-2" value={table} onChange={e=>setTable(e.target.value as Run14SourceTable)}>
    {tables.map(t=><option key={t.key} value={t.key}>{t.label}</option>)}
   </select>
  </label>
  <label className="block text-sm">Source record
   <select className="block w-full rounded border p-2" value={sourceId} onChange={e=>setSourceId(e.target.value)}>
     <option value="">Select saved record</option>{sourceRecords.map(r=><option key={r.id} value={r.id}>{r.description}</option>)}
   </select>
  </label>
  <label className="block text-sm">Owner-provided shared encryption passphrase (not saved)
   <input type="password" autoComplete="off" className="block w-full rounded border p-2" value={passphrase} onChange={e=>setPassphrase(e.target.value)} minLength={16}/>
  </label>
  <button className="rounded border p-2" type="button" disabled={busy||!consent||!deviceId||!sourceId||passphrase.length<16} onClick={()=>void perform(async()=>{
    await queueRun14Evidence({companyId,deviceId,sourceTable:table,recordId:sourceId,passphrase},db);
    setPassphrase("");setMessage("One immutable source record was encrypted and queued locally. No data was transmitted.");
  })}>Encrypt and queue selected evidence locally</button>
  <h3 className="font-semibold">Explicit relay operations (release-gated)</h3>
  <p className="text-sm">Never enter real access credentials before the owner approves the isolated server, independent device authorization and full QA.</p>
  <label className="block text-sm">HTTPS relay endpoint
   <input className="block w-full rounded border p-2" value={endpoint} onChange={e=>setEndpoint(e.target.value)} placeholder="https://approved-host.example/api/sync/replication/events"/>
  </label>
  <label className="block text-sm">Single-use signed capability
   <input type="password" autoComplete="off" className="block w-full rounded border p-2" value={capability} onChange={e=>setCapability(e.target.value)}/>
  </label>
  <label className="block text-sm">Active server session
   <input type="password" autoComplete="off" className="block w-full rounded border p-2" value={session} onChange={e=>setSession(e.target.value)}/>
  </label>
  <div className="flex flex-wrap gap-2">
   <button className="rounded border p-2" type="button" disabled={busy||!RUN14_NETWORK_RELEASE_ENABLED||!pending.length||!endpoint||!capability||!session} onClick={()=>void perform(async()=>{
    const next=pending[0];await sendOneRun14Event(db,companyId,next.id,endpoint,{capability,session});
   })}>Send one encrypted copy</button>
   <button className="rounded border p-2" type="button" disabled={busy||!RUN14_NETWORK_RELEASE_ENABLED||!deviceId||passphrase.length<16||!endpoint||!capability||!session} onClick={()=>void perform(async()=>{
    await pullOneRun14Page(db,companyId,deviceId,endpoint,{capability,session},passphrase);
   })}>Pull and verify one encrypted page</button>
  </div>
  <label className="block text-sm">Review received encrypted copy by cursor
   <input type="number" min="1" step="1" className="block w-full rounded border p-2" value={inspectCursor} onChange={e=>setInspectCursor(e.target.value)}/>
  </label>
  <button className="rounded border p-2" type="button" disabled={busy||!Number.isSafeInteger(Number(inspectCursor))||Number(inspectCursor)<1||passphrase.length<16} onClick={()=>void perform(async()=>{
    const data=await inspectRun14InboxItem(db,companyId,Number(inspectCursor),passphrase);
    setInspection(data.recordKind+" / "+data.recordId+" (read-only copy, never applied)");
  })}>Decrypt selected copy for read-only review</button>
  {inspection?<p className="text-sm" role="status">{inspection}</p>:null}
 </section>;
}
