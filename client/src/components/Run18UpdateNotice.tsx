/** Run 18 — accessible, manual PWA update approval.
 * No timer, network request, data mutation or forced reload.
 */
import {useEffect,useState} from "react";
import {RUN18_UPDATE_READY_EVENT,isRun18UpdateReady,applyRun18ApprovedUpdate} from "@/features/reliability/run18UpdatePolicy";
export function Run18UpdateNotice(){
 const [ready,setReady]=useState(isRun18UpdateReady);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 useEffect(()=>{
   const notify=()=>setReady(isRun18UpdateReady());
   window.addEventListener(RUN18_UPDATE_READY_EVENT,notify);
   return()=>window.removeEventListener(RUN18_UPDATE_READY_EVENT,notify);
 },[]);
 if(!ready)return null;
 return <section role="status" aria-live="polite" className="mx-auto max-w-4xl space-y-2 rounded border border-amber-700 bg-amber-50 p-3 text-sm text-slate-900">
   <p><strong>An offline app update is ready.</strong> Finish and save any sale, refund or backup work before applying it. Your local records are not uploaded.</p>
   {error?<p role="alert">{error}</p>:null}
   <button type="button" disabled={busy} className="rounded border border-slate-700 bg-white p-2"
     onClick={()=>{setBusy(true);setError("");
       void applyRun18ApprovedUpdate().catch(e=>{
         setError(e instanceof Error?e.message:"Could not activate the offline update.");
         setBusy(false);
       });
     }}>{busy?"Applying local app update…":"Apply update and reload when ready"}</button>
 </section>;
}
