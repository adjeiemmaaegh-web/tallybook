/** Owner opt-in public order links and authenticated conversion inbox.
 * An anonymous request never becomes a sale or moves stock here.
 */
import {useCallback,useEffect,useRef,useState} from "react";
import "./SharedShopPublicOrderInbox.css";
import {confirmAction} from "@/lib/confirmAction";
import type {ShopOverview} from "./shopClient";
import {
 createPublicOrderShare,listOwnerGuestOrders,resolveOwnerGuestRequest,
 revokePublicOrderShare,type OwnerGuestOrders
} from "./shopPublicOrders";
interface Props {companyId:string;overview:ShopOverview;onConverted:()=>Promise<unknown>}
const msg=(error:unknown)=>error instanceof Error?error.message:"Cannot verify the public order operation.";
const money=(value:string,currency:string):string=>{
 if(!/^(0|[1-9][0-9]*)$/.test(value))return "Unverified quote";
 const n=BigInt(value);
 if(n>BigInt(Number.MAX_SAFE_INTEGER))return n.toString()+" minor units";
 try{
  const nf=new Intl.NumberFormat(undefined,{style:"currency",currency});
  return nf.format(Number(n)/10**nf.resolvedOptions().maximumFractionDigits);
 }catch{return n.toString()+" minor units";}
};
export function SharedShopPublicOrderInbox({companyId,overview,onConverted}:Props){
 const [open,setOpen]=useState(false);
 const [data,setData]=useState<OwnerGuestOrders|null>(null);
 const [storeId,setStoreId]=useState("");
 const [link,setLink]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const seq=useRef(0);
 const busyRef=useRef(false);
 const stores=overview.stores.filter(s=>s.status==="active");
 const nameOf=(id:string)=>overview.stores.find(s=>s.id===id)?.name??"Previous store";
 const productName=(id:string)=>overview.products.find(p=>p.id===id)?.name??"Previous product";
 const load=useCallback(async()=>{
  const mine=++seq.current;setData(null);setError("");
  try{
   const result=await listOwnerGuestOrders(companyId);
   if(mine===seq.current)setData(result);
  }catch(e){if(mine===seq.current)setError(msg(e));}
 },[companyId]);
 useEffect(()=>{
  if(!open)return;
  setLink("");setNotice("");void load();
  return()=>{seq.current++;};
 },[open,load]);
 const action=async(work:()=>Promise<unknown>,success:string,refreshOrders=false)=>{
  if(busyRef.current||!data)return;
  busyRef.current=true;setBusy(true);setError("");setNotice("");
  try{
   await work();
   setNotice(success);
   await load();
   if(refreshOrders)await onConverted();
  }catch(e){
   setError(msg(e)+" If a response was lost, refresh and reconcile before repeating any changed action.");
  }finally{busyRef.current=false;setBusy(false);}
 };
 const make=async()=>{
  if(!storeId)return;
  // Issuing a link turns on public catalogue access for the selected store.
  if(!(await confirmAction("Create a revocable public order link for "+nameOf(storeId)+"? Anyone with the link may view current public product names/prices and send order requests. No payments or stock reservations will be made.",{confirmLabel:"Create public link"})))return;
  void action(async()=>{
   const created=await createPublicOrderShare(companyId,storeId);
   setLink(window.location.origin+"/order#"+created.shareToken);
  },"Copy this new link now. Only its hash is retained by the server; it cannot be retrieved later.");
 };
 const revoke=async(shareId:string)=>{
  if(!(await confirmAction("Revoke this public link? Its existing customer requests remain available to the owner for reconciliation.",{danger:true,confirmLabel:"Revoke link"})))return;
  void action(async()=>{await revokePublicOrderShare(companyId,shareId);setLink("");},
   "The public link was revoked.");
 };
 const resolve=async(id:string,operation:"convert"|"decline")=>{
  if(!(await confirmAction(operation==="convert"?
    "Convert this guest enquiry into the existing private online-order workflow? The server checks actual product prices. This does not accept payment, reserve stock or make a sale.":
    "Decline this guest order request? The request is retained for your audit.",
    {danger:operation==="decline",confirmLabel:operation==="convert"?"Convert to order":"Decline request"})))return;
  void action(()=>resolveOwnerGuestRequest(companyId,id,operation),
   operation==="convert"?"Converted to an owner-review online order; accept it separately.":"Request declined.",
   operation==="convert");
 };
 const requests=data?.requests??[];
 const currentShares=(data?.shares??[]).filter(s=>!s.revoked);
 return <section className="tb-guest-inbox shop-card" aria-label="Public customer order requests">
  <button type="button" className="secondary-action" aria-expanded={open}
    onClick={()=>setOpen(v=>!v)}>
   {open?"Hide":"Open"} public order links and guest requests
  </button>
  {open&&<div className="tb-guest-inbox-body">
   <p className="shop-muted">Opt-in public enquiries, not checkout payments. Anyone with a link can browse public prices and request products; only the verified owner may see customer contact details or convert requests.</p>
   {error&&<p role="alert" className="shop-alert">{error}</p>}
   {notice&&<p role="status">{notice}</p>}
   {!data&&!error&&<p role="status">Reading owner-only public order inbox…</p>}
   {!data&&error&&<p role="status">Owner inbox unavailable; do not assume there are no requests.</p>}
   {data&&<>
    <div className="tb-ops-metrics" aria-label="Guest requests">
     <div><span>Unreviewed</span><strong>{requests.filter(r=>r.status==="new").length}</strong></div>
     <div><span>Converted</span><strong>{requests.filter(r=>r.status==="converted").length}</strong></div>
     <div><span>Declined</span><strong>{requests.filter(r=>r.status==="declined").length}</strong></div>
    </div>
    <div className="tb-guest-inbox-section">
     <h3>Share an opt-in order link</h3>
     <p className="shop-muted">One active link per store. Links are private bearer tokens; share only with customers you intend to invite. The link can be revoked here.</p>
     <label className="shop-field">Store<select disabled={busy} value={storeId} onChange={e=>setStoreId(e.target.value)}>
      <option value="">Choose store</option>
      {stores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
     </select></label>
     <button type="button" className="secondary-action" disabled={!storeId||busy||
      currentShares.some(s=>s.storeId===storeId)} onClick={()=>void make()}>Create public order link</button>
     {link&&<div>
      <label className="shop-field">New public link — copy once
       <input type="text" readOnly value={link} onFocus={e=>e.currentTarget.select()} aria-label="New public order link"/>
      </label>
      <button type="button" className="secondary-action" onClick={()=>void navigator.clipboard.writeText(link)
       .then(()=>setNotice("Link copied to your clipboard.")).catch(()=>setError("Copy unavailable. Select the link text and copy manually."))}>Copy link</button>
     </div>}
     {currentShares.length===0&&<p role="status">No active public order links.</p>}
     {currentShares.map(s=><div className="tb-guest-share" key={s.shareId}>
       <span>{nameOf(s.storeId)} · Issued {new Date(s.createdAt).toLocaleString()} · Link token is not retrievable</span>
       <button type="button" disabled={busy} className="secondary-action" onClick={()=>void revoke(s.shareId)}>Revoke</button>
     </div>)}
    </div>
    <div className="tb-guest-inbox-section">
     <h3>Guest requests</h3>
     <p className="shop-muted">Showing the latest {requests.length} server records (maximum 100). Customer details are visible only to the verified business owner.</p>
     {requests.length===0&&<p role="status">No guest requests in the latest server results.</p>}
     {requests.map(r=><article className="tb-guest-request" key={r.requestId}>
      <h4>{r.customerName} · {r.status}</h4>
      <small>{nameOf(r.storeId)} · {new Date(r.createdAt).toLocaleString()} · {r.requestId}</small>
      <p><strong>Contact:</strong> {r.contactPhone}</p>
      {r.customerNote&&<p><strong>Note:</strong> {r.customerNote}</p>}
      <ul>{r.lines.map(l=><li key={l.productId}>{l.quantity} × {productName(l.productId)}</li>)}</ul>
      <p><strong>Quoted by server:</strong> {money(r.quotedTotalMinor,overview.currency??"GHS")}</p>
      {r.status==="converted"&&<p role="status">Existing online order: {r.convertedOrderId}</p>}
      {r.status==="new"&&<div className="shop-actions">
       <button type="button" className="primary-action" disabled={busy}
         onClick={()=>void resolve(r.requestId,"convert")}>Convert to online order</button>
       <button type="button" className="secondary-action" disabled={busy}
         onClick={()=>void resolve(r.requestId,"decline")}>Decline request</button>
      </div>}
     </article>)}
    </div>
    <button type="button" className="secondary-action" disabled={busy} onClick={()=>void load()}>Refresh owner inbox</button>
   </>}
  </div>}
 </section>;
}
