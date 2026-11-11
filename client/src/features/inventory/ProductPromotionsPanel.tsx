import {useEffect,useState} from "react";
import { confirmAction } from "@/lib/confirmAction";
import type {InventorySnapshot} from "./inventory";
import {setProductPromotion} from "./promotions";
import {validatePromotionHistory} from "./promotionRules.mjs";
interface Props {
 companyId:string;country:string;products:InventorySnapshot["products"];
 onSaved:()=>Promise<void>;
}
const dateKey=(value:Date)=>value.toISOString().slice(0,10);
const startDay=(day:string)=>day+"T00:00:00.000Z";
const endDay=(day:string)=>day+"T23:59:59.999Z";
/** Changes are owner-authorized ledger revisions, not permissionless markdown prices. */
export function ProductPromotionsPanel({companyId,country,products,onSaved}:Props){
 const [productId,setProductId]=useState("");
 const [enabled,setEnabled]=useState(true);
 const [percent,setPercent]=useState("10");
 const [from,setFrom]=useState(()=>dateKey(new Date()));
 const [until,setUntil]=useState(()=>dateKey(new Date(Date.now()+30*86400000)));
 const [reason,setReason]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [saved,setSaved]=useState("");
 useEffect(()=>{setProductId("");setError("");setSaved("");},[companyId]);
 const product=products.find(p=>p.id===productId);
 const history=product?validatePromotionHistory(product.promotionHistory,product.id,companyId):[];
 const current=history.at(-1);
 const percentage=Number(percent);
 const save=async()=>{
  if(!product||busy)return;
  if(country.trim().toLowerCase()!=="ghana"){setError("This release uses Ghana UTC-date promotion boundaries. Ghana businesses only.");return;}
  const discountBps=enabled?Math.round(percentage*100):0;
  if(enabled&&(!/^\d+(?:\.\d{1,2})?$/.test(percent)||!Number.isSafeInteger(discountBps)||discountBps<1||discountBps>9000)){
   setError("Enter a promotion percentage between 0.01% and 90%.");return;
  }
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(until)||until<from){
   setError("Promotion end date must not come before its start date.");return;
  }
  if(reason.trim().length<4){setError("Enter an explanation for the owner audit history.");return;}
  if(!(await confirmAction(`Save ${enabled?percent+"% discount":"promotion disabled"} on ${product.name}? Every new sale will use the then-active rule, and existing sale prices will not be rewritten.`)))return;
  setBusy(true);setError("");setSaved("");
  try{
   const revision=await setProductPromotion(product.id,{
     enabled,discountBps,startsAt:startDay(from),endsAt:endDay(until),reason:reason.trim()
   });
   setSaved(`Promotion revision ${revision.revision} recorded. New checkouts must refresh and review the final amount.`);
   setReason("");await onSaved();
  }catch(e){setError(e instanceof Error?e.message:"Could not update product promotion.");}
  finally{setBusy(false);}
 };
 return <section className="inventory-record p-5 space-y-3" aria-label="Owner product promotion controls">
  <h2 className="text-lg font-semibold">Owner-configured product promotions</h2>
  <p className="text-sm">Schedule a percentage reduction before other discounts and Ghana tax. Staff cannot edit past sale prices. Changes require an unlocked owner account and leave an audit record. All dates use Ghana GMT.</p>
  <label className="block">Product<select className="block w-full border rounded p-3 bg-background" value={productId} onChange={e=>{setProductId(e.target.value);setSaved("");setError("");}}><option value="">Choose active product</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
  {product&&<><p>Saved revisions: {history.length}. {current?`Last: ${current.enabled?current.discountBps/100+"%":"disabled"} from ${current.startsAt.slice(0,10)} to ${current.endsAt.slice(0,10)}.`:"No promotion has been activated."}</p>
   <label className="flex items-center gap-2"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>Enable scheduled promotion</label>
   {enabled&&<label className="block">Discount percentage<input className="block w-full border rounded p-3 bg-background" inputMode="decimal" value={percent} onChange={e=>setPercent(e.target.value)} placeholder="10" /></label>}
   <div className="grid gap-2 sm:grid-cols-2"><label>Start (Ghana)<input type="date" className="block w-full border rounded p-3 bg-background" value={from} onChange={e=>setFrom(e.target.value)}/></label>
   <label>End (Ghana)<input type="date" className="block w-full border rounded p-3 bg-background" value={until} onChange={e=>setUntil(e.target.value)}/></label></div>
   <label className="block">Owner reason<input className="block w-full border rounded p-3 bg-background" value={reason} onChange={e=>setReason(e.target.value)} maxLength={200} placeholder="e.g. 10-day shelf promotion"/></label>
   {error&&<p role="alert">{error}</p>}{saved&&<p role="status">{saved}</p>}
   <button type="button" className="primary-action" disabled={busy||!reason.trim()} onClick={()=>void save()}>{busy?"Saving…":"Save audited promotion revision"}</button>
   <p className="text-xs">Only ordinary local POS checkout supports these rules. Existing reserved commerce orders and Shared Shop use separate pricing; do not assume this promotion reaches them.</p>
  </>}
 </section>;
}
