/** Goods receiving for an attendant the owner trusts with stock. Shows what each
 * open order still expects at the attendant's own stores, never what it costs. */
import {useCallback,useEffect,useRef,useState} from "react";
import {confirmAction} from "@/lib/confirmAction";
import {purchaseRetry} from "./purchaseRetry";
import {getShopReceivableOrders,receiveShopPurchase,type ShopReceivableOrder} from "./shopPurchasing";
import type {ShopOverview} from "./shopClient";

interface Props {userId:string;companyId:string;overview:ShopOverview;online:boolean;refresh:()=>Promise<void>}
export function SharedShopReceiveGoods({userId,companyId,overview,online,refresh}:Props){
 const [orders,setOrders]=useState<ShopReceivableOrder[]>([]);
 const [loading,setLoading]=useState(false);
 const [entered,setEntered]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");const [notice,setNotice]=useState("");
 const mounted=useRef(true);
 const load=useCallback(async()=>{
  if(!online)return;
  setLoading(true);
  try{const r=await getShopReceivableOrders(companyId);if(mounted.current){setOrders(r.orders);setError("");}}
  catch(e){if(mounted.current)setError(e instanceof Error?e.message:"Could not load orders.");}
  finally{if(mounted.current)setLoading(false);}
 },[companyId,online]);
 useEffect(()=>{mounted.current=true;setOrders([]);setEntered({});void load();return()=>{mounted.current=false;};},[load]);
 const storeName=(id:string)=>overview.stores.find(s=>s.id===id)?.name??"Store";
 const key=(orderId:string,lineNo:number)=>orderId+":"+lineNo;
 const receive=async(order:ShopReceivableOrder)=>{
  if(busy||!online)return;
  const lines:Array<{lineNo:number;quantity:number}>=[];
  for(const line of order.lines){
   const text=entered[key(order.orderId,line.lineNo)]?.trim();
   if(!text)continue;
   if(!/^[1-9][0-9]*$/.test(text)){setError(`Enter a whole number above zero for ${line.name}.`);return;}
   const quantity=Number(text);
   if(quantity>line.orderedQuantity-line.receivedQuantity){setError(`Only ${line.orderedQuantity-line.receivedQuantity} of ${line.name} are still due.`);return;}
   lines.push({lineNo:line.lineNo,quantity});
  }
  if(!lines.length){setError("Enter how many of at least one item arrived.");return;}
  if(!(await confirmAction(`Confirm these items physically arrived at ${storeName(order.storeId)}? This adds them to the shop's stock.`)))return;
  setBusy(true);setError("");setNotice("");
  try{
   const payload={orderId:order.orderId,lines};
   const retry=await purchaseRetry(userId,companyId,"attendant-goods-receipt",payload,sessionStorage);
   await receiveShopPurchase(companyId,{...payload,receiptId:retry.id});
   retry.confirm();
   if(!mounted.current)return;
   setNotice("Goods received. Stock is updated.");
   setEntered(x=>Object.fromEntries(Object.entries(x).filter(([k])=>!k.startsWith(order.orderId+":"))));
   await load();await refresh();
  }catch(e){if(mounted.current)setError((e instanceof Error?e.message:"Could not save the receipt.")+" If the connection dropped, check the list before entering it again.");}
  finally{if(mounted.current)setBusy(false);}
 };
 return <section className="shop-card space-y-3" aria-label="Receive goods">
  <h2>Receive goods</h2>
  <p className="shop-muted">Orders the owner has placed for your store. Count what actually arrived and enter it; partial deliveries are fine.</p>
  {!online&&<p role="status">Receiving needs an internet connection.</p>}
  {error&&<p role="alert" className="shop-alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {loading&&<p role="status">Loading orders…</p>}
  {!loading&&online&&!orders.length&&<p className="shop-muted">Nothing is waiting to be received.</p>}
  {orders.map(order=><div key={order.orderId} className="rounded border p-3 space-y-2">
   <strong>{order.supplierName}{order.reference?` · ${order.reference}`:""}</strong>
   <p className="shop-muted">{storeName(order.storeId)} · ordered {new Date(order.createdAt).toLocaleDateString()}</p>
   {order.lines.map(line=><label key={line.lineNo} className="shop-field">
    {line.name}: {line.orderedQuantity-line.receivedQuantity} still due ({line.receivedQuantity} of {line.orderedQuantity} received)
    <input inputMode="numeric" placeholder="Arrived now" disabled={busy||!online} value={entered[key(order.orderId,line.lineNo)]??""}
     onChange={e=>setEntered(x=>({...x,[key(order.orderId,line.lineNo)]:e.target.value}))}/></label>)}
   <button type="button" className="primary-action" disabled={busy||!online} onClick={()=>void receive(order)}>Record goods received</button>
  </div>)}
 </section>;
}
