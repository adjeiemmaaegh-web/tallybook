/** Run 19 — owner-operated device UAT workspace.
 * No automatic PASS, no payments, no record mutation, no network, no
 * persistent browser evidence storage. Export JSON manually for review.
 */
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {Link} from "wouter";
import {db} from "@/db/TallybookDB";
import {useBusinessProfile} from "@/contexts/BusinessProfileContext";
import {getActiveBusinessProfileId} from "@/features/business/activeCompany";
import {requirePermission,currentStaffId} from "@/features/staff/staff";
import {assertRun7RetailWriteReady} from "@/features/backup/run7RetailWriteBarrier.mjs";
import {RUN19_CASES,run19DefaultResults,run19Summary,validateRun19Result,
 createRun19EvidencePayload,type Run19Status,type Run19Result} from "@/features/qa/run19Acceptance.mjs";
import {exportRun19Envelope,importRun19Envelope} from "@/features/qa/run19EvidenceEnvelope.mjs";
import {inspectRun19DeviceCapabilities,printRun19Diagnostic,
 type Run19CapabilityPreview} from "@/features/qa/run19DeviceProbes.mjs";

type Draft={note:string;evidenceFile:string};
type Choice=Exclude<Run19Status,"not-run">;
const defaultChoice:Choice="blocked";
const AREAS=["All areas",...new Set(RUN19_CASES.map(c=>c.area))];
const cleanError=(e:unknown)=>e instanceof Error?e.message:"Device acceptance evidence could not be processed.";

async function requireOwnerForRun19(company:string):Promise<void>{
 if(!company||getActiveBusinessProfileId()!==company)throw Error("Select the intended company again.");
 const actor=currentStaffId(company);
 await db.transaction("r",[db.appMeta,db.businessProfiles,db.staffMembers],async()=>{
  await assertRun7RetailWriteReady(db.appMeta);
  const staff=await requirePermission("staff",db,company);
  if(!staff||staff.role!=="owner"||staff.id!==actor||
    currentStaffId(company)!==actor||getActiveBusinessProfileId()!==company)
    throw Error("Unlock the company owner before viewing device acceptance.");
  if(!await db.businessProfiles.get(company))throw Error("Company no longer exists.");
 });
 if(currentStaffId(company)!==actor||getActiveBusinessProfileId()!==company)
   throw Error("Company owner session changed.");
}
export default function Run19DeviceAcceptancePage(){
 const {activeCompanyId}=useBusinessProfile();
 const [authorized,setAuthorized]=useState(false);
 const [authError,setAuthError]=useState("");
 const [results,setResults]=useState<Run19Result[]>(run19DefaultResults);
 const [drafts,setDrafts]=useState<Record<string,Draft>>({});
 const [choices,setChoices]=useState<Record<string,Choice>>({});
 const [area,setArea]=useState("All areas");
 const [sourceSha,setSourceSha]=useState("");
 const [deviceClass,setDeviceClass]=useState("");
 const [browser,setBrowser]=useState("");
 const [os,setOs]=useState("");
 const [operatorLabel,setOperatorLabel]=useState("");
 const [sampleConfirmed,setSampleConfirmed]=useState(false);
 const [noPaymentsConfirmed,setNoPaymentsConfirmed]=useState(false);
 const [noDeployConfirmed,setNoDeployConfirmed]=useState(false);
 const [probe,setProbe]=useState<Run19CapabilityPreview|null>(null);
 const [scanInput,setScanInput]=useState("");
 const [scanMessage,setScanMessage]=useState("No scanner interaction has been observed.");
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const inputRef=useRef<HTMLInputElement>(null);
 const ownerKey=activeCompanyId??"";
 useEffect(()=>{
  let active=true;
  setAuthorized(false);setAuthError("");setResults(run19DefaultResults());
  setDrafts({});setProbe(null);setScanInput("");setArea("All areas");
  setMessage("");setError("");
  if(!ownerKey){setAuthError("Select a company and unlock the owner first.");return;}
  void requireOwnerForRun19(ownerKey).then(()=>{if(active)setAuthorized(true);})
    .catch(e=>{if(active)setAuthError(cleanError(e));});
  return()=>{active=false;};
 },[ownerKey]);
 const counts=useMemo(()=>run19Summary(results),[results]);
 const filtered=useMemo(()=>RUN19_CASES.filter(row=>area==="All areas"||row.area===area),[area]);
 const current=useCallback(async()=>{
  if(!authorized)throw Error("Owner-only device acceptance is locked.");
  await requireOwnerForRun19(ownerKey);
 },[authorized,ownerKey]);
 const record=(caseId:string)=>{
  setError("");setMessage("");
  const currentStatus=choices[caseId]??defaultChoice;
  const draft=drafts[caseId]??{note:"",evidenceFile:""};
  const candidate={
   caseId,status:currentStatus,note:draft.note.trim(),
   evidenceFile:draft.evidenceFile.trim(),observedAt:new Date().toISOString()
  };
  try{
   const row=validateRun19Result(candidate);
   setResults(list=>list.map(item=>item.caseId===caseId?row:item));
   setMessage(caseId+" observation recorded locally. This is not acceptance signoff.");
  }catch(e){setError(cleanError(e));}
 };
 const resetCase=(caseId:string)=>{
  setResults(list=>list.map(item=>item.caseId===caseId?
    {caseId,status:"not-run",note:"",evidenceFile:"",observedAt:null}:item));
  setDrafts(all=>({...all,[caseId]:{note:"",evidenceFile:""}}));
  setMessage("Case "+caseId+" has no active recorded observation.");
 };
 const collectPayload=()=>{
  if(!sampleConfirmed||!noPaymentsConfirmed||!noDeployConfirmed)
    throw Error("Explicitly confirm disposable test data, no payments and no external deployment.");
  return createRun19EvidencePayload({
   sourceSha,createdAt:new Date().toISOString(),deviceClass:deviceClass.trim(),
   browser:browser.trim(),os:os.trim(),operatorLabel:operatorLabel.trim(),
   sampleDataOnly:true,noLivePayments:true,noExternalDeployment:true,results
  });
 };
 const exportReport=async()=>{
  if(busy)return;setBusy(true);setError("");setMessage("");
  try{
   await current();
   const text=await exportRun19Envelope(collectPayload());
   await current();
   const name="tallybook-run19-"+sourceSha.slice(0,12).toLowerCase()+"-evidence.json";
   const blob=new Blob([text],{type:"application/json"});
   const url=URL.createObjectURL(blob);
   const anchor=document.createElement("a");anchor.href=url;anchor.download=name;
   document.body.append(anchor);
   try{anchor.click();}finally{
    anchor.remove();window.setTimeout(()=>URL.revokeObjectURL(url),60000);
   }
   setMessage("Evidence JSON prepared. Keep this file and referenced screenshots/logs together, outside your live Tallybook profile. File hash is not an owner signature.");
  }catch(e){setError(cleanError(e));}finally{setBusy(false);}
 };
 const importReport=async(file:File|undefined)=>{
  if(!file||busy)return;
  setBusy(true);setError("");setMessage("");
  try{
   await current();
   if(file.size>768*1024)throw Error("Evidence archive exceeds the 768 KiB import limit.");
   const received=await importRun19Envelope(await file.text());
   await current();
   setResults(received.payload.results.map(row=>({...row})));
   setSourceSha(received.payload.sourceSha);setDeviceClass(received.payload.deviceClass);
   setBrowser(received.payload.browser);setOs(received.payload.os);
   setOperatorLabel(received.payload.operatorLabel);
   setSampleConfirmed(false);setNoPaymentsConfirmed(false);setNoDeployConfirmed(false);
   setDrafts(Object.fromEntries(received.payload.results.map(row=>[
     row.caseId,{note:row.note,evidenceFile:row.evidenceFile}
   ])));
   setChoices(Object.fromEntries(received.payload.results.filter(r=>r.status!=="not-run")
     .map(row=>[row.caseId,row.status as Choice])));
   setMessage("Archive hash matched. Imported observations require independent original-artifact inspection; no acceptance is granted.");
  }catch(e){setError(cleanError(e));}finally{setBusy(false);}
 };
 if(!authorized)return <section className="mx-auto max-w-3xl space-y-4 p-5" aria-label="Run 19 owner-only device acceptance">
   <h1 className="text-2xl font-semibold">Real-device acceptance workspace</h1>
   <p role={authError?"alert":"status"}>{authError||"Checking company owner authorization…"}</p>
   <Link href="/staff" className="underline">Staff unlock</Link>
 </section>;
 return <section className="mx-auto max-w-5xl space-y-6 p-4 sm:p-7" aria-label="Run 19 real-device acceptance evidence">
   <header className="space-y-2">
    <p className="text-sm font-semibold">Tallybook V19 · Run 19 · Source-only UAT tooling</p>
    <h1 className="text-3xl font-bold">Real-device evidence workspace</h1>
    <p>Only a real operator on actual hardware can record a manual result. This workspace does not run POS transactions, prove devices work, contact providers or grant production approval. Evidence stays in memory until you explicitly export a local file.</p>
    <p className="rounded border p-3 text-sm" role="status"><strong>Release: NO-GO.</strong> {counts.counts.pass} operator-recorded PASS, {counts.counts.fail} FAIL, {counts.counts.blocked} BLOCKED, {counts.counts["not-run"]} NOT RUN; {counts.criticalUnverified} mandatory checks lack recorded PASS. Counts are observations, not independently validated acceptance.</p>
   </header>
   {error?<p role="alert" className="rounded border border-red-700 p-3">{error}</p>:null}
   {message?<p role="status" className="rounded border p-3">{message}</p>:null}
   <section className="space-y-3 rounded border p-4" aria-labelledby="run19-context-heading">
     <h2 id="run19-context-heading" className="text-lg font-semibold">1. Identify exact source and disposable device</h2>
     <p className="text-sm">Use the exact Git commit deployed to the device, not an earlier branch commit. Keep personal contacts, PINs, merchant keys and payment data out of notes and screenshots.</p>
     <div className="grid gap-3 sm:grid-cols-2">
       <label className="text-sm">Exact 40-character Git source SHA
         <input className="mt-1 block w-full rounded border p-2 font-mono" value={sourceSha} maxLength={40}
           placeholder="Paste actual installed source commit" onChange={e=>setSourceSha(e.target.value)} spellCheck={false}/>
       </label>
       <label className="text-sm">Device class, not device serial number
         <input className="mt-1 block w-full rounded border p-2" value={deviceClass} maxLength={100}
           placeholder="Windows 11 8 GB CPU-only" onChange={e=>setDeviceClass(e.target.value)}/>
       </label>
       <label className="text-sm">Operating system/version
         <input className="mt-1 block w-full rounded border p-2" value={os} maxLength={100}
           placeholder="Windows 11 / Android version" onChange={e=>setOs(e.target.value)}/>
       </label>
       <label className="text-sm">Browser/version
         <input className="mt-1 block w-full rounded border p-2" value={browser} maxLength={100}
           placeholder="Edge / Chrome / Firefox / Safari" onChange={e=>setBrowser(e.target.value)}/>
       </label>
       <label className="text-sm">Operator role label (no legal name)
         <input className="mt-1 block w-full rounded border p-2" value={operatorLabel} maxLength={100}
           placeholder="Owner reviewer A" onChange={e=>setOperatorLabel(e.target.value)}/>
       </label>
     </div>
     <label className="block text-sm"><input type="checkbox" checked={sampleConfirmed}
       onChange={e=>setSampleConfirmed(e.target.checked)}/> I am using disposable/sample records, not my live business ledger.</label>
     <label className="block text-sm"><input type="checkbox" checked={noPaymentsConfirmed}
       onChange={e=>setNoPaymentsConfirmed(e.target.checked)}/> No real Mobile Money/card charges, refunds or bank transactions will be attempted.</label>
     <label className="block text-sm"><input type="checkbox" checked={noDeployConfirmed}
       onChange={e=>setNoDeployConfirmed(e.target.checked)}/> No deployment, cloud publication or live provider is authorized by this UAT document.</label>
   </section>
   <section className="space-y-3 rounded border p-4" aria-labelledby="run19-tools-heading">
     <h2 id="run19-tools-heading" className="text-lg font-semibold">2. Optional physical-device diagnostics</h2>
     <p className="text-sm">Browser API presence is not a hardware PASS. The actions below never create a sale, request camera/microphone access, register an authenticator or contact a payment provider.</p>
     <button className="rounded border p-2" type="button" onClick={()=>{
       try{setProbe(inspectRun19DeviceCapabilities());}catch(e){setError(cleanError(e));}
     }}>Inspect browser API availability (not UAT)</button>
     {probe?<div role="status" className="rounded border p-3">
       <strong>API presence only — no device workflow verified</strong>
       <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
        {probe.results.map(item=><li key={item.label}>{item.label}: {item.detected?"API visible":"Not visible"}</li>)}
       </ul>
     </div>:null}
     <div className="grid gap-3 sm:grid-cols-2">
      <section className="rounded border p-3 space-y-2">
       <h3 className="font-semibold">Scanner input sandbox</h3>
       <p className="text-sm">Focus below, scan a *sample* barcode and press Enter. Only its length is shown, never the actual code. It is not added to inventory.</p>
       <label className="block text-sm">Test-only scan field
        <input className="mt-1 block w-full rounded border p-2" value={scanInput}
          maxLength={256} autoComplete="off" onChange={e=>setScanInput(e.target.value)}
          onKeyDown={e=>{
           if(e.key!=="Enter")return;
           e.preventDefault();setScanMessage("Received "+scanInput.length+" characters in the focused test field. Operator must verify scanner behavior manually.");
           setScanInput("");
          }}/>
       </label>
       <p role="status" className="text-sm">{scanMessage}</p>
      </section>
      <section className="rounded border p-3 space-y-2">
       <h3 className="font-semibold">Printer test page</h3>
       <p className="text-sm">Only a fixed TEST PAGE is sent to the browser print dialog; not a receipt, no real transaction or customer data.</p>
       <button className="rounded border p-2" type="button" onClick={()=>{
        try{printRun19Diagnostic();setMessage("Test-only printer dialog requested. Record a PASS only after examining a physical print and retaining evidence.");}
        catch(e){setError(cleanError(e));}
       }}>Open test-only printer dialog</button>
      </section>
     </div>
   </section>
   <section className="space-y-3 rounded border p-4" aria-labelledby="run19-cases-heading">
    <h2 id="run19-cases-heading" className="text-lg font-semibold">3. Record factual manual outcomes</h2>
    <p className="text-sm">Select an outcome after performing the check on a disposable device. PASS requires a factual 20+ character observation and a separately retained screenshot/log filename. No check automatically becomes PASS.</p>
    <label className="block text-sm">Filter checklist
      <select className="mt-1 block rounded border p-2" value={area}
        onChange={e=>setArea(e.target.value)}>
        {AREAS.map(name=><option key={name} value={name}>{name}</option>)}
      </select>
    </label>
    {filtered.map(test=>{
      const saved=results.find(row=>row.caseId===test.id)!;
      const draft=drafts[test.id]??{note:saved.note,evidenceFile:saved.evidenceFile};
      const choice=choices[test.id]??defaultChoice;
      return <article key={test.id} className="space-y-3 rounded border p-3">
       <h3 className="font-semibold">{test.id} · {test.area} · {test.platform}{test.critical?" · Required":""}</h3>
       <p className="text-sm">{test.description}</p>
       <p className="text-sm">Recorded: <strong>{saved.status.toUpperCase()}</strong>{saved.observedAt?" · "+new Date(saved.observedAt).toLocaleString():""}</p>
       <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-sm">Manual outcome
         <select className="mt-1 block w-full rounded border p-2" value={choice}
          onChange={e=>setChoices(all=>({...all,[test.id]:e.target.value as Choice}))}>
          <option value="blocked">Blocked / unavailable</option>
          <option value="pass">Observed PASS (evidence required)</option>
          <option value="fail">Observed FAIL</option>
          {!test.critical?<option value="not-applicable">Not applicable</option>:null}
         </select>
        </label>
        <label className="text-sm">Retained evidence filename (no URLs or local paths)
         <input className="mt-1 block w-full rounded border p-2" maxLength={140}
          placeholder="R19-W01-screenshot.png"
          value={draft.evidenceFile} onChange={e=>setDrafts(all=>({...all,[test.id],note:all[test.id]?.note??saved.note,evidenceFile:e.target.value}))}/>
        </label>
       </div>
       <label className="block text-sm">Exact observed result / failure / blocker (20–600 characters, no PII)
        <textarea className="mt-1 block w-full rounded border p-2" rows={2}
         maxLength={600} placeholder="Describe what happened on this physical device, rather than what the source was intended to do."
         value={draft.note} onChange={e=>setDrafts(all=>({...all,[test.id],evidenceFile:all[test.id]?.evidenceFile??saved.evidenceFile,note:e.target.value}))}/>
       </label>
       <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded border p-2"
          onClick={()=>record(test.id)}>Record observed outcome</button>
        <button type="button" className="rounded border p-2"
          onClick={()=>resetCase(test.id)}>Reset to not run</button>
       </div>
      </article>;
    })}
   </section>
   <section className="space-y-3 rounded border p-4" aria-labelledby="run19-evidence-heading">
    <h2 id="run19-evidence-heading" className="text-lg font-semibold">4. Export or reopen an evidence package</h2>
    <p className="text-sm">A SHA-256 digest checks file integrity only. It does not authenticate an operator, prove screenshots are genuine, sign off this run or permit a commercial release. Referenced artifacts must be independently retained and reviewed.</p>
    <div className="flex flex-wrap items-center gap-3">
     <button className="rounded border bg-slate-900 p-3 text-white" type="button"
       disabled={busy||!sampleConfirmed||!noPaymentsConfirmed||!noDeployConfirmed}
       onClick={()=>void exportReport()}>{busy?"Working locally…":"Download Run 19 evidence JSON"}</button>
     <label className="rounded border p-3 text-sm">
      Reopen a previously exported Run 19 JSON
      <input ref={inputRef} className="mt-2 block w-full" type="file"
       accept=".json,application/json" disabled={busy}
       onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value="";void importReport(file);}}/>
     </label>
    </div>
    <p className="text-sm font-semibold">Current development and release status: NO-GO. Real-device evidence and independent owner signoff remain outstanding.</p>
   </section>
 </section>;
}
