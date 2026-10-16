/** Run 15 — local mock payment QA. NEVER place this sandbox on a real
 * checkout receipt or assume it settled cash. Provider configuration absent.
 */
import {useCallback,useEffect,useState} from "react";
import {nanoid} from "nanoid";
import {db} from "@/db/TallybookDB";
import {getActiveBusinessProfileId} from "@/features/business/activeCompany";
import {createRun15MockIntent,applyRun15MockAction,inspectRun15MockSandbox} from "./run15MockStore";
import type {Run15MockIntent,Run15MockEvent} from "./run15MockContract.mjs";

export function Run15PaymentSandboxPanel({companyId,currency}:{
 companyId:string;currency:string
}){
 const [data,setData]=useState<Awaited<ReturnType<typeof inspectRun15MockSandbox>>|null>(null);
 const [method,setMethod]=useState<"card"|"mobile">("mobile");
 const [amount,setAmount]=useState("100");
 const [intentId,setIntentId]=useState("");
 const [refundAmount,setRefundAmount]=useState("");
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const refresh=useCallback(async()=>{
  const snapshot=await inspectRun15MockSandbox(db);
  if(companyId!==getActiveBusinessProfileId())throw Error("Company switched during sandbox review.");
  setData(snapshot);
 },[companyId]);
 useEffect(()=>{setData(null);setIntentId("");setMessage("");void refresh().catch(e=>setMessage(e instanceof Error?e.message:"Sandbox evidence unavailable."));},[refresh]);
 const perform=async(work:()=>Promise<void>)=>{
  if(busy)return;
  setBusy(true);setMessage("");
  try{await work();await refresh();}
  catch(e){setMessage(e instanceof Error?e.message:"Sandbox operation rejected.");}
  finally{setBusy(false);}
 };
 const parsed=(text:string):number=>{
  if(!/^(0|[1-9]\d{0,11})$/.test(text))throw Error("Enter a positive whole number of minor currency units.");
  const value=Number(text);
  if(!Number.isSafeInteger(value)||value<1||value>9_000_000_000_000)
    throw Error("Invalid simulated amount.");
  return value;
 };
 const selected=data?.intents.find(x=>x.id===intentId);
 return <section className="rounded border p-4 space-y-3" aria-label="Run 15 simulated payment sandbox">
   <h2 className="text-lg font-semibold">Payment gateway sandbox — simulation only</h2>
   <p className="text-sm">No provider has been connected. Every amount, callback, refund and dispute here is fictional. This feature does not receive money, pay suppliers, settle a customer sale, or update the real financial ledger.</p>
   {message?<p role="alert" className="text-sm rounded border p-2">{message}</p>:null}
   <p className="text-sm">Local mock intents: {data?.intents.length??0}; simulated events: {data?.events.length??0}. Provider: <strong>mock-only</strong>. Financial settlements posted: <strong>0</strong>.</p>
   <div className="flex flex-wrap gap-2">
    <label className="text-sm">Method
      <select className="block rounded border p-2" value={method} onChange={e=>setMethod(e.target.value as typeof method)}>
       <option value="mobile">Simulated Mobile Money</option><option value="card">Simulated card</option>
      </select>
    </label>
    <label className="text-sm">Amount in minor units ({currency})
      <input className="block rounded border p-2" inputMode="numeric" value={amount} onChange={e=>setAmount(e.target.value)}/>
    </label>
   </div>
   <button className="rounded border p-2" type="button" disabled={busy} onClick={()=>void perform(async()=>{
     const intent=await createRun15MockIntent({companyId,submissionKey:nanoid(18),
       amountMinor:parsed(amount),currency,method},db);
     setIntentId(intent.id);
   })}>Create mock-only pending intent</button>
   <label className="block text-sm">Simulated intent
    <select className="block w-full rounded border p-2" value={intentId} onChange={e=>setIntentId(e.target.value)}>
      <option value="">Select simulated payment</option>
      {data?.intents.map(intent=><option key={intent.id} value={intent.id}>
       {intent.currency} {intent.amountMinor} minor units · {intent.method} · {intent.status} · {intent.id}
      </option>)}
    </select>
   </label>
   {selected?<p className="text-sm" role="status">Mock status: <strong>{selected.status}</strong>. Simulated refunds: {selected.refundedMinor} minor units. This is not a provider receipt.</p>:null}
   <label className="block text-sm">Simulated refund amount (minor units)
    <input className="block rounded border p-2" inputMode="numeric" value={refundAmount} onChange={e=>setRefundAmount(e.target.value)} placeholder="For refund event only"/>
   </label>
   <div className="flex flex-wrap gap-2">
   {(["timeout","succeed","fail","refund","chargeback"] as const).map(action=>
     <button key={action} className="rounded border p-2" type="button"
       disabled={busy||!selected} onClick={()=>void perform(async()=>{
         if(!selected)throw Error("Choose a simulated intent.");
         const value=action==="refund"?parsed(refundAmount):0;
         await applyRun15MockAction({companyId,intentId:selected.id,eventId:nanoid(18),
           action,amountMinor:value},db);
       })}>Simulate {action}</button>
   )}
   </div>
   <button className="rounded border p-2" disabled={busy} type="button" onClick={()=>void perform(async()=>{})}>Reconcile local mock history</button>
   <p className="text-xs">This simulation does not create a real sales receipt or prove any Mobile Money/card provider response. Test and sandbox provider onboarding remain deferred until explicitly authorized.</p>
 </section>;
}
