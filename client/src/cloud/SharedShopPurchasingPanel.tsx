/** Stage 8: owner-only shared purchasing UI, backed entirely by the server.
 * No optimistic stock mutation and no assumed external supplier disbursement.
 */
import {useCallback,useEffect,useRef,useState} from "react";
import { confirmAction } from "@/lib/confirmAction";
import {purchaseRetry} from "./purchaseRetry";
import type {ShopOverview} from "./shopClient";
import {tracksStock} from "./productTracking";
import type {PurchaseDraft} from "./shopAssistant";
import {currencyMinorDivisor,formatMinorAmount,parseAmountToMinor} from "@/features/inventory/inventory";
import {
 getShopSupplierBalances,listShopPurchaseOrders,getShopPurchaseDetails,saveShopSupplier,archiveShopSupplier,
 createShopPurchaseOrder,receiveShopPurchase,closeShopPurchase,settleShopSupplier,
 type ShopSupplierBalance,type ShopPurchaseSummary,type ShopPurchaseDetail,type SupplierPaymentMethod
} from "./shopPurchasing";

interface Props {userId:string;companyId:string;overview:ShopOverview;online:boolean;refresh:()=>Promise<void>;draft?:PurchaseDraft|null;onDraftUsed?:()=>void}
type OrderLine={productId:string;quantity:string;unitCost:string};
type Pending={kind:string;fingerprint:string};
const newLine=():OrderLine=>({productId:"",quantity:"1",unitCost:""});
const integer=(raw:string,max=100000)=> {
 if(!/^[1-9][0-9]*$/.test(raw.trim()))throw Error("Enter a positive whole number of units.");
 const value=Number(raw);if(!Number.isSafeInteger(value)||value>max)throw Error("Quantity exceeds the allowed limit.");
 return value;
};
function displayMinor(raw:string,currency:string) {
 if(!/^-?[0-9]+$/.test(raw))return "Unverified amount";
 const amount=BigInt(raw);
 return amount>=-BigInt(Number.MAX_SAFE_INTEGER)&&amount<=BigInt(Number.MAX_SAFE_INTEGER)
  ?formatMinorAmount(Number(amount),currency):raw+" minor units (outside display precision)";
}
export function SharedShopPurchasingPanel({userId,companyId,overview,online,refresh,draft,onDraftUsed}:Props){
 const currency=overview.currency??"GHS";
 const [suppliers,setSuppliers]=useState<ShopSupplierBalance[]>([]);
 const [orders,setOrders]=useState<ShopPurchaseSummary[]>([]);
 const [details,setDetails]=useState<ShopPurchaseDetail|null>(null);
 const [selectedOrder,setSelectedOrder]=useState("");
 const [loading,setLoading]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [supplierName,setSupplierName]=useState("");
 const [supplierId,setSupplierId]=useState("");
 const [storeId,setStoreId]=useState("");
 const [reference,setReference]=useState("");
 const [lines,setLines]=useState<OrderLine[]>([newLine()]);
 const [received,setReceived]=useState<Record<number,string>>({});
 const [supplierPayment,setSupplierPayment]=useState("");
 const [payMethod,setPayMethod]=useState<SupplierPaymentMethod>("cash");
 const [payReference,setPayReference]=useState("");
 const [paymentAttested,setPaymentAttested]=useState(false);
 const [closingReason,setClosingReason]=useState("");
 const operation=useRef<Pending|null>(null);
 const mounted=useRef(true);
 const load=useCallback(async()=>{
   if(!online)return;
   setLoading(true);
   try {
     const [balances,listed]=await Promise.all([getShopSupplierBalances(companyId),listShopPurchaseOrders(companyId)]);
     if(!mounted.current)return;
     setSuppliers(balances.suppliers);setOrders(listed.orders);setError("");
   }catch(e){if(mounted.current)setError(e instanceof Error?e.message:"Purchasing records unavailable.");}
   finally{if(mounted.current)setLoading(false);}
 },[companyId,online]);
 useEffect(()=>{
  mounted.current=true;operation.current=null;setSuppliers([]);setOrders([]);setDetails(null);
  setSelectedOrder("");setSupplierId("");setStoreId("");setLines([newLine()]);
  if(online)void load();
  return()=>{mounted.current=false;};
 },[companyId,load,online]);
 // A draft from Ask only fills in the form. The owner still picks the supplier, adds costs and posts it.
 useEffect(()=>{
  if(!draft)return;
  const divisor=currencyMinorDivisor(currency);
  setStoreId(draft.storeId);
  setLines(draft.lines.map(l=>{
   const cost=overview.products.find(p=>p.id===l.productId)?.costMinor;
   return {productId:l.productId,quantity:String(l.quantity),unitCost:cost==null?"":(cost/divisor).toFixed(divisor===1?0:2)};
  }));
  setNotice(`Draft from Ask for ${draft.storeName}: choose a supplier, check the amounts and costs, then create the order. Nothing is ordered yet.`);
  onDraftUsed?.();
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[draft]);
 useEffect(()=>{
  let live=true;setDetails(null);setReceived({});
  if(online&&selectedOrder)void getShopPurchaseDetails(companyId,selectedOrder)
   .then(value=>{if(live)setDetails(value);}).catch(e=>{if(live)setError(e instanceof Error?e.message:"Order detail unavailable.");});
  return()=>{live=false;};
 },[companyId,online,selectedOrder,notice]);
 const safeAction=async(kind:string,payload:unknown,work:(id:string)=>Promise<unknown>,after?:()=>void)=>{
  if(!online||busy){setError("Connect to the internet before altering Shared Shop stock or financial records.");return;}
  const fingerprint=JSON.stringify(payload);
  const previous=operation.current;
  if(previous&&(previous.kind!==kind||previous.fingerprint!==fingerprint)){
    setError("An earlier request may still be unresolved. Reload the order and reconcile its saved server status before beginning a different operation.");
    return;
  }
  if(!previous)operation.current={kind,fingerprint};
  setBusy(true);setError("");setNotice("");
  try{
    const retry=await purchaseRetry(userId,companyId,kind,payload,sessionStorage);
    const result=await work(retry.id);
    retry.confirm();
    operation.current=null;
    if(!mounted.current)return;
    setNotice(kind+" saved on Shared Shop. "+((result as {replayed?:boolean})?.replayed?"Existing operation confirmed.":""));
    after?.();await load();await refresh();
  }catch(e){if(mounted.current)setError((e instanceof Error?e.message:"Operation failed.")+
    " If the response was interrupted, DO NOT create a new request with changed details; retry the same operation or inspect the server history.");}
  finally{if(mounted.current)setBusy(false);}
 };
 const selectedSupplier=suppliers.find(s=>s.supplierId===supplierId);
 // Goods the shop counts; services and uncounted items have nothing to order or receive.
 const products=overview.products.filter(p=>p.active&&tracksStock(p));
 const stores=overview.stores.filter(s=>s.status==="active");
 const uniqueLines=lines.every(l=>l.productId)&&new Set(lines.map(l=>l.productId)).size===lines.length;
 const updateLine=(index:number,change:Partial<OrderLine>)=>setLines(rows=>rows.map((row,i)=>i===index?{...row,...change}:row));
 const create=()=>{
  if(!supplierId||!storeId||!uniqueLines){setError("Choose an active supplier, store and distinct products.");return;}
  try{
   const payload={storeId,supplierId,reference:reference.trim(),lines:lines.map(l=>({
      productId:l.productId,quantity:integer(l.quantity),unitCostMinor:parseAmountToMinor(l.unitCost,currency)
   }))};
   if(payload.lines.some(l=>l.unitCostMinor<0))throw Error("Cost cannot be negative.");
   void safeAction("Purchase order",payload,id=>createShopPurchaseOrder(companyId,{...payload,orderId:id}),
    ()=>{setLines([newLine()]);setReference("");});
  }catch(e){setError(e instanceof Error?e.message:"Invalid order.");}
 };
 const receive=async()=>{
  if(!details||details.closed)return;
  try{
   const lineItems=details.lines.filter(line=>received[line.lineNo]?.trim()).map(line=>({
    lineNo:line.lineNo,quantity:integer(received[line.lineNo])
   }));
   if(!lineItems.length||lineItems.some(line=>{
      const original=details.lines.find(o=>o.lineNo===line.lineNo)!;
      return line.quantity>original.orderedQuantity-original.receivedQuantity;
   }))throw Error("Receive only outstanding quantities on this order.");
   const payload={orderId:details.orderId,lines:lineItems};
   if(!(await confirmAction("Confirm these items were physically received at the correct store? This posts stock and creates supplier liability.")))return;
   void safeAction("Goods receipt",payload,id=>receiveShopPurchase(companyId,{...payload,receiptId:id}),()=>setReceived({}));
  }catch(e){setError(e instanceof Error?e.message:"Invalid goods receipt.");}
 };
 const settlement=async()=>{
  if(!selectedSupplier||!paymentAttested)return;
  try{
   const amountMinor=parseAmountToMinor(supplierPayment,currency);
   if(amountMinor<=0||BigInt(amountMinor)>BigInt(selectedSupplier.outstandingMinor))
     throw Error("Supplier payment must be positive and not exceed recorded outstanding receipts.");
   const payload={supplierId,amountMinor,method:payMethod,reference:payReference.trim(),externalSettlementConfirmed:true as const};
   if(!(await confirmAction("Confirm this supplier payment was ALREADY completed outside Tallybook? This action only records an attestation; it does not send money.")))return;
   void safeAction("Supplier settlement",payload,id=>settleShopSupplier(companyId,{...payload,settlementId:id}),
     ()=>{setSupplierPayment("");setPaymentAttested(false);setPayReference("");});
  }catch(e){setError(e instanceof Error?e.message:"Invalid supplier payment.");}
 };
 return <div className="shop-grid" aria-label="Shared Shop purchasing and goods receiving">
  <section className="shop-card space-y-3">
   <h2>Purchasing & suppliers</h2>
   <p className="shop-muted">Owner-only server ledger. Purchases change stock only when goods are received; supplier payments are manual confirmations of outside payments.</p>
   {!online&&<p role="alert" className="shop-alert">Shared Shop purchasing is unavailable offline. No order, stock movement or payment is queued from this screen.</p>}
   {error&&<p role="alert" className="shop-alert">{error}</p>}
   {notice&&<p role="status">{notice}</p>}
   {loading&&<p role="status">Reading authorized purchase records…</p>}
   <div className="shop-edit"><label className="shop-field">New supplier name
    <input value={supplierName} onChange={e=>setSupplierName(e.target.value)} maxLength={120}/></label>
    <button className="secondary-action" type="button" disabled={!online||busy||!supplierName.trim()}
      onClick={()=>void safeAction("Supplier",{name:supplierName.trim()},id=>saveShopSupplier(companyId,supplierName.trim(),id),()=>setSupplierName(""))}>Save supplier</button>
   </div>
   <h3>Supplier balances</h3>
   <div className="space-y-2">{suppliers.length?suppliers.map(s=><div key={s.supplierId} className="rounded border p-3 text-sm">
    <strong>{s.name}{s.archived?" (archived)":""}</strong>
    <p>Received goods: {displayMinor(s.receivedMinor,currency)} · Manually settled: {displayMinor(s.settledMinor,currency)}</p>
    <p>Unpaid supplier balance: <strong>{displayMinor(s.outstandingMinor,currency)}</strong></p>
    {!s.archived&&<>
     <button className="secondary-action" type="button" disabled={!online||busy||BigInt(s.outstandingMinor)>0n}
      onClick={async()=>{if(await confirmAction(`Archive ${s.name}? It will no longer be offered on new purchase orders. Past orders, receipts and payments stay on record.`,{danger:true,confirmLabel:"Archive"}))
       void safeAction("Archive supplier",{supplierId:s.supplierId},()=>archiveShopSupplier(companyId,s.supplierId));}}>Archive supplier</button>
     {BigInt(s.outstandingMinor)>0n&&<p className="shop-muted">Record the supplier payment first. A supplier you still owe can't be archived.</p>}
    </>}
   </div>):<p>No suppliers in this shop.</p>}</div>
  </section>
  <section className="shop-card space-y-3">
   <h2>Create purchase order</h2>
   <label className="shop-field">Supplier<select value={supplierId} onChange={e=>{setSupplierId(e.target.value);setPaymentAttested(false);}} disabled={busy}><option value="">Choose supplier</option>{suppliers.filter(s=>!s.archived).map(s=><option key={s.supplierId} value={s.supplierId}>{s.name}</option>)}</select></label>
   <label className="shop-field">Receiving store<select value={storeId} onChange={e=>setStoreId(e.target.value)} disabled={busy}><option value="">Choose store</option>{stores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
   <label className="shop-field">Supplier invoice / order reference (optional)<input value={reference} onChange={e=>setReference(e.target.value)} maxLength={100}/></label>
   {lines.map((line,index)=><div key={index} className="rounded border p-3 space-y-2">
    <label className="shop-field">Item {index+1}<select value={line.productId} onChange={e=>updateLine(index,{productId:e.target.value})}><option value="">Choose product</option>{products.map(product=><option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
    <label className="shop-field">Ordered units<input inputMode="numeric" value={line.quantity} onChange={e=>updateLine(index,{quantity:e.target.value})}/></label>
    <label className="shop-field">Agreed unit cost ({currency})<input inputMode="decimal" value={line.unitCost} onChange={e=>updateLine(index,{unitCost:e.target.value})}/></label>
    {lines.length>1&&<button className="secondary-action" type="button" onClick={()=>setLines(rows=>rows.filter((_,i)=>i!==index))}>Remove line</button>}
   </div>)}
   <button type="button" className="secondary-action" disabled={lines.length>=100} onClick={()=>setLines(rows=>[...rows,newLine()])}>Add order line</button>
   <button className="primary-action" type="button" disabled={!online||busy} onClick={create}>{busy?"Saving…":"Create order (no stock added yet)"}</button>
  </section>
  <section className="shop-card space-y-3">
   <h2>Receive ordered goods</h2>
   <label className="shop-field">Purchase order<select value={selectedOrder} onChange={e=>setSelectedOrder(e.target.value)} disabled={!online||busy}><option value="">Choose saved order</option>{orders.map(o=><option key={o.orderId} value={o.orderId}>{suppliers.find(s=>s.supplierId===o.supplierId)?.name??"Supplier"} · {o.reference??o.orderId.slice(0,8)}{o.closed?" (closed)":""}</option>)}</select></label>
   {details&&<div className="space-y-3">
    <p>Received value so far: {displayMinor(details.receivedMinor,currency)}. {details.closed?"Order closed.":"Partial receipts allowed."}</p>
    {details.lines.map(line=><label className="shop-field" key={line.lineNo}>
      {products.find(p=>p.id===line.productId)?.name??"Product"}: {line.receivedQuantity} received / {line.orderedQuantity} ordered; {displayMinor(String(line.unitCostMinor),currency)} per unit
      <input inputMode="numeric" disabled={details.closed||busy} placeholder="Units physically received now" value={received[line.lineNo]??""} onChange={e=>setReceived(x=>({...x,[line.lineNo]:e.target.value}))}/>
    </label>)}
    {!details.closed&&<><button type="button" className="primary-action" disabled={!online||busy} onClick={receive}>Record physical goods receipt</button>
     <label className="shop-field">Reason for closing outstanding quantities<input value={closingReason} onChange={e=>setClosingReason(e.target.value)} maxLength={200}/></label>
     <button type="button" className="secondary-action" disabled={!online||busy||closingReason.trim().length<4}
       onClick={async()=>{if(await confirmAction("Close remaining order quantities permanently?",{danger:true}))void safeAction("Close purchase order",{orderId:details.orderId,reason:closingReason.trim()},()=>closeShopPurchase(companyId,details.orderId,closingReason.trim()),()=>setClosingReason(""));}}>Close unreceived balance</button>
    </>}
   </div>}
  </section>
  <section className="shop-card space-y-3">
   <h2>Record an already-paid supplier settlement</h2>
   <p className="shop-muted">No payment is sent from this app. Cash/bank/provider confirmation must happen outside Tallybook first.</p>
   <label className="shop-field">Supplier<select value={supplierId} onChange={e=>{setSupplierId(e.target.value);setPaymentAttested(false);}}><option value="">Choose supplier</option>{suppliers.map(s=><option key={s.supplierId} value={s.supplierId}>{s.name}</option>)}</select></label>
   <p>Outstanding: {selectedSupplier?displayMinor(selectedSupplier.outstandingMinor,currency):"Choose supplier"}</p>
   <label className="shop-field">Amount already paid ({currency})<input inputMode="decimal" value={supplierPayment} onChange={e=>{setSupplierPayment(e.target.value);setPaymentAttested(false);}}/></label>
   <label className="shop-field">Payment method<select value={payMethod} onChange={e=>{setPayMethod(e.target.value as SupplierPaymentMethod);setPaymentAttested(false);}}><option value="cash">Cash</option><option value="mobile">Mobile Money</option><option value="card">Card</option><option value="bank">Bank transfer</option></select></label>
   <label className="shop-field">External payment reference (recommended)<input value={payReference} onChange={e=>{setPayReference(e.target.value);setPaymentAttested(false);}} maxLength={120}/></label>
   <label className="shop-check"><input type="checkbox" checked={paymentAttested} onChange={e=>setPaymentAttested(e.target.checked)}/>I confirm money has already been paid outside this app; this is only a ledger record.</label>
   <button type="button" className="primary-action" disabled={!online||busy||!paymentAttested||!selectedSupplier} onClick={settlement}>Record outside supplier payment</button>
  </section>
 </div>;
}
