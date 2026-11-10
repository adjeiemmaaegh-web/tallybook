/** Owner-only server stocktaking. Count start captures an expected quantity;
 * applying fails on the server if stock changed since count began.
 */
import {useCallback,useEffect,useRef,useState} from "react";
import { confirmAction } from "@/lib/confirmAction";
import {openStockCount} from "./purchaseRetry";
import type {ShopOverview} from "./shopClient";
import {getShopStockCounts,startShopStockCount,applyShopStockCount,cancelShopStockCount,type ShopStockCount} from "./shopPurchasing";
interface Props {userId:string;companyId:string;overview:ShopOverview;online:boolean;refresh:()=>Promise<void>}
export function SharedShopStockCountPanel({userId,companyId,overview,online,refresh}:Props){
 const [counts,setCounts]=useState<ShopStockCount[]>([]);
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
 const products=overview.products.filter(p=>p.active);
 return <section className="shop-card space-y-3" aria-label="Shared shop stock count review">
  <h2>Physical stock counts</h2>
  <p className="shop-muted">Start a count, physically check the product, then confirm the observed quantity. A sale or receipt posted after the count began prevents stale adjustment.</p>
  {!online&&<p role="status">Counts require an authorized online connection. Offline edits are not queued.</p>}
  {error&&<p role="alert" className="shop-alert">{error}</p>}{status&&<p role="status">{status}</p>}
  <div className="shop-grid">
   <label className="shop-field">Store<select value={storeId} disabled={busy} onChange={e=>setStoreId(e.target.value)}><option value="">Choose store</option>{stores.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label>
   <label className="shop-field">Product<select value={productId} disabled={busy} onChange={e=>setProductId(e.target.value)}><option value="">Choose product</option>{products.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
  </div>
  <button type="button" className="secondary-action" disabled={busy||!online||!storeId||!productId} onClick={begin}>Start physical stock count</button>
  {loading&&<p role="status">Reading saved count history…</p>}
  {counts.filter(c=>c.status==="open").map(row=><div key={row.countId} className="rounded border p-3 space-y-2">
   <strong>{products.find(p=>p.id===row.productId)?.name??row.productId}</strong>
   <p>{stores.find(s=>s.id===row.storeId)?.name??row.storeId} · At count start: {row.expectedQuantity} units</p>
   <label className="shop-field">Physically counted units<input inputMode="numeric" value={counted[row.countId]??""} onChange={e=>setCounted(x=>({...x,[row.countId]:e.target.value}))}/></label>
   <div className="shop-actions"><button type="button" className="primary-action" disabled={!online||busy} onClick={()=>apply(row)}>Apply physical count</button>
    <button type="button" className="secondary-action" disabled={!online||busy} onClick={async()=>{if(await confirmAction("Cancel this unposted count?",{danger:true}))void action(()=>cancelShopStockCount(companyId,row.countId),"Count cancelled");}}>Cancel</button></div>
  </div>)}
  <p className="shop-muted">Latest server count history (up to 100): {counts.length} records, including {counts.filter(c=>c.status==="applied").length} applied and {counts.filter(c=>c.status==="cancelled").length} cancelled.</p>
 </section>;
}
