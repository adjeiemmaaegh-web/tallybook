import {useEffect,useRef,useState,type FormEvent} from 'react';
import {commerce,getCatalogue,type PublicCatalogue,type CustomerOrder} from '@/cloud/publicCommerce';
import {purchaseRetry} from '@/cloud/purchaseRetry';
import {getSupabaseClient,isSupabaseConfigured} from '@/lib/supabase';
import {formatMinorAmount} from '@/features/inventory/inventory';
import './sharedShop.css';
const message=(e:unknown)=>e instanceof Error?e.message:'Request could not be confirmed. Refresh your orders before trying again.';
export default function PublicCataloguePage({companyId}:{companyId:string}) {
 const [catalogue,setCatalogue]=useState<PublicCatalogue|null>(null),[orders,setOrders]=useState<CustomerOrder[]>([]);
 const [userId,setUser]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[name,setName]=useState(''),[contact,setContact]=useState('');
 const [quantities,setQuantities]=useState<Record<string,number>>({}),[consent,setConsent]=useState(false);
 const alive=useRef(true),writing=useRef(false),sequence=useRef(0),identity=useRef<string|null>(null);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;sequence.current++;};},[]);
 const refresh=async()=>{
  const seq=++sequence.current;
  const current=()=>alive.current&&seq===sequence.current;
  const client=getSupabaseClient();
  const {data:{user}}=await client.auth.getUser();
  if(!current())return;
  identity.current=user?.id??null;setUser(user?.id??'');
  if(user){const result=await commerce<{orders:CustomerOrder[]}>(companyId,'myOrders');if(current())setOrders(result.orders);}
  else setOrders([]);
  const latest=await getCatalogue(companyId);if(current())setCatalogue(latest);
 };
 useEffect(()=>{
  if(!isSupabaseConfigured){setError('This catalogue is not connected yet.');return;}
  void refresh().catch(e=>{if(alive.current)setError(message(e));});
  const {data:{subscription}}=getSupabaseClient().auth.onAuthStateChange((_event,session)=>{
   if((session?.user.id??null)!==identity.current){setName('');setContact('');setPassword('');setQuantities({});setConsent(false);setNotice('');}
   identity.current=session?.user.id??null;
   sequence.current++;setUser('');setOrders([]);
   // Do not call Auth recursively from its event callback.
   setTimeout(()=>{if(alive.current)void refresh().catch(e=>{if(alive.current)setError(message(e));});},0);
  });
  return()=>subscription.unsubscribe();
 },[companyId]);
 const work=async(action:()=>Promise<void>)=>{
  if(writing.current)return;writing.current=true;setBusy(true);setError('');
  try{await action();}catch(e){if(alive.current)setError(message(e));}
  finally{writing.current=false;if(alive.current)setBusy(false);}
 };
 const reserve=(e:FormEvent)=>{e.preventDefault();if(!catalogue||!userId)return;
  const input={catalogueRevision:catalogue.revision,catalogueDigest:catalogue.digest,privacyAccepted:consent,
   customerName:name.trim(),customerContact:contact.trim(),deliveryMethod:'pickup',
   items:catalogue.items.filter(p=>(quantities[p.id]??0)>0).map(p=>({productId:p.id,quantity:quantities[p.id]}))};
  if(!input.items.length){setError('Choose at least one item.');return;}
  void work(async()=>{
   const retry=await purchaseRetry(userId,companyId,'customer-reservation',input,sessionStorage);
   await commerce(companyId,'reserve',{...input,orderId:retry.id});retry.confirm();
   setQuantities({});setConsent(false);setNotice('Reserved for 15 minutes. Pay at the shop; no online payment was taken.');await refresh();
  });
 };
 const total=catalogue?.items.reduce((sum,p)=>sum+BigInt(p.priceMinor)*BigInt(quantities[p.id]??0),0n)??0n;
 return <main className="shop-page"><header><h1>{catalogue?.name??'Shop catalogue'}</h1><a href="/shop">Merchant workspace</a></header>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  <button disabled={busy||!isSupabaseConfigured} onClick={()=>void work(refresh)}>Refresh catalogue and orders</button>
  {userId&&<button disabled={busy} onClick={()=>void work(async()=>{const {error}=await getSupabaseClient().auth.signOut();if(error)throw error;})}>Sign out</button>}
  {!userId&&<form className="shop-card" onSubmit={e=>{e.preventDefault();void work(async()=>{
   const {error}=await getSupabaseClient().auth.signInWithPassword({email:email.trim(),password});if(error)throw error;setPassword('');await refresh();
  });}}><h2>Sign in to reserve</h2><p>Use your Tallybook account. <a href="/account">Create an account</a>, then return to this catalogue.</p>
   <label className="shop-field">Email<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label>
   <label className="shop-field">Password<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>
   <button disabled={busy||!isSupabaseConfigured}>Sign in</button></form>}
  {catalogue&&<form className="shop-card" onSubmit={reserve}><h2>Reserve for collection</h2>
   <p>No online payment. Reservations last 15 minutes. Tax is off for this catalogue.</p>
   <p>{catalogue.returnPolicy.refundsEnabled?`Returns: up to ${catalogue.returnPolicy.maxAgeDays} days, subject to the shop's recorded policy.`:'Returns are currently disabled by this shop.'}</p>
   <fieldset disabled={busy}><legend>Items</legend>{catalogue.items.map(p=><label className="shop-field" key={p.id}>
    {p.name} · {formatMinorAmount(Number(p.priceMinor),catalogue.currency)}{!p.available?' · Unavailable':''}
    <input aria-label={`Quantity for ${p.name}`} type="number" min="0" max="9999" step="1" disabled={!p.available}
     value={quantities[p.id]??0} onChange={e=>{const n=Number(e.target.value);if(Number.isInteger(n)&&n>=0&&n<=9999)setQuantities(q=>({...q,[p.id]:n}));}}/>
   </label>)}<p>Total: {total<=BigInt(Number.MAX_SAFE_INTEGER)?formatMinorAmount(Number(total),catalogue.currency):'Order too large'}</p>
   <label className="shop-field">Collection name<input required maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></label>
   <label className="shop-field">Contact for this order<input required maxLength={100} value={contact} onChange={e=>setContact(e.target.value)}/></label>
   <p>{catalogue.privacyNotice} Contact details are hidden after {catalogue.retentionDays} days.</p>
   <label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> I accept these prices, return terms and use of my contact details.</label>
   <button className="primary-action" disabled={!userId||!consent||total>100000000000000n}>Reserve items</button></fieldset></form>}
  {userId&&<section className="shop-card"><h2>Your orders</h2>{!orders.length&&<p>No orders for this shop.</p>}{orders.map(o=><article key={o.orderId} className="shop-card">
   <h3>Order {o.orderId.slice(0,8)} · {o.status}</h3><p>{formatMinorAmount(Number(o.totalMinor),o.currency)} · {o.fulfillmentStatus}</p>
   <ul>{o.lines.map(l=><li key={l.productId}>{l.quantity} × {l.name}</li>)}</ul>
   {o.status==='reserved'&&<><p>Expires {new Date(o.expiresAt).toLocaleString()}</p><button disabled={busy} onClick={()=>void work(async()=>{await commerce(companyId,'cancel',{orderId:o.orderId});await refresh();})}>Cancel reservation</button></>}
   {o.saleId&&<p>Receipt reference: {o.saleId}. Refunded: {formatMinorAmount(Number(o.refundedMinor),o.currency)}.</p>}
  </article>)}</section>}
 </main>;
}
