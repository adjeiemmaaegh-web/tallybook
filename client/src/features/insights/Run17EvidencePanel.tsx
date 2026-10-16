/** Run 17 — offline, evidence-backed assistant analytics UI.
 * Showing a finding or marking it reviewed never changes a POS transaction.
 */
import {useCallback,useEffect,useState} from "react";
import {formatMinorAmount} from "@/features/inventory/inventory";
import {getActiveBusinessProfileId} from "@/features/business/activeCompany";
import {getRun17Evidence,type Run17Period} from "./run17Service";
import {getRun17ReviewStates,recordRun17Review,RUN17_REVIEW_WRITES_ENABLED} from "./run17ReviewStore";
import type {Run17Finding,Run17Report} from "./run17Evidence.mjs";
import type {Run17ReviewState} from "./run17ReviewAudit.mjs";
import {db} from "@/db/TallybookDB";
import {exportRun17Csv} from "./run17Csv.mjs";

export function Run17EvidencePanel({companyId,currency,period}:{companyId:string;currency:string;period:Run17Period}){
 const [report,setReport]=useState<Run17Report|null>(null);
 const [reviews,setReviews]=useState<ReadonlyArray<Readonly<Run17ReviewState>>>([]);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState("");
 const [notes,setNotes]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState(false);
 const refresh=useCallback(async()=>{
   setError("");setLoading(true);
   try{
     if(companyId!==getActiveBusinessProfileId())throw Error("Company selection changed.");
     const [next,prior]=await Promise.all([
       getRun17Evidence(period,new Date(),db),getRun17ReviewStates(db)
     ]);
     if(companyId!==getActiveBusinessProfileId()||next.companyId!==companyId)
       throw Error("Another company became active; analytics cannot be shown.");
     setReport(next);setReviews(prior);
   }catch(e){setReport(null);setReviews([]);setError(e instanceof Error?e.message:"Analytics are unavailable.");}
   finally{setLoading(false);}
 },[companyId,period]);
 useEffect(()=>{setReport(null);setReviews([]);setNotes({});void refresh();},[refresh]);
 const review=async(item:Run17Finding,action:"acknowledge"|"reopen")=>{
   if(busy||!RUN17_REVIEW_WRITES_ENABLED)return;
   setBusy(true);setError("");
   try{
     await recordRun17Review({findingId:item.id,period,action,
       note:notes[item.id]??"",submissionKey:crypto.randomUUID()},db);
     setNotes(p=>({...p,[item.id]:""}));await refresh();
   }catch(e){setError(e instanceof Error?e.message:"Review could not be recorded.");}
   finally{setBusy(false);}
 };
 const fm=(value:number)=>formatMinorAmount(value,currency);
 return <section className="space-y-4 rounded border p-4" aria-label="Run 17 evidence review">
   <header>
     <h2 className="text-xl font-semibold">Assistant-supported operating review</h2>
     <p className="text-sm">Read-only rules over records on this device, not generative claims. No prediction, fraud verdict, bank reconciliation, automatic reorder, customer messaging, AI inference or financial posting.</p>
   </header>
   <div className="flex flex-wrap gap-2">
     <button type="button" className="rounded border p-2" disabled={loading||busy}
       onClick={()=>void refresh()}>Refresh verified local evidence</button>
     <button type="button" className="rounded border p-2" disabled={loading||busy||!report}
       onClick={()=>{
         if(!report||report.companyId!==getActiveBusinessProfileId())return;
         try{
           const csv=exportRun17Csv(report);
           const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"});
           const url=URL.createObjectURL(blob);
           const anchor=document.createElement("a");anchor.href=url;
           anchor.download="tallybook-run17-local-evidence-"+report.asOf.slice(0,10)+".csv";
           anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
         }catch(e){setError(e instanceof Error?e.message:"Could not prepare local evidence export.");}
       }}>Export source-linked CSV (local only)</button>
   </div>
   {loading?<p role="status">Reading company evidence…</p>:null}
   {error?<p role="alert" className="rounded border p-2">{error}</p>:null}
   {report&&!loading?<><div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded border p-3"><strong>Saved invoice totals</strong>
       <p>{fm(report.summary.grossRecordedInvoiceMinor)}</p>
       <small>Gross saved sale totals for this period, before full/partial returns; not cash received or profit.</small></div>
      <div className="rounded border p-3"><strong>Sale source coverage</strong>
       <p>{report.summary.recordedSaleCount} saved sales · {report.summary.fullyReversedSaleCount} fully reversed · {report.summary.partialReturnAffectedSaleCount} with partial-return evidence</p>
       <small>Store origin unknown on {report.summary.storeOriginUnknownSaleCount} selected sales.</small></div>
      <div className="rounded border p-3"><strong>Local commerce status</strong>
       <p>{report.summary.localOrderCount} saved orders · {report.summary.deliveredOrderCount} currently marked delivered</p>
       <small>Delivery status does not confirm funds settled.</small></div>
      <div className="rounded border p-3"><strong>Stock in transit</strong>
       <p>{report.summary.pendingDispatchedTransferCount} dispatched transfer requests awaiting recorded receipt</p>
       <small>Dispatch age alone cannot prove loss or staff wrongdoing.</small></div>
    </div>
    {report.stores.length>0?<section className="space-y-2">
      <h3 className="font-semibold">Saved invoices by store</h3>
      <p className="text-sm">Gross saved invoice amounts only; not payment, profit or verified physical stock. Historical unattributed sales remain separate.</p>
      <ul className="text-sm list-disc pl-5">{report.stores.map(s=>
       <li key={s.storeId}>{s.storeName}: {s.recordedSaleCount} invoices ({fm(s.grossRecordedInvoiceMinor)} gross recorded), {s.fullyReversedSaleCount} fully reversed.</li>)}</ul>
    </section>:null}
    <section className="space-y-2"><h3 className="font-semibold">Observed unit volume</h3>
      <p className="text-sm">Excludes receipts with full reversals or partial-return events; incomplete history and stock-outs can bias unit volumes. Not a demand forecast.</p>
      {report.topObservedUnits.length?<ol className="list-decimal pl-5 text-sm">
        {report.topObservedUnits.map(item=><li key={item.productId}>{item.name}: {item.units} recorded units ({item.sourceSaleLineIds.length} saved sale lines)</li>)}
      </ol>:<p className="text-sm">No eligible line-level sales in this window.</p>}
    </section>
    <section className="space-y-3">
      <h3 className="font-semibold">Evidence-based review queue</h3>
      {report.findings.length===0?<p className="text-sm">No matching findings. This does not prove that all business records are complete or risk-free.</p>:null}
      {report.findings.map(item=>{
        const previous=reviews.find(r=>r.findingId===item.id);
        const acknowledged=previous?.status==="acknowledged"&&previous.evidenceKey===item.evidenceKey;
        return <article key={item.id} className="space-y-2 rounded border p-3">
          <h4 className="font-medium">{item.title}</h4>
          <p className="text-sm">{item.evidence}</p>
          <p className="text-sm"><strong>Suggested human review:</strong> {item.action}</p>
          <p className="text-xs">Severity: {item.severity}; confidence: {item.confidence}.
            Evidence sources: {item.sourceRefs.length?item.sourceRefs.map(r=>r.kind+" / "+r.id).join(", "):"period-scoped aggregate"}. {acknowledged?"This exact input snapshot was acknowledged.":"No current matching acknowledgement."}</p>
          <a href={item.href} className="underline text-sm">Open supporting business area</a>
          <label className="block text-sm">Human review notes
            <textarea rows={2} maxLength={500} value={notes[item.id]??""}
              onChange={e=>setNotes(n=>({...n,[item.id]:e.target.value}))}
              placeholder="Required factual review note (8–500 characters)"
              className="block w-full rounded border p-2"/>
          </label>
          <div className="flex gap-2">
            <button type="button" className="rounded border p-2"
              disabled={!RUN17_REVIEW_WRITES_ENABLED||busy||acknowledged||(notes[item.id]?.trim().length??0)<8}
              onClick={()=>void review(item,"acknowledge")}>Acknowledge evidence (disabled pending QA)</button>
            <button type="button" className="rounded border p-2"
              disabled={!RUN17_REVIEW_WRITES_ENABLED||busy||!acknowledged||(notes[item.id]?.trim().length??0)<8}
              onClick={()=>void review(item,"reopen")}>Reopen review</button>
          </div>
        </article>;
      })}
      {report.incompleteFindingCount>0?<p className="text-sm">Additional {report.incompleteFindingCount} findings omitted from this display; use a scoped source report before acting.</p>:null}
    </section>
    <p className="text-xs">As of {new Date(report.asOf).toLocaleString()}. Read-only evidence fingerprint identifies an observed snapshot and is not a cryptographic signature. No external AI service or data export was used.</p>
   </>:null}
 </section>;
}
