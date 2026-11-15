/** Public, bearer-token storefront. Does not mount a ledger, sign in an
 * employee, charge a guest, reserve stock or confirm a completed sale. */
import {useEffect,useRef,useState,type FormEvent} from "react";
import {getGuestCatalog,isPublicUuid,submitGuestOrder,type GuestCatalog,type GuestReceipt} from "@/cloud/shopPublicOrders";
import {ShopRejectedError} from "@/cloud/shopClient";
import "./PublicShopOrderPage.css";

function formatMinor(value:bigint|number|string,currency:string):string {
 const minor=BigInt(value);
 if(minor>BigInt(Number.MAX_SAFE_INTEGER))return minor.toString()+" minor units";
 try{
  const nf=new Intl.NumberFormat(undefined,{style:"currency",currency});
  const decimals=nf.resolvedOptions().maximumFractionDigits??2;
  return nf.format(Number(minor)/10**decimals);
 }catch{return minor.toString()+" minor units ("+currency+")";}
}
const errorMessage=(cause:unknown)=>cause instanceof Error?cause.message:"The order request could not be confirmed.";
const pendingKey=(token:string)=>"tallybook.guestorder.pending."+token;
export default function PublicShopOrderPage(){
 const token=window.location.hash.slice(1);
 const validToken=isPublicUuid(token);
 const [catalog,setCatalog]=useState<GuestCatalog|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [selected,setSelected]=useState<Record<string,string>>({});
 const [customerName,setCustomerName]=useState("");
 const [contactPhone,setContactPhone]=useState("");
 const [customerNote,setCustomerNote]=useState("");
 const [consent,setConsent]=useState(false);
 const [busy,setBusy]=useState(false);
 const [unconfirmed,setUnconfirmed]=useState(false);
 const [receipt,setReceipt]=useState<GuestReceipt|null>(null);
 const active=useRef(true);
 useEffect(()=>{
  active.current=true;
  setLoading(true);setError("");setCatalog(null);
  if(!validToken){
   setLoading(false);setError("This order link is invalid or missing.");return;
  }
  void getGuestCatalog(token).then(c=>{
   if(active.current){setCatalog(c);setLoading(false);}
  }).catch(e=>{if(active.current){setError(errorMessage(e));setLoading(false);}});
  return()=>{active.current=false;};
 },[token,validToken]);
 const lines=Object.entries(selected).filter(([,value])=>/^[1-9][0-9]*$/.test(value)&&Number(value)<=100)
   .map(([productId,quantity])=>({productId,quantity:Number(quantity)}));
 const subtotal=lines.reduce((sum,l)=>{
  const p=catalog?.products.find(x=>x.productId===l.productId);
  return sum+BigInt(l.quantity)*BigInt(p?.unitPriceMinor??0);
 },0n);
 const validForm=catalog&&lines.length>0&&lines.length<=30&&
   customerName.trim().length>=2&&customerName.trim().length<=80&&
   /^[+0-9][0-9 ()+-]{5,59}$/.test(contactPhone.trim())&&
   customerNote.trim().length<=240&&consent;
 const submit=async(e:FormEvent)=>{
  e.preventDefault();
  if(!validForm||busy||receipt||!validToken||!navigator.onLine)return;
  const key=pendingKey(token);
  let id:string;
  try{
   const existing=sessionStorage.getItem(key);
   if(existing&&!isPublicUuid(existing))throw Error("Unrecognized prior request ID; do not create a replacement.");
   id=existing??crypto.randomUUID();
   if(!existing)sessionStorage.setItem(key,id);
  }catch(cause){setError("Cannot safely remember this order request on this device. Nothing was sent. "+errorMessage(cause));return;}
  setBusy(true);setError("");setNotice("");
  try{
   const result=await submitGuestOrder({shareToken:token,submissionKey:id,
     customerName,contactPhone,customerNote,consent:true,lines});
   if(!isPublicUuid(result.requestId))throw Error("Unverified request receipt.");
   sessionStorage.removeItem(key);
   setReceipt(result);setUnconfirmed(false);
  }catch(cause){
   const decided=cause instanceof ShopRejectedError;
   if(decided){sessionStorage.removeItem(key);setUnconfirmed(false);}
   else setUnconfirmed(true);
   setError(errorMessage(cause)+(decided?
     " Correct the issue and submit again.":
     " This request may already exist. Keep the details unchanged and retry using this page; never submit a different new order until the original is reconciled."));
  }finally{setBusy(false);}
 };
 return <main className="tb-guest-page">
  <header className="tb-guest-header"><strong>Tallybook</strong><span>by Alchemy · Guest order request</span></header>
  <div className="tb-guest-wrap">
   <p className="tb-guest-eyebrow">ORDER REQUEST · NOT PAYMENT</p>
   <h1>{catalog?.businessName??"Request products from a shop"}</h1>
   {catalog&&<p className="tb-guest-sub">{catalog.storeName} · {catalog.currency} · The shop must review and accept any order. Sending a request does not pay, reserve stock or guarantee a price.</p>}
   {loading&&<p role="status">Checking the shop's public order link…</p>}
   {error&&<p role="alert" className="tb-guest-error">{error}</p>}
   {catalog?.catalogLimited&&<p role="status">This public listing contains the first 200 available products. Ask the shop directly about other products.</p>}
   {receipt?<section className="tb-guest-receipt" aria-label="Request confirmation">
      <h2>Request received for review</h2>
      <p>Your request number is <code>{receipt.requestId}</code>.</p>
      <p>Quoted items total: <strong>{formatMinor(receipt.quotedTotalMinor,catalog!.currency)}</strong></p>
      <p>The shop has not accepted this order or collected payment. Contact the shop if you need to change the request.</p>
     </section>:
    catalog&&<form onSubmit={e=>void submit(e)} className="tb-guest-form">
     <section className="tb-guest-card">
      <h2>Select products</h2>
      {catalog.products.length===0&&<p role="status">No products are offered through this link. Contact the shop directly.</p>}
      <ul className="tb-guest-products">
       {catalog.products.map(p=><li key={p.productId}>
        <div><strong>{p.name}</strong>
         <small>{p.category? p.category+" · ":""}{p.kind==="service"?"Service":"Product"} · {formatMinor(p.unitPriceMinor,catalog.currency)} each</small>
        </div>
        <label>Quantity
         <input type="number" inputMode="numeric" min="0" max="100" step="1"
          disabled={busy||unconfirmed} aria-label={"Quantity of "+p.name}
          value={selected[p.productId]??"0"}
          onChange={e=>setSelected(prev=>({...prev,[p.productId]:e.target.value}))}/>
        </label>
       </li>)}
      </ul>
      <p role="status">{lines.length} distinct product(s) selected · Estimated total: <strong>{formatMinor(subtotal,catalog.currency)}</strong></p>
     </section>
     <section className="tb-guest-card">
      <h2>How the shop can contact you</h2>
      <label>Your name <input required minLength={2} maxLength={80} autoComplete="name"
       disabled={busy||unconfirmed} value={customerName} onChange={e=>setCustomerName(e.target.value)}/></label>
      <label>Contact phone <input required minLength={6} maxLength={60} autoComplete="tel"
       inputMode="tel" type="tel" disabled={busy||unconfirmed} value={contactPhone}
       onChange={e=>setContactPhone(e.target.value)} placeholder="+233…"/></label>
      <label>Note for the shop (optional) <textarea maxLength={240} rows={3} disabled={busy||unconfirmed}
       value={customerNote} onChange={e=>setCustomerNote(e.target.value)}/></label>
      <label className="tb-guest-consent"><input type="checkbox" disabled={busy||unconfirmed}
       checked={consent} onChange={e=>setConsent(e.target.checked)}/>
       <span>I agree to share these contact details with this shop to discuss my order. This is a request, not a paid or accepted purchase.</span>
      </label>
      <button className="tb-guest-submit" type="submit" disabled={!validForm||busy||!navigator.onLine}>
       {busy?"Sending request…":unconfirmed?"Retry the same request":"Send order request"}
      </button>
      {unconfirmed&&<p role="status">The original submission ID is retained in this tab. Do not edit the request while its result is uncertain.</p>}
      {notice&&<p role="status">{notice}</p>}
     </section>
    </form>}
   <footer>Prices are indicative until the shop confirms. Tallybook does not process customer payments through this page.</footer>
  </div>
 </main>;
}
