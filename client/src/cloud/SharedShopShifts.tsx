/** Authenticated Shared Shop shift log, backed by server time and append-only events.
 * A declared cash amount is not a verified cash variance or evidence of wrongdoing.
 */
import {useCallback,useEffect,useRef,useState} from "react";
import {Clock3,ShieldCheck,RefreshCw} from "lucide-react";
import {parseAmountToMinor,formatMinorAmount} from "@/features/inventory/inventory";
import type {ShopOverview} from "./shopClient";
import {closeShopShift,listShopShifts,openShopShift,reviewShopShift,type ShopShift} from "./shopShiftClient";

interface Props {companyId:string;userId:string;overview:ShopOverview;online:boolean}
const explain=(cause:unknown)=>cause instanceof Error?cause.message:"Shift action failed.";
export function SharedShopShifts({companyId,userId,overview,online}:Props){
 const [shifts,setShifts]=useState<ShopShift[]>([]);
 const [loading,setLoading]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [storeId,setStoreId]=useState("");
 const [openingCash,setOpeningCash]=useState("");
 const [closingCash,setClosingCash]=useState("");
 const [note,setNote]=useState("");
 const [selected,setSelected]=useState("");
 const [reviewDecision,setReviewDecision]=useState<"accepted"|"needs-investigation">("accepted");
 const [reviewNote,setReviewNote]=useState("");
 const [reviewMode,setReviewMode]=useState<"review"|"force">("review");
 const openingId=useRef<string|null>(null);
 const request=useRef(0);
 const isOwner=overview.role==="owner";
 const activeStores=overview.stores.filter(s=>s.status==="active");
 const currency=overview.currency??"GHS";
 const current=shifts.find(s=>s.staffId===userId&&!s.closedAt);
 const nameOf=(id:string)=>overview.members.find(m=>m.userId===id)?.email??(id===userId?"You":"Staff ID "+id);
 const storeName=(id:string)=>overview.stores.find(s=>s.id===id)?.name??id;
 const formatCash=(minor:string|null)=>minor===null?"—":/^[0-9]{1,15}$/.test(minor)&&Number.isSafeInteger(Number(minor))
  ?formatMinorAmount(Number(minor),currency):minor+" minor units";
 const minor=(value:string)=>{
  const amount=parseAmountToMinor(value.trim(),currency);
  if(!Number.isSafeInteger(amount)||amount<0)throw Error("Enter a non-negative cash amount.");
  return amount;
 };
 const load=useCallback(async()=>{
  if(!online)return;
  const seq=++request.current;setLoading(true);setError("");
  try{
   const data=await listShopShifts(companyId);
   if(request.current===seq)setShifts(data.shifts);
  }catch(cause){if(request.current===seq)setError(explain(cause));}
  finally{if(request.current===seq)setLoading(false);}
 },[companyId,online]);
 useEffect(()=>{setShifts([]);setStoreId("");openingId.current=null;void load();return()=>{request.current++;};},[load]);
 const perform=async(action:()=>Promise<unknown>,message:string)=>{
  if(!online||busy)return;setBusy(true);setError("");setNotice("");
  try{await action();setNotice(message);await load();}
  catch(cause){setError(explain(cause)+" If the request timed out, check the saved shift before retrying with the same details.");}
  finally{setBusy(false);}
 };
 const open=()=>{
  if(!storeId||!openingCash.trim()){setError("Choose an assigned store and enter the opening cash count (0 is allowed).");return;}
  try{
   const amount=minor(openingCash);
   openingId.current??=crypto.randomUUID();
   const id=openingId.current;
   void perform(async()=>{
    await openShopShift(companyId,{shiftId:id,storeId,openingCashMinor:amount,...(note.trim()?{note:note.trim()}:{})});
    openingId.current=null;setOpeningCash("");setNote("");
   },"Your shift opening is recorded with the server time.");
  }catch(cause){setError(explain(cause));}
 };
 const close=()=>{
  if(!current||!closingCash.trim()){setError("Enter the cash actually counted at closing.");return;}
  try{const counted=minor(closingCash);
   void perform(async()=>{
    await closeShopShift(companyId,{shiftId:current.shiftId,closingCashMinor:counted,...(note.trim()?{note:note.trim()}:{})});
    setClosingCash("");setNote("");
   },"Your closing cash count and server time were recorded.");
  }catch(cause){setError(explain(cause));}
 };
 const finishOwner=(shift:ShopShift)=>{
  if(!reviewNote.trim()){setError("Enter your review or override reason.");return;}
  try{
   if(reviewMode==="force"){
    const amount=minor(closingCash);
    void perform(async()=>{
     await closeShopShift(companyId,{shiftId:shift.shiftId,closingCashMinor:amount,note:reviewNote.trim()},true);
     setSelected("");setReviewNote("");setClosingCash("");
    },"An owner-forced closure was recorded with your identity and reason.");
   }else{
    void perform(async()=>{
     await reviewShopShift(companyId,{shiftId:shift.shiftId,decision:reviewDecision,note:reviewNote.trim()});
     setSelected("");setReviewNote("");
    },"Your review was attached to this closed shift.");
   }
  }catch(cause){setError(explain(cause));}
 };
 return <section className="shop-card tb-shifts" aria-label="Staff shifts">
  <div className="shop-card-head"><h2><Clock3 aria-hidden="true"/> {isOwner?"Staff shifts & handovers":"My shift"}</h2>
   <button type="button" className="secondary-action" disabled={!online||loading||busy} onClick={()=>void load()}><RefreshCw aria-hidden="true"/> Refresh</button></div>
  <p className="shop-muted">Every shift belongs to the authenticated employee, assigned store, and server opening/closing time. Cash amounts are staff declarations, not automatically reconciled balances.</p>
  {!online&&<p role="status" className="shop-alert">Connect to the internet to open, close, or review a cloud shift. Your saved offline sales remain under the original cashier account.</p>}
  {error&&<p role="alert" className="shop-alert">{error}</p>}
  {notice&&<p role="status" className="shop-muted">{notice}</p>}
  {loading&&<p role="status">Loading verified shifts…</p>}
  <div className="tb-shift-entry">
   {current?<div className="tb-shift-active">
     <p className="tb-shift-eyebrow">YOUR ACTIVE SHIFT</p>
     <strong>{storeName(current.storeId)}</strong>
     <p>Opened {new Date(current.openedAt).toLocaleString()} · Opening cash {formatCash(current.openingCashMinor)}</p>
     <label className="shop-field">Cash counted at closing ({currency})
       <input inputMode="decimal" placeholder="0.00" value={closingCash} onChange={e=>setClosingCash(e.target.value)}/></label>
     <label className="shop-field">Handover note (optional; at least 4 characters)
       <textarea value={note} maxLength={240} onChange={e=>setNote(e.target.value)} rows={2}/></label>
     <button className="primary-action" type="button" disabled={!online||busy||!closingCash.trim()} onClick={close}>Close my shift</button>
   </div>:<div>
     <h3>Start a new shift</h3>
     <label className="shop-field">Assigned store
       <select value={storeId} onChange={e=>{setStoreId(e.target.value);openingId.current=null;}}>
        <option value="">Choose store</option>{activeStores.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}
       </select></label>
     <label className="shop-field">Opening cash counted ({currency})
       <input inputMode="decimal" placeholder="0.00" value={openingCash} onChange={e=>{setOpeningCash(e.target.value);openingId.current=null;}}/></label>
     <label className="shop-field">Opening note (optional; at least 4 characters)
       <textarea rows={2} maxLength={240} value={note} onChange={e=>{setNote(e.target.value);openingId.current=null;}}/></label>
     <button type="button" className="primary-action" disabled={!online||busy||!storeId||!openingCash.trim()} onClick={open}>Start shift</button>
    </div>}
  </div>
  <div className="tb-shift-history"><h3>{isOwner?"Recent employee shifts":"My previous shifts"}</h3>
   {!shifts.length&&!loading&&<p className="shop-muted">No shift history recorded yet. Old sales still retain their existing cashier IDs.</p>}
   <ul>{shifts.map(s=><li key={s.shiftId}>
    <div><strong>{nameOf(s.staffId)}</strong><small>{storeName(s.storeId)} · Started {new Date(s.openedAt).toLocaleString()}</small>
     <small>Opening cash: {formatCash(s.openingCashMinor)} · {s.closedAt?"Closed "+new Date(s.closedAt).toLocaleString():"Still open"}</small>
     {s.closedAt&&<small>Closing cash: {formatCash(s.closingCashMinor)} · Closed by {s.closedBy?nameOf(s.closedBy):"Unknown"}{s.forcedClose?" (owner override)":""}</small>}
     {s.reviewDecision&&<small>Manager review: {s.reviewDecision} · {s.reviewNote}</small>}
    </div>
    {isOwner&&!s.reviewedAt&&<div className="tb-shift-review">
      {selected===s.shiftId?<div>
        <strong>{s.closedAt?"Review shift":"Owner emergency closure"}</strong>
        {s.closedAt?<label className="shop-field">Review decision
          <select value={reviewDecision} onChange={e=>setReviewDecision(e.target.value as "accepted"|"needs-investigation")}>
           <option value="accepted">Accepted (not proof of exact stock)</option>
           <option value="needs-investigation">Needs investigation</option>
          </select></label>:<label className="shop-field">Cash counted with witness ({currency})
           <input inputMode="decimal" value={closingCash} onChange={e=>setClosingCash(e.target.value)}/></label>}
        <label className="shop-field">{s.closedAt?"Review note":"Reason for owner override"}<textarea rows={2} maxLength={240} value={reviewNote} onChange={e=>setReviewNote(e.target.value)}/></label>
        <button type="button" className="primary-action" disabled={busy||!online||!reviewNote.trim()||(!s.closedAt&&!closingCash.trim())} onClick={()=>finishOwner(s)}>Record {s.closedAt?"review":"forced closure"}</button>
        <button type="button" className="secondary-action" onClick={()=>{setSelected("");setReviewNote("");}}>Cancel</button>
       </div>:<button type="button" className="secondary-action" disabled={!online||busy} onClick={()=>{setSelected(s.shiftId);setReviewMode(s.closedAt?"review":"force");setReviewNote("");setClosingCash("");}}>
        {s.closedAt?"Review":"Force close"}</button>}
     </div>}
   </li>)}</ul>
  </div>
  <p className="tb-shift-warning"><ShieldCheck aria-hidden="true"/> A shift does not automatically prove who caused a missing item. Check stock counts, transaction timestamps, and the owner audit trail before drawing conclusions. Cloud sales are not currently blocked if a shift was not opened.</p>
 </section>;
}
