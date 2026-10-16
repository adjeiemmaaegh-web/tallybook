/** Run 16 merchant review console; never presents a reservation as a sale. */
import {useCallback,useEffect,useState} from "react";
import {db} from "@/db/TallybookDB";
import {getActiveBusinessProfileId} from "@/features/business/activeCompany";
import {COMMERCE_RELEASE_SCOPE,type CommerceOrder} from "./commerce";
import {reserveRun16Order,cancelRun16Order,expireRun16Order,
 recordRun16Delivery,reservedRun16StockSummary} from "./run16Orders";
import type {StoreLocation} from "@/features/stores/storeDirectory";
export function Run16OrderOperations({companyId}:{companyId:string}){
 const [orders,setOrders]=useState<CommerceOrder[]>([]);
 const [stores,setStores]=useState<StoreLocation[]>([]);
 const [holds,setHolds]=useState(0);
 const [storeByOrder,setStoreByOrder]=useState<Record<string,string>>({});
 const [notes,setNotes]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const refresh=useCallback(async()=>{
   if(companyId!==getActiveBusinessProfileId())throw Error("Business selection changed.");
   const [snapshot,locations]=await Promise.all([
     reservedRun16StockSummary(db),
     db.storeLocations.where("businessProfileId").equals(companyId).toArray()
   ]);
   if(companyId!==getActiveBusinessProfileId())throw Error("Company changed while reviewing local orders.");
   setOrders(snapshot.orders.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));
   setHolds(snapshot.holds.filter(h=>h.status==="active"&&Date.parse(h.expiresAt)>Date.now()).length);
   setStores(locations.filter(x=>x.status==="active"));
 },[companyId]);
 useEffect(()=>{setOrders([]);setStores([]);setHolds(0);setError("");void refresh().catch(e=>setError(e instanceof Error?e.message:"Could not read local orders."));},[refresh]);
 const perform=async(work:()=>Promise<unknown>)=>{
   if(busy)return;setBusy(true);setError("");
   try{await work();await refresh();}catch(e){setError(e instanceof Error?e.message:"Order operation failed.");}
   finally{setBusy(false);}
 };
 return <section className="rounded border p-4 space-y-3" aria-label="Run 16 order reservations and delivery review">
   <h2 className="text-lg font-semibold">Order reservation and delivery management</h2>
   <p className="text-sm">Saved device-local evidence only. Reservations do not charge customers. Packing, dispatch, delivery and return requests require an original saved POS sale. Online publishing and automated payments remain disabled.</p>
   <p role="status" className="text-sm">Active product holds: {holds}. Stock reservation and fulfillment activation: <strong>{COMMERCE_RELEASE_SCOPE.reserveStock&&COMMERCE_RELEASE_SCOPE.fulfillOrders?"Available":"Disabled pending release acceptance"}</strong>.</p>
   {error?<p role="alert" className="rounded border p-2 text-sm">{error}</p>:null}
   <button type="button" className="rounded border p-2" disabled={busy} onClick={()=>void perform(refresh)}>Refresh local order states</button>
   {orders.map(order=><article className="rounded border p-3 space-y-2" key={order.id}>
     <p className="font-semibold">{order.customerName} · {order.status}</p>
     <p className="text-sm">Order {order.id} · {order.totalMinor} price minor units · {order.deliveryMethod??"pickup"} · {order.lines.map(x=>x.name+" × "+x.quantity).join(", ")}</p>
     <p className="text-sm">POS sale: {order.saleId??"Not recorded"}. {order.reservationExpiresAt?"Hold expires "+new Date(order.reservationExpiresAt).toLocaleString():"No active hold timestamp"}</p>
     {!order.saleId?<p className="text-xs">To complete the order, record the exact reserved cart through Sales → Reserved customer order. The company POS—not this page—creates a receipt and reduces stock.</p>:null}
     <label className="block text-sm">Store for physical hold
       <select className="block w-full rounded border p-2" value={storeByOrder[order.id]??""}
         onChange={e=>setStoreByOrder(v=>({...v,[order.id]:e.target.value}))}>
         <option value="">Unscoped company stock (only before multi-store activation)</option>
         {stores.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}
       </select>
     </label>
     <label className="block text-sm">Action note (required for logistics / cancellation)
       <textarea className="block w-full rounded border p-2" rows={2} maxLength={500}
        placeholder="Record only factual dispatch, delivery, or customer request details."
        value={notes[order.id]??""} onChange={e=>setNotes(v=>({...v,[order.id]:e.target.value}))}/>
     </label>
     <div className="flex flex-wrap gap-2">
       {["draft","prepared","ready"].includes(order.status)?<button className="rounded border p-2"
         type="button" disabled={busy||!COMMERCE_RELEASE_SCOPE.reserveStock}
         onClick={()=>void perform(()=>reserveRun16Order(order.id,storeByOrder[order.id]||undefined,60,crypto.randomUUID(),db))}>
         Reserve for 60 minutes (release gated)</button>:null}
       {(["draft","prepared","ready","reserved","packed"].includes(order.status)&&!order.saleId)?
         <button className="rounded border p-2" type="button" disabled={busy||!(notes[order.id]?.trim())}
           onClick={()=>void perform(()=>cancelRun16Order(order.id,crypto.randomUUID(),notes[order.id],db))}>Cancel unpaid request / release holds</button>:null}
       {["reserved","packed"].includes(order.status)&&!order.saleId?
         <button type="button" className="rounded border p-2" disabled={busy||!COMMERCE_RELEASE_SCOPE.reserveStock}
           onClick={()=>void perform(()=>expireRun16Order(order.id,db))}>Release only if expired</button>:null}
       {([
         ["reserved","pack","Record packing"],
         ["packed","dispatch","Confirm physical dispatch"],
         ["dispatched","deliver","Confirm physical delivery"],
         ["delivered","requestReturn","Record return request (no refund)"],
       ] as const).filter(([status])=>order.status===status).map(([,action,label])=>
         <button key={action} type="button" className="rounded border p-2"
           disabled={busy||!COMMERCE_RELEASE_SCOPE.fulfillOrders||!order.saleId||!notes[order.id]?.trim()}
           onClick={()=>void perform(()=>recordRun16Delivery(order.id,action,crypto.randomUUID(),notes[order.id],db))}>
           {label} (release gated)</button>)}
     </div>
   </article>)}
 </section>;
}
