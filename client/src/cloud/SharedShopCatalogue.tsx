import {useEffect,useRef,useState,type FormEvent} from 'react';
import {commerce,type CustomerOrder} from './publicCommerce';
import {recordShopSale,type ShopOverview} from './shopClient';
import {submitSale} from './shopOutbox';
import {formatMinorAmount} from '@/features/inventory/inventory';
interface Settings {enabled:boolean;revision:number;storeId:string|null;privacyNotice:string|null;retentionDays:number|null;productIds:string[]}
export function SharedShopCatalogue({companyId,userId,overview}:{companyId:string;userId:string;overview:ShopOverview}) {
 const [settings,setSettings]=useState<Settings|null>(null),[orders,setOrders]=useState<CustomerOrder[]>([]);
 const [store,setStore]=useState(''),[products,setProducts]=useState<string[]>([]),[privacy,setPrivacy]=useState(''),[days,setDays]=useState(30);
 const [confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const live=useRef(true),writing=useRef(false);
 const reload=async()=>{
  const [s,o]=await Promise.all([commerce<Settings>(companyId,'settings'),commerce<{orders:CustomerOrder[]}>(companyId,'merchantOrders')]);
  if(!live.current)return;
  setSettings(s);setOrders(o.orders);setStore(s.storeId??'');setProducts(s.productIds);setPrivacy(s.privacyNotice??'');setDays(s.retentionDays??30);setConfirmed(false);
 };
 useEffect(()=>{live.current=true;void reload().catch(e=>{if(live.current)setError(String(e.message??e));});return()=>{live.current=false;};},[companyId,userId]);
 const work=async(action:()=>Promise<void>)=>{
  if(writing.current)return;writing.current=true;setBusy(true);setError('');setNotice('');
  try{await action();await reload();}catch(e){if(live.current)setError(e instanceof Error?e.message:'Could not confirm this action.');}
  finally{writing.current=false;if(live.current)setBusy(false);}
 };
 const publish=(e:FormEvent)=>{e.preventDefault();if(!settings)return;void work(async()=>{
  await commerce(companyId,'publish',{expectedRevision:settings.revision,storeId:store,productIds:products,privacyNotice:privacy,
   retentionDays:days,confirmed,taxOffConfirmed:confirmed});setNotice('Catalogue published. Share the customer link below.');
 });};
 return <section className="shop-card"><h2>Customer catalogue</h2>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  <p>Customers reserve stock for 15 minutes and pay at collection. Online payments are disabled.</p>
  <button disabled={busy} onClick={()=>void work(async()=>{})}>Refresh customer orders</button>
  {settings?.enabled&&<p><a href={`/catalogue/${companyId}`} target="_blank" rel="noreferrer">Open customer catalogue</a></p>}
  <details><summary>Publication and privacy settings</summary><form onSubmit={publish}><fieldset disabled={busy||!settings}>
   <label className="shop-field">Collection store<select required value={store} onChange={e=>setStore(e.target.value)}><option value="">Choose store</option>
    {overview.stores.filter(s=>s.status==='active').map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
   <fieldset><legend>Products visible to customers</legend>{overview.products.filter(p=>p.active).map(p=><label className="shop-field" key={p.id}>
    <input type="checkbox" checked={products.includes(p.id)} onChange={e=>setProducts(ids=>e.target.checked?[...ids,p.id]:ids.filter(id=>id!==p.id))}/>{p.name}</label>)}</fieldset>
   <label className="shop-field">Privacy notice<textarea minLength={20} maxLength={2000} required value={privacy} onChange={e=>setPrivacy(e.target.value)}/></label>
   <label className="shop-field">Contact retention (days)<input type="number" min={7} max={365} required value={days} onChange={e=>setDays(Number(e.target.value))}/></label>
   <label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> I confirm these products and terms may be public, and tax is off for this catalogue.</label>
   <button disabled={!confirmed||!products.length}>Publish catalogue</button>
   {settings?.enabled&&<button type="button" onClick={()=>void work(async()=>{await commerce(companyId,'unpublish',{expectedRevision:settings.revision});})}>Unpublish catalogue</button>}
   <button type="button" onClick={()=>void work(async()=>{await commerce(companyId,'redact');setNotice('Expired contact details removed (up to 100 orders).');})}>Remove expired contact details</button>
  </fieldset></form></details>
  <h3>Customer reservations</h3>{settings&&!orders.length&&<p>No customer orders.</p>}
  {orders.map(order=><CustomerOrderReview key={order.orderId} order={order} busy={busy} companyId={companyId} userId={userId} work={work} notify={setNotice}/>)}
 </section>;
}
function CustomerOrderReview({order:o,busy,companyId,userId,work,notify}:{order:CustomerOrder;busy:boolean;companyId:string;userId:string;
 work:(fn:()=>Promise<void>)=>Promise<void>;notify:(message:string)=>void}) {
 const [paid,setPaid]=useState(false),[note,setNote]=useState('');
 const [method,setMethod]=useState<'cash'|'mobile'|'card'>('mobile'),[reference,setReference]=useState('');
 const next=o.fulfillmentStatus==='unprocessed'?'packed':o.fulfillmentStatus==='packed'?(o.deliveryMethod==='pickup'?'delivered':'dispatched'):o.fulfillmentStatus==='dispatched'?'delivered':o.fulfillmentStatus==='delivered'?'return-requested':null;
 return <article className="shop-card"><h4>{o.customerName??'Contact expired'} · {o.orderId.slice(0,8)}</h4>
  <p>{o.status} · {o.fulfillmentStatus} · {formatMinorAmount(Number(o.totalMinor),o.currency)}</p>
  <p>{o.customerContact}</p><ul>{o.lines.map(l=><li key={l.productId}>{l.quantity} × {l.name}</li>)}</ul>
  {o.status==='reserved'&&<fieldset disabled={busy}><p>Expires {new Date(o.expiresAt).toLocaleString()}</p>
   <label className="shop-field">Received payment method<select value={method} onChange={e=>{setMethod(e.target.value as typeof method);setPaid(false);}}><option value="mobile">Mobile money</option><option value="cash">Cash</option><option value="card">Card</option></select></label>
   {method!=='cash'&&<label className="shop-field">Payment reference<input maxLength={80} value={reference} onChange={e=>setReference(e.target.value)}/></label>}
   <label><input type="checkbox" checked={paid} onChange={e=>setPaid(e.target.checked)}/> I verified receipt of the exact total.</label>
   <button disabled={!paid||(method!=='cash'&&!reference.trim())} onClick={()=>void work(async()=>{
    const sale={commerceOrderId:o.orderId,storeId:o.storeId,submissionKey:`collection_${o.orderId}`,
     lines:o.lines.map(l=>({productId:l.productId,quantity:l.quantity})),tenders:[{method,amountMinor:Number(o.totalMinor),tenderedMinor:Number(o.totalMinor),...(method==='cash'?{}:{reference:reference.trim()})}]};
    const result=await submitSale({companyId,userId},sale,`Customer collection ${o.orderId.slice(0,8)}`,s=>recordShopSale(companyId,s));
    if(result.state==='recorded'||result.state==='already-confirmed'){setPaid(false);notify('POS sale recorded. Receipt is available in Sales.');}
    else if(result.state==='rejected'||result.state==='needs-review') throw new Error(result.error);
    else notify('Sale is not yet confirmed. Review the pending sale in Sell before collecting payment again.');
   })}>Record collection payment in POS</button></fieldset>}
  {o.saleId&&<p>Receipt reference: {o.saleId}. Refunds are processed from Sales.</p>}
  {o.status==='sale-recorded'&&next&&<fieldset disabled={busy}><label className="shop-field">Handling note<input minLength={3} maxLength={300} value={note} onChange={e=>setNote(e.target.value)}/></label>
   <button disabled={note.trim().length<3} onClick={()=>void work(async()=>{await commerce(companyId,'transition',{orderId:o.orderId,kind:next,note});setNote('');})}>Record {next}</button></fieldset>}
 </article>;
}
