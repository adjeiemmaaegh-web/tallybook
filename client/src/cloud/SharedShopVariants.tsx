import {useCallback,useEffect,useRef,useState,type FormEvent} from "react";
import {Layers3,PackageCheck} from "lucide-react";
import {formatMinorAmount} from "@/features/inventory/inventory";
import {confirmAction} from "@/lib/confirmAction";
import {ShopRejectedError,type ShopOverview} from "./shopClient";
import {listShopVariants,normaliseVariantDraft,saveShopVariant,type ShopVariant} from "./shopVariants";

interface Props {companyId:string;overview:ShopOverview;online:boolean;storeId:string;refresh:()=>Promise<unknown>}
interface Editor {productId:string;family:string;size:string;color:string}
const blank:Editor={productId:"",family:"",size:"",color:""};
const message=(cause:unknown)=>cause instanceof Error?cause.message:"Variant operation unavailable.";
/** Deliberately hidden behind a collapsed section: no extra cloud calls in the
 * normal POS/stock workflow, and product/stock operations remain authoritative.
 */
export function SharedShopVariants({companyId,overview,online,storeId,refresh}:Props){
 const [expanded,setExpanded]=useState(false);
 return <section className="tb-variant-shell">
   <button type="button" className="tb-variant-trigger" aria-expanded={expanded}
     onClick={()=>setExpanded(value=>!value)}><Layers3 aria-hidden="true"/>
     <span><strong>Sizes & colours</strong><small>Group existing individually stocked products into variants</small></span></button>
   {expanded&&<VariantEditor key={companyId} {...{companyId,overview,online,storeId,refresh}}/>}
 </section>;
}
function VariantEditor({companyId,overview,online,storeId,refresh}:Props){
 const [rows,setRows]=useState<ShopVariant[]>([]);
 const [loaded,setLoaded]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [search,setSearch]=useState("");
 const [editor,setEditor]=useState<Editor>(blank);
 const generation=useRef(0);
 const pending=useRef<string|null>(null);
 const live=useRef(true);
 const load=useCallback(async()=>{
  const mine=++generation.current;
  setLoaded(false);setError("");
  if(!online){setRows([]);return;}
  try{
   const result=await listShopVariants(companyId);
   if(!live.current||generation.current!==mine)return;
   setRows(result);setLoaded(true);pending.current=null;
  }catch(cause){if(live.current&&generation.current===mine){setRows([]);setError(message(cause));}}
 },[companyId,online]);
 useEffect(()=>{
  live.current=true;void load();
  return()=>{live.current=false;generation.current++;};
 },[load]);
 const owner=overview.role==="owner";
 const stockFor=(productId:string)=>overview.stock.find(s=>s.storeId===storeId&&s.productId===productId)?.quantity??0;
 const goods=overview.products.filter(p=>p.kind!=="service"&&p.trackStock!==false);
 const names=new Map(overview.products.map(p=>[p.id,p]));
 const visible=rows.filter(row=>{
  const item=names.get(row.productId);
  const q=search.trim().toLocaleLowerCase();
  return !q||[row.variantFamily,row.variantSize,row.variantColor,item?.name,item?.barcode]
   .some(value=>(value??"").toLocaleLowerCase().includes(q));
 });
 const current=rows.find(r=>r.productId===editor.productId);
 const valid=()=>{
  try{return normaliseVariantDraft({productId:editor.productId,variantFamily:editor.family,
   variantSize:editor.size||null,variantColor:editor.color||null});}
  catch{return null;}
 };
 const draft=valid();
 const submit=async(event:FormEvent)=>{
  event.preventDefault();
  if(!owner||!online||busy||!loaded||!draft)return;
  const fingerprint=JSON.stringify(draft);
  if(pending.current&&pending.current!==fingerprint){
    setError("An earlier variant edit may already have saved. Refresh and reconcile the SKU before changing it.");return;
  }
  pending.current=fingerprint;
  setBusy(true);setError("");setNotice("");
  try{
   await saveShopVariant(companyId,draft);
   pending.current=null;
   setNotice("Variant grouping saved. The SKU's price, barcode and stock quantities were not changed.");
   setEditor(blank);
   await load();await refresh();
  }catch(cause){
   if(cause instanceof ShopRejectedError)pending.current=null;
   setError(message(cause));
  }finally{setBusy(false);}
 };
 const remove=async(row:ShopVariant)=>{
  if(!owner||busy||!online)return;
  if(!(await confirmAction("Remove this size/colour grouping? The underlying SKU, barcode, sales and stock will remain unchanged.",{danger:true,confirmLabel:"Ungroup SKU"})))return;
  setEditor({productId:row.productId,family:"",size:"",color:""});
  // Explicit two-step confirmation by saving the cleared form, not a hidden write.
  setNotice("Variant fields cleared in the editor. Select Save variant to confirm the change.");
 };
 return <div className="tb-variant-content">
  <p className="shop-muted">Each size/colour must be created as a separate product first. Every SKU retains its own barcode, price and per-store stock. Variants only group those SKUs; they do not split stock or rewrite sales.</p>
  {!online&&<p role="status">Connect to manage variants. Stored stock is not changed.</p>}
  {!loaded&&online&&!error&&<p role="status">Loading authoritative variants…</p>}
  {error&&<p role="alert" className="shop-alert">{error}</p>}
  {loaded&&<div className="tb-ops-metrics" aria-label="Variant summary">
    <div><span>Grouped SKUs</span><strong>{rows.length}</strong></div>
    <div><span>Families</span><strong>{new Set(rows.map(r=>r.variantFamily?.toLocaleLowerCase())).size}</strong></div>
  </div>}
  {loaded&&rows.length>0&&<label className="shop-field">Search variants
   <input type="search" value={search} onChange={e=>setSearch(e.target.value)} maxLength={80}
    placeholder="Family, size, colour, SKU or barcode"/>
  </label>}
  {loaded&&rows.length===0&&<p role="status">No variant groups saved yet. Create a separate SKU for each size or colour, then group them here.</p>}
  {loaded&&rows.length>0&&visible.length===0&&<p role="status">No variants match the search.</p>}
  {loaded&&visible.length>0&&<ul className="tb-variant-list">
   {visible.map(r=>{const p=names.get(r.productId);return <li key={r.productId}>
    <div><strong>{r.variantFamily}</strong><span className="tb-variant-tags">
      {r.variantSize&&<small>Size: {r.variantSize}</small>}
      {r.variantColor&&<small>Colour: {r.variantColor}</small>}
    </span><p className="shop-muted">{p?.name??"Product unavailable"} · {p?.barcode||"No barcode"} · {p?formatMinorAmount(p.unitPriceMinor,overview.currency??"GHS"):""} · {storeId?stockFor(r.productId)+" units in selected store":"Choose a store for stock"}</p></div>
    {owner&&<div className="shop-actions">
      <button type="button" className="secondary-action" disabled={busy||!online} onClick={()=>setEditor({productId:r.productId,family:r.variantFamily??"",size:r.variantSize??"",color:r.variantColor??""})}>Edit variant</button>
      <button type="button" className="secondary-action" disabled={busy||!online} onClick={()=>void remove(r)}>Ungroup</button>
    </div>}
   </li>;})}
  </ul>}
  {owner&&<form onSubmit={event=>void submit(event)} className="tb-variant-form">
    <h3>{current?"Edit SKU grouping":"Group a stocked SKU"}</h3>
    <label className="shop-field">Select stocked product
      <select value={editor.productId} onChange={e=>{const productId=e.target.value;const v=rows.find(r=>r.productId===productId);setEditor({productId,family:v?.variantFamily??"",size:v?.variantSize??"",color:v?.variantColor??""});setNotice("");}} required>
        <option value="">Choose an existing product</option>
        {goods.map(p=><option key={p.id} value={p.id}>{p.name}{p.barcode?" · "+p.barcode:""}</option>)}
      </select>
    </label>
    <label className="shop-field">Product family<input value={editor.family} onChange={e=>setEditor(s=>({...s,family:e.target.value}))} maxLength={80} placeholder="e.g. Cotton T-shirt"/></label>
    <div className="tb-variant-fields">
      <label className="shop-field">Size<input value={editor.size} onChange={e=>setEditor(s=>({...s,size:e.target.value}))} maxLength={40} placeholder="e.g. Medium"/></label>
      <label className="shop-field">Colour<input value={editor.color} onChange={e=>setEditor(s=>({...s,color:e.target.value}))} maxLength={40} placeholder="e.g. Blue"/></label>
    </div>
    <p className="shop-muted">Use an existing family name to group SKUs. The same family, size and colour combination cannot be assigned twice. Clear all fields to ungroup a SKU without deleting it.</p>
    {pending.current&&<p role="status">An earlier variant save is unconfirmed. Retry the same details or refresh and reconcile before changing them.</p>}
    <div className="shop-actions">
      <button type="submit" className="primary-action" disabled={!online||busy||!loaded||!draft}><PackageCheck aria-hidden="true"/> Save variant</button>
      <button type="button" className="secondary-action" onClick={()=>setEditor(blank)}>Clear form</button>
      <button type="button" className="secondary-action" disabled={!online||busy} onClick={()=>void load()}>Refresh variants</button>
    </div>
    {notice&&<p role="status">{notice}</p>}
  </form>}
 </div>;
}
