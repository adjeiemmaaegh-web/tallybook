/** Run 20 — owner-only READ-ONLY operations and release readiness.
 * This surface never signs a release, changes a ledger, deploys, sends private
 * records to a network endpoint, or accepts a manual PASS as an approval.
 */
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {Link} from "wouter";
import {getActiveBusinessProfileId} from "@/features/business/activeCompany";
import {currentStaffId,STAFF_SESSION_CHANGED} from "@/features/staff/staff";
import {getRun20Diagnostics,type Run20Diagnostics} from "@/features/release/run20LocalDiagnostics";
import {RUN20_GATES,defaultRun20Evidence,validateRun20Evidence,
 evaluateRun20Release,type Run20GateStatus,type Run20Evidence} from "@/features/release/run20ReleaseGates.mjs";
import {exportRun20Worksheet,importRun20Worksheet} from "@/features/release/run20WorksheetEnvelope.mjs";
import {importRun19Envelope} from "@/features/qa/run19EvidenceEnvelope.mjs";
import {run19CrossDeviceCoverage,type Run19EvidencePayload,
 type Run19CombinedCoverage} from "@/features/qa/run19Acceptance.mjs";
type Draft={status:Exclude<Run20GateStatus,"not-run">;reviewerRole:string;note:string;evidenceFile:string};
const emptyDraft=():Draft=>({status:"blocked",reviewerRole:"owner",note:"",evidenceFile:""});
const roles=["owner","finance-reviewer","security-reviewer","device-reviewer","operations-reviewer"];
const readable=(e:unknown)=>e instanceof Error?e.message:"Unable to review local release evidence.";

export default function Run20OperationsPage(){
 const [company,setCompany]=useState("");
 const [ownerId,setOwnerId]=useState<string|null>(null);
 const [authorized,setAuthorized]=useState(false);
 const [diagnostics,setDiagnostics]=useState<Run20Diagnostics|null>(null);
 const [sourceSha,setSourceSha]=useState("");
 const [gateRows,setGateRows]=useState<Run20Evidence[]>(defaultRun20Evidence);
 const [drafts,setDrafts]=useState<Record<string,Draft>>({});
 const [platformEvidence,setPlatformEvidence]=useState<Run19EvidencePayload[]>([]);
 const [coverage,setCoverage]=useState<Run19CombinedCoverage|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [area,setArea]=useState("All");
 const pending=useRef(false);
 const identity=useRef<{company:string;actor:string}|null>(null);
 const reportInput=useRef<HTMLInputElement>(null);
 const qaInput=useRef<HTMLInputElement>(null);
 const reset=useCallback(()=>{
   identity.current=null;setAuthorized(false);setDiagnostics(null);setGateRows(defaultRun20Evidence());
   setDrafts({});setCoverage(null);setPlatformEvidence([]);
   setSourceSha("");setMessage("");
 },[]);
 const refresh=useCallback(async(integrity=false)=>{
   if(pending.current)return;
   pending.current=true;setBusy(true);setError("");
   try{
     const active=getActiveBusinessProfileId();
     const actor=currentStaffId(active);
     if(!active||!actor)throw Error("Unlock the company owner to inspect operations.");
     const snapshot=await getRun20Diagnostics(integrity);
     if(snapshot.companyId!==active||getActiveBusinessProfileId()!==active||
        currentStaffId(active)!==actor)
       throw Error("Company or owner session changed while inspecting operations.");
     identity.current={company:active,actor};
     setCompany(active);setOwnerId(actor);setDiagnostics(snapshot);setAuthorized(true);
   }catch(e){
     reset();setError(readable(e));
   }finally{pending.current=false;setBusy(false);}
 },[reset]);
 useEffect(()=>{
   let live=true;
   const onCheck=()=>{
     if(!live)return;
     const current=getActiveBusinessProfileId();
     if(identity.current&&(current!==identity.current.company||
       currentStaffId(current)!==identity.current.actor)){
       reset();
     }
     void refresh(false);
   };
   const onFocus=()=>{if(document.visibilityState==="visible")onCheck();};
   window.addEventListener(STAFF_SESSION_CHANGED,onCheck);
   window.addEventListener("focus",onFocus);
   document.addEventListener("visibilitychange",onFocus);
   void refresh(false);
   return()=>{live=false;window.removeEventListener(STAFF_SESSION_CHANGED,onCheck);
     window.removeEventListener("focus",onFocus);
     document.removeEventListener("visibilitychange",onFocus);};
 },[refresh,reset]);
 const guard=async()=>{
   if(!authorized||!diagnostics)throw Error("Operations review is locked.");
   if(getActiveBusinessProfileId()!==company||currentStaffId(company)!==ownerId)
     throw Error("Company or owner session changed.");
   const snapshot=await getRun20Diagnostics(false);
   if(snapshot.companyId!==company)throw Error("Company switched during release preparation.");
 };
 const assessed=useMemo(()=>{
   if(!/^[a-f0-9]{40}$/i.test(sourceSha))return null;
   try{return evaluateRun20Release({sourceSha,asOf:new Date().toISOString(),evidence:gateRows});}
   catch{return null;}
 },[sourceSha,gateRows]);
 const visible=RUN20_GATES.filter(x=>area==="All"||x.domain===area);
 const record=async(gateId:string)=>{
   setError("");setMessage("");
   try{
     await guard();
     const draft=drafts[gateId]??emptyDraft();
     const row=validateRun20Evidence({
       gateId,status:draft.status,sourceSha,
       observedAt:new Date().toISOString(),reviewerRole:draft.reviewerRole,
       evidenceFile:draft.evidenceFile.trim(),note:draft.note.trim()
     },sourceSha);
     setGateRows(list=>list.map(x=>x.gateId===gateId?row:x));
     setMessage("Local review claim recorded for "+gateId+". No release authorization has occurred.");
   }catch(e){setError(readable(e));}
 };
 const exportWorksheet=async()=>{
   if(busy)return;setBusy(true);setError("");setMessage("");
   try{
     await guard();
     const text=await exportRun20Worksheet({sourceSha,
       asOf:new Date().toISOString(),evidence:gateRows});
     await guard();
     const blob=new Blob([text],{type:"application/json"});
     const url=URL.createObjectURL(blob);
     const link=document.createElement("a");
     link.href=url;link.download="tallybook-v19-run20-readiness-"+sourceSha.slice(0,12)+".json";
     document.body.append(link);
     try{link.click();}finally{link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),60000);}
     setMessage("NO-GO worksheet exported locally. Independent review and explicit owner approval remain outstanding.");
   }catch(e){setError(readable(e));}finally{setBusy(false);}
 };
 const importWorksheet=async(file?:File)=>{
   if(!file||busy)return;setBusy(true);setError("");setMessage("");
   try{
     await guard();
     if(file.size>384000)throw Error("Release worksheet exceeds 384 KiB.");
     const received=await importRun20Worksheet(await file.text());
     await guard();
     setSourceSha(received.sourceSha);
     setGateRows(received.evidence.map(x=>({...x})));
     setDrafts(Object.fromEntries(received.evidence.filter(x=>x.status!=="not-run")
       .map(x=>[x.gateId,{status:x.status as Draft["status"],note:x.note,
        evidenceFile:x.evidenceFile,reviewerRole:x.reviewerRole}])));
     setPlatformEvidence([]);setCoverage(null);
     setMessage("Reopened hash-matched worksheet. Original evidence and signatures are still unverified. Release: NO-GO.");
   }catch(e){setError(readable(e));}finally{setBusy(false);}
 };
 const importDeviceFiles=async(files:File[])=>{
   if(!files.length||busy)return;setBusy(true);setError("");setMessage("");
   try{
     await guard();
     if(!/^[a-f0-9]{40}$/i.test(sourceSha))throw Error("Enter exact release source SHA before adding device evidence.");
     const collected:Run19EvidencePayload[]=[];
     if(files.length>12)throw Error("Import at most 12 device reports at once.");
     for(const file of Array.from(files)){
       if(file.size>768*1024)throw Error("Device evidence file exceeds 768 KiB.");
       const received=await importRun19Envelope(await file.text());
       if(received.payload.sourceSha!==sourceSha.toLowerCase())
         throw Error("Run 19 device evidence does not match the selected exact source SHA.");
       collected.push(received.payload);
     }
     await guard();
     const all=[...platformEvidence,...collected];
     const result=run19CrossDeviceCoverage(all);
     setPlatformEvidence(all);setCoverage(result);
     setMessage("Device report HASHES match. No physical screenshot, real printer or independent witness has been verified.");
   }catch(e){setError(readable(e));}finally{setBusy(false);}
 };
 return <section className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8" aria-label="Tallybook Run 20 owner operations">
   <header className="space-y-2">
     <p className="text-sm font-semibold">Tallybook V19 · Run 20 · Operations and decision</p>
     <h1 className="text-3xl font-semibold">Release operations and evidence</h1>
     <p>Source-only, offline and owner-controlled. No staging, production, provider payments, cloud financial sync, storefront publication, database mutation or release promotion is performed here.</p>
     <p role="status" className="rounded border p-3"><strong>Current release decision: NO-GO.</strong> Development of all 20 source increments does not satisfy the acceptance gates or grant permission to deploy.</p>
   </header>
   {error?<p role="alert" className="rounded border border-red-700 p-3">{error}</p>:null}
   {message?<p role="status" className="rounded border p-3">{message}</p>:null}
   {!authorized?<div className="rounded border p-4 space-y-2" role="status">
     <p>Unlock an active company owner to read local release diagnostics.</p>
     <Link href="/staff" className="underline">Open staff unlock</Link>
     <button type="button" className="block rounded border p-2" disabled={busy}
       onClick={()=>void refresh(false)}>Check owner access</button>
   </div>:<>
    <section className="space-y-3 rounded border p-4" aria-label="Recovery and backup diagnostics">
      <h2 className="text-xl font-semibold">1. Read-only operational health</h2>
      <p className="text-sm">Device status is not staging monitoring, an external backup or a verified financial audit.</p>
      <div className="flex flex-wrap gap-2">
        <button className="rounded border p-2" type="button" disabled={busy}
         onClick={()=>void refresh(false)}>Refresh metadata</button>
        <button className="rounded border p-2" type="button" disabled={busy}
         onClick={()=>void refresh(true)}>Run read-only local integrity review</button>
        <Link href="/backup" className="rounded border p-2">Encrypted backup and recovery</Link>
        <Link href="/device-uat" className="rounded border p-2">Real-device evidence</Link>
      </div>
      {diagnostics?<dl className="grid gap-3 text-sm sm:grid-cols-2">
       <div><dt>Saved application schema metadata</dt><dd className="font-semibold">{diagnostics.schemaVersion??"Unavailable — investigate before upgrade"} (supported source schema {diagnostics.supportedSchemaVersion})</dd></div>
       <div><dt>Unresolved recovery marker</dt><dd className="font-semibold">{diagnostics.recoveryJournalPresent?"Present — stop writes, preserve storage":"Not found in current metadata; not crash proof"}</dd></div>
       <div><dt>Verified local backup-file receipt</dt><dd>{diagnostics.backupReceipt?new Date(diagnostics.backupReceipt.createdAt).toLocaleString():"None for this company"}</dd></div>
       <div><dt>Backup custody</dt><dd>Off-device retention and restoration still require independent owner verification</dd></div>
       <div><dt>Browser storage estimate</dt><dd>{diagnostics.deviceStorageBytes?
        `${diagnostics.deviceStorageBytes.usage??"unknown"} / ${diagnostics.deviceStorageBytes.quota??"unknown"} bytes`:"Unavailable"}</dd></div>
       <div><dt>Browser online flag</dt><dd>{diagnostics.onlineFlag===null?"Unknown":diagnostics.onlineFlag?"Browser flag online, no server verification":"Browser flag offline"}</dd></div>
       <div><dt>Optional legacy-core integrity audit (separately scoped)</dt><dd>{diagnostics.integrity?
         `${diagnostics.integrity.status}; ${diagnostics.integrity.issueCount} findings in ${diagnostics.integrity.recordsChecked} records`:
         "Not performed in this view"}</dd></div>
       <div><dt>Run 13–17 source relationship audit</dt>
        <dd>{diagnostics.crossRun?
          `${diagnostics.crossRun.status}; ${diagnostics.crossRun.checkedRecordCount} saved rows examined`:
          "Not performed in this view"}</dd></div>
       <div><dt>Acceptance</dt><dd>Local source checks are not complete financial, security, physical-inventory or independent-device acceptance.</dd></div>
      </dl>:null}
      {diagnostics?.crossRun?.checks.map(check=>
        <p key={check.code} role={check.status==="attention"?"alert":"status"} className="text-sm">
          {check.code}: {check.status} — {check.detail}
        </p>)}
      {diagnostics?.integrity?.issueCodes.length?<p className="text-sm" role="alert">
       Review source issue categories before another live operation: {diagnostics.integrity.issueCodes.join(", ")}
      </p>:null}
    </section>
    <section className="space-y-3 rounded border p-4" aria-label="Source-bound release evidence">
     <h2 className="text-xl font-semibold">2. Exact-source acceptance register</h2>
     <p className="text-sm">The 20 release gates are independent of 20 development increments. PASS here is a self-reported claim only: an independent reviewer must inspect original evidence and authorize action separately. The program will always remain NO-GO.</p>
     <label className="block text-sm">Exact installed release candidate Git commit (40 hexadecimal characters)
      <input value={sourceSha} maxLength={40} spellCheck={false}
       onChange={e=>{setSourceSha(e.target.value.trim().toLowerCase());
         setGateRows(defaultRun20Evidence());setDrafts({});setPlatformEvidence([]);setCoverage(null);}}
       className="mt-1 block w-full rounded border p-2 font-mono" placeholder="Paste exact candidate SHA, not branch name"/>
     </label>
     <p className="text-sm"><strong>{assessed?assessed.pending.length:RUN20_GATES.length}</strong> mandatory gates without a recorded PASS claim; actual acceptance and sign-off remain open regardless.</p>
     <label className="block text-sm">Filter
       <select className="mt-1 block rounded border p-2" value={area}
         onChange={e=>setArea(e.target.value)}>
         {["All",...new Set(RUN20_GATES.map(g=>g.domain))].map(x=><option value={x} key={x}>{x}</option>)}
       </select>
     </label>
     {visible.map(g=>{
       const prior=gateRows.find(x=>x.gateId===g.id)!;
       const draft=drafts[g.id]??emptyDraft();
       return <article key={g.id} className="space-y-3 rounded border p-3">
        <h3 className="font-semibold">{g.id} · {g.domain}</h3>
        <p className="text-sm">{g.description}</p>
        <p className="text-sm">Recorded claim: <strong>{prior.status.toUpperCase()}</strong>
         {prior.observedAt?" · "+new Date(prior.observedAt).toLocaleString():""}</p>
        <div className="grid gap-2 sm:grid-cols-2">
         <label className="text-sm">Human status claim
           <select value={draft.status} className="mt-1 block w-full rounded border p-2"
            onChange={e=>setDrafts(d=>({...d,[g.id]:{...draft,status:e.target.value as Draft["status"]}}))}>
             <option value="blocked">BLOCKED</option>
             <option value="fail">FAIL</option>
             <option value="pass">PASS claimed — independent review required</option>
           </select>
         </label>
         <label className="text-sm">Reviewer role (not authenticated by this worksheet)
           <select className="mt-1 block w-full rounded border p-2"
            value={draft.reviewerRole} onChange={e=>setDrafts(d=>({...d,[g.id]:{...draft,reviewerRole:e.target.value}}))}>
             {roles.map(role=><option key={role} value={role}>{role}</option>)}
           </select>
         </label>
         <label className="text-sm">Artifact filename (not URL or private path)
           <input className="mt-1 block w-full rounded border p-2" maxLength={160}
            value={draft.evidenceFile} placeholder="OPS-01-reviewed-build-log.txt"
            onChange={e=>setDrafts(d=>({...d,[g.id]:{...draft,evidenceFile:e.target.value}}))}/>
         </label>
        </div>
        <label className="block text-sm">Observed finding or blocker (20–800 characters)
          <textarea rows={2} maxLength={800} className="mt-1 block w-full rounded border p-2"
           value={draft.note} onChange={e=>setDrafts(d=>({...d,[g.id]:{...draft,note:e.target.value}}))}/>
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rounded border p-2" disabled={busy}
           onClick={()=>void record(g.id)}>Record review claim</button>
          <button type="button" className="rounded border p-2" disabled={busy}
           onClick={()=>{setGateRows(rows=>rows.map(x=>x.gateId===g.id?
             {gateId:g.id,status:"not-run",sourceSha:"",observedAt:null,evidenceFile:"",reviewerRole:"",note:""}:x));
             setDrafts(d=>({...d,[g.id]:emptyDraft()}));}}>Reset to NOT RUN</button>
        </div>
       </article>;
     })}
    </section>
    <section className="rounded border p-4 space-y-3" aria-label="Real-device coverage reference">
      <h2 className="text-xl font-semibold">3. Inspect Run 19 device archive coverage</h2>
      <p className="text-sm">Cross-platform hashes do not verify attached screenshots or real hardware. Select evidence for the SAME exact source SHA. A claim of PASS cannot override another device's FAIL.</p>
      <input ref={qaInput} type="file" multiple accept="application/json,.json" disabled={busy}
        onChange={e=>{const files=Array.from(e.currentTarget.files??[]);e.currentTarget.value="";void importDeviceFiles(files);}}/>
      <p>{platformEvidence.length} device archives checked locally.</p>
      {coverage?<p className="text-sm">
         {coverage.coverageGaps.length} missing platform/case combinations;
         {" "}{coverage.reportedFailures.length} reported failures. Independent real-device review: NOT PERFORMED.
       </p>:null}
      {coverage?.coverageGaps.slice(0,20).map(x=><p className="text-sm" key={x.caseId}>
       {x.caseId}: missing {x.platforms.join(" and ")} proof</p>)}
    </section>
    <section className="rounded border p-4 space-y-3" aria-label="No-go release worksheet exchange">
      <h2 className="text-xl font-semibold">4. Export, archive and independently review the NO-GO worksheet</h2>
      <p className="text-sm">A hash-matched worksheet is an input to human review, not a deployment token. Do not send production data, secrets, personal identifiers or actual payment evidence through this page.</p>
      <button type="button" className="rounded border bg-slate-900 p-3 text-white"
        disabled={busy||!assessed} onClick={()=>void exportWorksheet()}>
        Download local release review worksheet
      </button>
      <label className="block text-sm">Reopen a previous Run 20 worksheet
        <input ref={reportInput} type="file" className="mt-2 block w-full"
          disabled={busy} accept="application/json,.json"
          onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value="";void importWorksheet(file);}}/>
      </label>
      <p className="text-sm font-semibold">Production, staging, provider payments, public commerce, cloud financial sync and automatic promotion remain disabled. NO-GO.</p>
    </section>
   </>}
 </section>;
}
