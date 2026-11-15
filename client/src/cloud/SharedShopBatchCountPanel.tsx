import {useCallback,useEffect,useRef,useState} from "react";
import {confirmAction} from "@/lib/confirmAction";
import type {ShopOverview} from "./shopClient";
import {tracksStock} from "./productTracking";
import {physicalCountPreview} from "./shopReconciliationView";
import {
 applyBatchStocktake,cancelBatchStocktake,listBatchStocktakes,normalizeBatchProducts,
 startBatchStocktake,validBatchId,
 type BatchStocktake,
} from "./shopBatchStocktake";

interface Props {userId:string;companyId:string;overview:ShopOverview;online:boolean;refresh:()=>Promise<void>}
interface PendingStart {batchId:string;storeId:string;productIds:string[]}
const message=(error:unknown)=>error instanceof Error?error.message:"The request could not be verified.";
const storageKey=(companyId:string,userId:string)=>"tallybook.batch-stocktake.pending."+companyId+"."+userId;
function parsePending(raw:string|null):PendingStart|null {
 if(!raw)return null;
 const value:unknown=JSON.parse(raw);
 if(!value||typeof value!=="object")throw Error("Unrecognized pending request.");
 const x=value as PendingStart;
 if(!validBatchId(x.batchId)||!validBatchId(x.storeId))throw Error("Unrecognized pending request.");
 return {...x,productIds:normalizeBatchProducts(x.productIds)};
}
const sameProducts=(left:readonly string[],right:readonly string[])=>
 left.length===right.length&&[...left].sort().every((x,i)=>x===[...right].sort()[i]);

/** The existing single-SKU count remains available. This is an optional,
 * isolated batch path and never guesses stock from the browser cache. */
export function SharedShopBatchCountPanel({userId,companyId,overview,online,refresh}:Props){
 const [expanded,setExpanded]=useState(false);
 const [batches,setBatches]=useState<BatchStocktake[]>([]);
 const [loaded,setLoaded]=useState(false);
 const [busy,setBusy]=useState(false);
 const [storeId,setStoreId]=useState("");
 const [chosen,setChosen]=useState<string[]>([]);
 const [query,setQuery]=useState("");
 const [counts,setCounts]=useState<Record<string,string>>({});
 const [pending,setPending]=useState<PendingStart|null>(null);
 const [pendingBroken,setPendingBroken]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const sequence=useRef(0);
 const owner=overview.role==="owner";
 const key=storageKey(companyId,userId);
 const products=overview.products.filter(p=>p.active&&tracksStock(p));
 const nameOf=(id:string)=>overview.products.find(p=>p.id===id)?.name??"Former product";
 const storeOf=(id:string)=>overview.stores.find(s=>s.id===id)?.name??"Former store";
 const load=useCallback(async()=>{
   const mine=++sequence.current;
   setLoaded(false);setError("");
   if(!online)return;
   try{
    const saved=await listBatchStocktakes(companyId);
    if(mine!==sequence.current)return;
    setBatches(saved);setLoaded(true);
    const existing=parsePending(sessionStorage.getItem(key));
    if(existing){
      const match=saved.find(s=>s.batchId===existing.batchId);
      if(match){
        if(match.storeId!==existing.storeId||
           !sameProducts(match.lines.map(l=>l.productId),existing.productIds))
          throw Error("Pending batch ID conflicts with saved ledger. Do not retry.");
        sessionStorage.removeItem(key);
        setPending(null);
      }else setPending(existing);
    }else setPending(null);
    setPendingBroken(false);
   }catch(e){
    if(mine===sequence.current){
      setLoaded(false);setError(message(e));
      if(e instanceof SyntaxError||/pending batch|Unrecognized pending/i.test(message(e)))setPendingBroken(true);
    }
   }
 },[companyId,key,online]);
 useEffect(()=>{
   if(!expanded)return;
   setBatches([]);setLoaded(false);setPending(null);setCounts({});
   void load();
   return()=>{sequence.current++;};
 },[expanded,load]);
 const submit=async(fn:()=>Promise<unknown>,success:string)=>{
  if(!online||!owner||busy||!loaded||pendingBroken)return;
  setBusy(true);setError("");setNotice("");
  try{await fn();setNotice(success);await load();await refresh();}
  catch(e){setError(message(e)+" Refresh the server history before retrying an uncertain request.");}
  finally{setBusy(false);}
 };
 const begin=()=>{
  if(!storeId||chosen.length<2||pending||pendingBroken)return;
  let productIds:string[];
  try{productIds=normalizeBatchProducts(chosen);}catch(e){setError(message(e));return;}
  const draft:PendingStart={batchId:crypto.randomUUID(),storeId,productIds};
  try{sessionStorage.setItem(key,JSON.stringify(draft));setPending(draft);}
  catch{setError("Cannot safely persist a batch request ID in this tab. No request was sent.");return;}
  void submit(async()=>{
    const receipt=await startBatchStocktake(companyId,draft);
    if(receipt.batchId!==draft.batchId||!["open","applied","cancelled"].includes(receipt.status))
      throw Error("Batch creation acknowledgement did not match.");
  },"Batch opened on the server. Enter observations against each snapshot.");
 };
 const retry=()=>{
  if(!pending)return;
  void submit(async()=>{
    const receipt=await startBatchStocktake(companyId,pending);
    if(receipt.batchId!==pending.batchId)throw Error("Batch retry acknowledgement did not match.");
  },"Pending batch request reconciled.");
 };
 const apply=async(batch:BatchStocktake)=>{
  const entries=batch.lines.map(l=>{
   const preview=physicalCountPreview(l.expectedQuantity,counts[batch.batchId+":"+l.productId]??"");
   return preview?{productId:l.productId,countedQuantity:preview.counted,delta:preview.variance}:null;
  });
  if(entries.some(e=>!e)){setError("Enter one valid observed count for every product.");return;}
  const lines=entries.filter((e):e is NonNullable<typeof e>=>e!==null);
  const changed=lines.filter(x=>x.delta!==0).length;
  if(!(await confirmAction(
    "Post all "+lines.length+" physical counts together at "+storeOf(batch.storeId)+
    "? "+changed+" product(s) differ from their original snapshots. If ANY product changed since counting began, the server will reject the ENTIRE batch.",
    {confirmLabel:"Post entire batch"})))return;
  void submit(async()=>{
    const receipt=await applyBatchStocktake(companyId,{
      batchId:batch.batchId,lines:lines.map(({productId,countedQuantity})=>({productId,countedQuantity}))
    });
    if(receipt.batchId!==batch.batchId||receipt.status!=="applied")
      throw Error("The server did not confirm that the batch was posted.");
  },"Entire batch posted as one transaction.");
 };
 const cancel=async(batch:BatchStocktake)=>{
  if(!(await confirmAction("Cancel this unposted batch? Existing stock is not changed.",{danger:true})))return;
  void submit(()=>cancelBatchStocktake(companyId,batch.batchId),"Batch cancelled without adjustments.");
 };
 const clearPending=async()=>{
  if(!loaded||busy||!pending)return;
  if(!(await confirmAction(
    "Only clear this pending request after checking server history. A previous batch may have been committed even if its response was lost. Clearing allows a different new batch.",
    {danger:true,confirmLabel:"Clear after review"})))return;
  sessionStorage.removeItem(key);setPending(null);
  setNotice("Pending request ID cleared after your reconciliation. No server rows were changed.");
 };
 const visible=products.filter(p=>p.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 return <section className="tb-batch-panel" aria-label="Multi-product stocktake">
  <button type="button" className="secondary-action" aria-expanded={expanded} onClick={()=>setExpanded(s=>!s)}>
   {expanded?"Hide":"Open"} multi-product stocktake (2–50 SKUs)
  </button>
  {expanded&&<div className="tb-batch-content">
   <p className="shop-muted">One saved store snapshot, many products, one atomic posting. Existing single-product counts below remain independent. Batch sessions require the authorized server upgrade.</p>
   {!online&&<p role="status">Connect before starting or posting a batch. No offline batch changes are queued.</p>}
   {error&&<p role="alert" className="shop-alert">{error}</p>}
   {notice&&<p role="status">{notice}</p>}
   {pendingBroken&&<p role="alert">An unresolved local batch ID cannot be verified. Do not create another until this browser's saved request is reconciled.</p>}
   {online&&!loaded&&!error&&<p role="status">Reading authoritative batch sessions…</p>}
   {online&&!loaded&&error&&<p role="status">Batch history unavailable; no empty-history conclusion can be drawn.</p>}
   <div className="shop-actions">
    <button type="button" className="secondary-action" disabled={!online||busy} onClick={()=>void load()}>Refresh batch history</button>
   </div>
   {loaded&&pending&&<div className="tb-batch-pending" role="status">
    <strong>Unconfirmed batch start: {pending.batchId}</strong>
    <p>Retry exactly the same store and product selection, or reconcile server history before clearing. Do not open a replacement batch yet.</p>
    <div className="shop-actions">
     <button type="button" className="secondary-action" disabled={!online||busy} onClick={retry}>Retry same batch ID</button>
     <button type="button" className="secondary-action" disabled={busy} onClick={()=>void clearPending()}>Clear after reconciliation</button>
    </div>
   </div>}
   {loaded&&!pending&&!pendingBroken&&owner&&<div className="tb-batch-create">
    <h3>Open a batch session</h3>
    <label className="shop-field">Store
     <select value={storeId} disabled={busy} onChange={e=>{setStoreId(e.target.value);setChosen([]);}}>
      <option value="">Choose store</option>
      {overview.stores.filter(s=>s.status==="active").map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
     </select>
    </label>
    <label className="shop-field">Search stock-tracked goods
      <input type="search" value={query} maxLength={90} onChange={e=>setQuery(e.target.value)} placeholder="Search products"/>
    </label>
    <div className="tb-batch-pick" aria-label="Choose products for a batch">
      {visible.map(p=><label key={p.id}>
       <input type="checkbox" disabled={busy||!storeId||(!chosen.includes(p.id)&&chosen.length>=50)}
        checked={chosen.includes(p.id)} onChange={e=>setChosen(current=>
          e.target.checked?[...current,p.id]:current.filter(id=>id!==p.id))}/>
       <span>{p.name}</span>
      </label>)}
    </div>
    <p role="status">{chosen.length} product(s) selected. Select at least two; server snapshots are captured when opened.</p>
    <button type="button" className="primary-action" disabled={!online||busy||!storeId||chosen.length<2}
       onClick={begin}>Open selected batch</button>
   </div>}
   {loaded&&<div className="tb-batch-history">
    <h3>Saved batch sessions</h3>
    <p className="shop-muted">The server returns the latest 30 sessions. Earlier sessions may exist; zero visible records is not a full-history audit.</p>
    {batches.length===0&&<p role="status">No batch sessions in the latest server results.</p>}
    {batches.map(b=><article className="tb-batch-session" key={b.batchId}>
      <h4>{storeOf(b.storeId)} · {b.lines.length} products · {b.status}</h4>
      <small>{b.batchId} · {new Date(b.createdAt).toLocaleString()}</small>
      {b.lines.map(l=><div className="tb-batch-line" key={l.productId}>
       <span>{nameOf(l.productId)} · expected {l.expectedQuantity}</span>
       {b.status==="open"?
        <label className="shop-field">Counted quantity
         <input aria-label={"Count "+nameOf(l.productId)+" in batch "+b.batchId}
          inputMode="numeric" maxLength={10} disabled={busy||!online}
          value={counts[b.batchId+":"+l.productId]??""}
          onChange={e=>setCounts(old=>({...old,[b.batchId+":"+l.productId]:e.target.value}))}/>
        </label>:
        <span>{b.status==="applied"?"Counted "+l.countedQuantity:"Cancelled — not posted"}</span>}
      </div>)}
      {b.status==="open"&&<div className="shop-actions">
       <button type="button" className="primary-action" disabled={!online||busy||
        b.lines.some(l=>!physicalCountPreview(l.expectedQuantity,counts[b.batchId+":"+l.productId]??""))}
        onClick={()=>void apply(b)}>Apply entire batch</button>
       <button type="button" className="secondary-action" disabled={!online||busy} onClick={()=>void cancel(b)}>Cancel batch</button>
      </div>}
     </article>)}
   </div>}
  </div>}
 </section>;
}
