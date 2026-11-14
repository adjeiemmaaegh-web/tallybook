/** Owner-only server stocktaking. Count start captures an expected quantity;
 * applying fails on the server if stock changed since count began.
 */
import {useCallback,useEffect,useRef,useState} from "react";
import { confirmAction } from "@/lib/confirmAction";
import {openStockCount} from "./purchaseRetry";
import type {ShopOverview} from "./shopClient";
import {tracksStock} from "./productTracking";
import {getShopStockCounts,startShopStockCount,applyShopStockCount,cancelShopStockCount,type ShopStockCount} from "./shopPurchasing";
interface Props {userId:string;companyId:string;overview:ShopOverview;online:boolean;refresh:()=>Promise<void>}
export function SharedShopStockCountPanel({userId,companyId,overview,online,refresh}:Props){
 const [counts,setCounts]=useState<ShopStockCount[]>([]);
 const [query,setQuery]=useState("");
 const [filter,setFilter]=useState<"all"|"open"|"applied"|"cancelled">("all");
 const [storeId,setStoreId]=useState("");const [productId,setProductId]=useState("");
 const [counted,setCounted]=useState<Record<string,string>>({});
 const [loading,setLoading]=useState(false);const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");const [status,setStatus]=useState("");
 const startKey=useRef<{storeId:string;productId:string}|null>(null);
 const load=useCallback(async()=>{
  if(!online)return;
  setLoading(true);
  try{const data=await getShopStockCounts(companyId);setCounts(data.counts);setError("");}
  catch(e){setError(e instanceof Error?e.message:"Could not load stock counts.");}
  finally{setLoading(false);}
 },[companyId,online]);
 useEffect(()=>{setCounts([]);setStoreId("");setProductId("");startKey.current=null;if(online)void load();},[companyId,online,load]);
 const action=async(work:()=>Promise<unknown>,label:string)=>{
  if(!online||busy)return;
  setBusy(true);setError("");setStatus("");
  try{await work();setStatus(label+" saved in the server ledger.");await load();await refresh();}
  catch(e){setError((e instanceof Error?e.message:"Operation failed.")+" If the network timed out, reload the saved count before retrying; do not create a new count for an uncertain result.");}
  finally{setBusy(false);}
 };
 const begin=()=>{
  if(!storeId||!productId)return;
  if(startKey.current&&(startKey.current.storeId!==storeId||startKey.current.productId!==productId)){
    setError("An earlier count start is unresolved. Verify its status before switching the product.");return;
  }
  startKey.current??={storeId,productId};
  const saved=startKey.current;
  void action(async()=>{
    await openStockCount(userId, companyId, saved, sessionStorage, startShopStockCount);
    startKey.current=null;
  },"Stock count opened");
 };
 const apply=async(item:ShopStockCount)=>{
  const text=counted[item.countId]?.trim();
  if(!text||!/^(0|[1-9][0-9]*)$/.test(text)){setError("Enter a whole counted quantity of zero or more.");return;}
  const countedQuantity=Number(text);
  if(!Number.isSafeInteger(countedQuantity)||countedQuantity>2147483647){setError("Count exceeds supported stock limit.");return;}
  if(!(await confirmAction("Confirm the physical shelf count? The server will refuse to apply it if stock changed since the count started.")))return;
  void action(()=>applyShopStockCount(companyId,{countId:item.countId,countedQuantity}),"Physical stock count");
 };
 const stores=overview.stores.filter(s=>s.status==="active");
 const products=overview.products.filter(p=>p.active&&tracksStock(p));
 const allProducts=overview.products;
 const storeName=(id:string)=>overview.stores.find(store=>store.id===id)?.name??"Previous store";
 const productName=(id:string)=>allProducts.find(product=>product.id===id)?.name??"Previous product";
 const visibleCounts=overview.role==="owner"?counts:counts.filter(row=>row.status==="open");
 const found=visibleCounts.filter(row=>{
  if(filter!=="all"&&row.status!==filter)return false;
  const search=query.trim().toLocaleLowerCase();
  return !search||[row.countId,row.storeId,row.productId,storeName(row.storeId),productName(row.productId)].some(value=>value.toLocaleLowerCase().includes(search));
 });
 const openRows=found.filter(row=>row.status==="open");
 const previousRows=found.filter(row=>row.status==="applied"||row.status==="cancelled");
 const opened=visibleCounts.filter(row=>row.status==="open").length;
 const applied=visibleCounts.filter(row=>row.status==="applied").length;
 const cancelled=visibleCounts.filter(row=>row.status==="cancelled").length;
 return <section className="shop-card space-y-3 tb-stocktake-page" aria-label="Shared shop stock count review">
  <div className="tb-stocktake-intro"><p className="shop-eyebrow">INVENTORY CONTROL · PHYSICAL COUNT</p>
    <h2>Stock take</h2>
    <p>Count what is actually on your shelves, then post the difference to the verified stock ledger.</p>
    <div className="tb-stocktake-metrics" aria-label="Count summary">
     <div><span>Sessions</span><strong>{visibleCounts.length}</strong></div>
     <div><span>Open</span><strong>{opened}</strong></div>
     <div><span>Done</span><strong>{applied}</strong></div>
     <div><span>Cancelled</span><strong>{cancelled}</strong></div>
    </div>
  </div>
  <p className="shop-muted">Each count is for one product at one store. Stock is only adjusted after you confirm the observed quantity; if a sale or receipt changes stock in the meantime, the server rejects a stale adjustment.</p>
  {!online&&<p role="status">Counts require an authorized online connection. Offline edits are not queued.</p>}
  {error&&<p role="alert" className="shop-alert">{error}</p>}{status&&<p role="status">{status}</p>}
  <div className="tb-stocktake-new">
   <h3>Start a physical count</h3>
   <div className="shop-grid">
    <label className="shop-field">Store<select value={storeId} disabled={busy} onChange={e=>setStoreId(e.target.value)}><option value="">Choose store</option>{stores.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label>
    <label className="shop-field">Product<select value={productId} disabled={busy} onChange={e=>setProductId(e.target.value)}><option value="">Choose product</option>{products.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
   </div>
   <button type="button" className="primary-action" disabled={busy||!online||!storeId||!productId} onClick={begin}>+ Start stock take</button>
  </div>
  <div className="tb-stocktake-list-head">
   <h3>Count history</h3>
   <p className="shop-muted">Newest first · {found.length} showing</p>
   <label className="shop-field"><span className="sr-only">Search count records</span>
    <input type="search" value={query} onChange={event=>setQuery(event.target.value)} maxLength={80} placeholder="Search count #, store, product…" /></label>
   <div className="shop-chips" role="group" aria-label="Count status">
    {([["all","All"],["open","Open"],["applied","Done"],["cancelled","Cancelled"]] as const).map(([value,label])=>
     <button type="button" className="shop-chip" key={value} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{label}</button>)}
   </div>
  </div>
  {loading&&<p role="status">Reading saved count history…</p>}
  {!loading&&visibleCounts.length===0&&<div className="tb-stocktake-empty">
    <span aria-hidden="true">✓</span><strong>No active stock takes</strong>
    <p className="shop-muted">Choose a store and tracked product above to start an authorized count.</p>
  </div>}
  {!loading&&visibleCounts.length>0&&found.length===0&&<p className="shop-muted">No counts match these filters. <button className="shop-link" type="button" onClick={()=>{setFilter("all");setQuery("");}}>Clear filters</button></p>}
  {openRows.map(row=><div key={row.countId} className="tb-stocktake-row">
   <div className="tb-stocktake-row-title"><strong>{productName(row.productId)}</strong><span className="tb-stocktake-state">Open</span></div>
   <p>{storeName(row.storeId)} · Expected {row.expectedQuantity} units · {new Date(row.createdAt).toLocaleString()}</p>
   <small>Count # {row.countId}</small>
   <label className="shop-field">Physically counted units<input inputMode="numeric" value={counted[row.countId]??""} onChange={e=>setCounted(x=>({...x,[row.countId]:e.target.value}))}/></label>
   <div className="shop-actions"><button type="button" className="primary-action" disabled={!online||busy} onClick={()=>apply(row)}>Apply physical count</button>
    <button type="button" className="secondary-action" disabled={!online||busy} onClick={async()=>{if(await confirmAction("Cancel this unposted count?",{danger:true}))void action(()=>cancelShopStockCount(companyId,row.countId),"Count cancelled");}}>Cancel</button></div>
  </div>)}
  {previousRows.map(row=><div key={row.countId} className="tb-stocktake-row tb-stocktake-row-complete">
    <div className="tb-stocktake-row-title"><strong>{productName(row.productId)}</strong><span className="tb-stocktake-state">{row.status==="applied"?"Done":"Cancelled"}</span></div>
    <p>{storeName(row.storeId)} · {new Date(row.createdAt).toLocaleString()}</p>
    <p>Expected {row.expectedQuantity} · {row.status==="applied"?`Counted ${row.countedQuantity??"—"} · Variance ${row.countedQuantity===null?"—":row.countedQuantity-row.expectedQuantity}`:"No adjustment posted"}</p>
    <small>Count # {row.countId}</small>
  </div>)}
  <p className="shop-muted">History shows at most 100 records returned by the server. Counts do not identify who caused a discrepancy. Historical counts are limited to business owners.</p>
 </section>;
}
