/** Owner-only read-only business event chronology. Server permissions are mandatory. */
import {useCallback,useEffect,useRef,useState} from "react";
import {RefreshCw,History} from "lucide-react";
import {formatMinorAmount} from "@/features/inventory/inventory";
import type {ShopOverview} from "./shopClient";
import {getShopAudit,type ShopAuditCursor,type ShopAuditEvent} from "./shopShiftClient";

const utc=(value:string)=>Number.isFinite(Date.parse(value))
 ?new Date(value).toISOString().replace("T"," ").slice(0,19)+" UTC":"Time unavailable";

export function SharedShopActivityAudit({companyId,overview,online}:{
 companyId:string;overview:ShopOverview;online:boolean;
}){
 const [rows,setRows]=useState<ShopAuditEvent[]>([]);
 const [next,setNext]=useState<ShopAuditCursor|null>(null);
 const [hasMore,setHasMore]=useState(false);
 const [storeId,setStoreId]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const run=useRef(0);
 const currency=overview.currency??"GHS";
 const nameOf=(id:string,email?:string|null)=>email??overview.members.find(m=>m.userId===id)?.email??"Staff ID "+id;
 const storeName=(id:string|null)=>id?overview.stores.find(s=>s.id===id)?.name??id:"All locations";
 const productName=(id:string|null)=>id?overview.products.find(p=>p.id===id)?.name??id:null;
 const amount=(minor:string|null)=>!minor?"":/^-?[0-9]{1,15}$/.test(minor)&&Number.isSafeInteger(Number(minor))
   ?formatMinorAmount(Number(minor),currency):minor+" minor units";
 const load=useCallback(async(cursor?:ShopAuditCursor)=>{
  if(!online||overview.role!=="owner")return;
  const seq=++run.current;setBusy(true);setError("");
  try{
   const page=await getShopAudit(companyId,{limit:30,...(storeId?{storeId}:{}),...(cursor??{})});
   if(seq!==run.current)return;
   setRows(current=>cursor?[...current,...page.events]:page.events);
   setNext(page.next);setHasMore(page.hasMore);
  }catch(cause){if(seq===run.current)setError(cause instanceof Error?cause.message:"Could not open activity history.");}
  finally{if(seq===run.current)setBusy(false);}
 },[companyId,online,overview.role,storeId]);
 useEffect(()=>{setRows([]);setHasMore(false);setNext(null);void load();return()=>{run.current++;};},[load]);
 return <section className="shop-card tb-shop-audit" aria-label="Owner activity audit">
  <div className="shop-card-head"><h2><History aria-hidden="true"/> Employee activity audit</h2>
   <button className="secondary-action" type="button" disabled={!online||busy} onClick={()=>void load()}><RefreshCw aria-hidden="true"/> Refresh</button></div>
  <p className="shop-muted">Authoritative server activity: who posted a sale, refund, stock movement, physical count, goods receipt, expense, or shift action. Only owners can inspect the business-wide history.</p>
  <label className="shop-field">Location
    <select value={storeId} onChange={e=>setStoreId(e.target.value)}>
     <option value="">All locations</option>
     {overview.stores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
    </select></label>
  {!online&&<p className="shop-alert" role="status">Reconnect to inspect server activity. Cached or unsent sales are not represented as accepted server events.</p>}
  {error&&<p className="shop-alert" role="alert">{error}</p>}
  {busy&&<p role="status" className="shop-muted">Loading verified activity…</p>}
  {!busy&&!rows.length&&!error&&<p className="shop-muted">No activity found for this selection.</p>}
  <ol className="tb-shop-audit-events">{rows.map(e=><li key={e.eventKey}>
   <div className="tb-shop-audit-title"><strong>{e.kind.replaceAll("_"," ").toUpperCase()}</strong>
    <span>{utc(e.serverRecordedAt)}</span></div>
   <p>{e.detail}</p>
   <small><strong>Actor:</strong> {nameOf(e.actorId,e.actorEmail)} · <strong>Store:</strong> {storeName(e.storeId)}</small>
   {e.productId&&<small><strong>Product:</strong> {productName(e.productId)}</small>}
   {e.delta!==null&&<small><strong>Quantity change:</strong> {e.delta>0?"+":""}{e.delta} units · After: {e.quantityAfter??"unknown"}</small>}
   {e.amountMinor&&<small><strong>Recorded amount:</strong> {amount(e.amountMinor)}</small>}
   {e.deviceReportedAt&&<small><strong>Device-claimed sale time:</strong> {utc(e.deviceReportedAt)} (not independently verified)</small>}
   <small className="tb-shop-audit-source">Evidence ID: {e.sourceId} · Actor ID: {e.actorId}</small>
  </li>)}</ol>
  {hasMore&&next&&<button type="button" className="secondary-action" disabled={!online||busy} onClick={()=>void load(next)}>Load older activity</button>}
  <p className="tb-shop-audit-disclaimer">A server timestamp establishes when an event was accepted, not necessarily when an offline sale happened. Inventory discrepancies need independent shelf-count and handover evidence; no automatic blame is assigned.</p>
 </section>;
}
