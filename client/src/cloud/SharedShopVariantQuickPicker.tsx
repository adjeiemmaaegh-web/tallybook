import {useCallback,useEffect,useRef,useState} from "react";
import type {ShopProduct,ShopOverview} from "./shopClient";
import {listShopVariants,type ShopVariant} from "./shopVariants";
import {formatMinorAmount} from "@/features/inventory/inventory";
import {tracksStock} from "./productTracking";

interface Props {
 companyId:string;overview:ShopOverview;online:boolean;storeId:string;
 available:(product:ShopProduct)=>boolean;
 onAdd:(product:ShopProduct)=>boolean;
}
const message=(cause:unknown)=>cause instanceof Error?cause.message:"Variant catalogue is unavailable.";
/** Pure POS convenience: the existing addProduct controls availability,
 * cart quantity and final server-priced checkout. No variant action posts a sale. */
export function SharedShopVariantQuickPicker({companyId,overview,online,storeId,available,onAdd}:Props){
 const [open,setOpen]=useState(false);
 const [loaded,setLoaded]=useState(false);
 const [rows,setRows]=useState<ShopVariant[]>([]);
 const [error,setError]=useState("");
 const [search,setSearch]=useState("");
 const [family,setFamily]=useState("");
 const [notice,setNotice]=useState("");
 const generation=useRef(0);
 const load=useCallback(async()=>{
  const mine=++generation.current;setLoaded(false);setError("");setNotice("");
  if(!online)return;
  try{
   const result=await listShopVariants(companyId);
   if(generation.current!==mine)return;
   setRows(result);setLoaded(true);
  }catch(e){if(generation.current===mine){setRows([]);setError(message(e));}}
 },[companyId,online]);
 useEffect(()=>{
  if(!open)return;
  setRows([]);setLoaded(false);setFamily("");
  void load();
  return()=>{generation.current++;};
 },[open,load]);
 const products=new Map(overview.products.map(p=>[p.id,p]));
 const candidates=rows.filter(r=>{
  const p=products.get(r.productId);
  return p?.active&&tracksStock(p);
 });
 const groups=[...new Set(candidates.map(r=>r.variantFamily).filter((v):v is string=>!!v))]
   .sort((a,b)=>a.localeCompare(b));
 const shown=groups.filter(x=>x.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
 const selected=candidates.filter(r=>r.variantFamily===family);
 const stockOf=(productId:string)=>overview.stock.find(x=>x.storeId===storeId&&x.productId===productId)?.quantity??0;
 return <section className="tb-pos-variants" aria-label="Browse product sizes and colours">
  <button className="secondary-action" type="button" aria-expanded={open}
   onClick={()=>setOpen(s=>!s)}>
   {open?"Hide":"Browse"} sizes & colours
  </button>
  {open&&<div className="tb-pos-variants-body">
   <p className="shop-muted">Choose a product family, then an individually stocked SKU. The normal cart checks stock and the server prices the sale.</p>
   {!online&&<p role="status">Reconnect to load grouped variants; ordinary product search remains available offline.</p>}
   {online&&!loaded&&!error&&<p role="status">Loading grouped products…</p>}
   {error&&<p role="alert">{error}</p>}
   {loaded&&rows.length===0&&<p role="status">No size/colour groups have been configured for this shop.</p>}
   {loaded&&groups.length>0&&<>
    <label className="shop-field">Search product families
     <input type="search" maxLength={80} value={search} onChange={e=>{setSearch(e.target.value);setFamily("");}}
       placeholder="Family name"/>
    </label>
    <div className="tb-pos-variant-groups" role="group" aria-label="Product families">
     {shown.map(name=><button type="button" key={name} className="shop-chip"
       aria-pressed={family===name} onClick={()=>{setFamily(name);setNotice("");}}>{name}</button>)}
    </div>
    {shown.length===0&&<p role="status">No families match.</p>}
    {family&&<ul className="tb-pos-variant-skus">{selected.map(row=>{
      const p=products.get(row.productId);
      if(!p)return null;
      const canAdd=available(p);
      return <li key={p.id}>
       <span><strong>{row.variantSize||"One size"} · {row.variantColor||"One colour"}</strong>
        <small>{p.name} · {formatMinorAmount(p.unitPriceMinor,overview.currency??"GHS")} · {stockOf(p.id)} in this store</small></span>
       <button className="secondary-action" type="button" disabled={!storeId||!canAdd}
        onClick={()=>{if(onAdd(p))setNotice(p.name+" added to the original cart.");}}>
        {canAdd?"Add SKU":"Out of stock"}
       </button>
      </li>;
    })}</ul>}
   </>}
   {notice&&<p role="status">{notice}</p>}
   <button type="button" className="shop-link" disabled={!online} onClick={()=>void load()}>Refresh grouping</button>
  </div>}
 </section>;
}
