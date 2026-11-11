/** Role-specific home, populated exclusively with the server-scoped attendant overview. */
import { ArrowRight, ClipboardList, Package, ReceiptText, ShoppingCart, Store } from "lucide-react";
import type { ShopOverview } from "./shopClient";

type AttendantDestination = "sell" | "sales" | "reports";
export function SharedShopAttendantHome({shopName,overview,userId,onNavigate}:{
 shopName:string;overview:ShopOverview;userId:string;
 onNavigate:(destination:AttendantDestination)=>void;
}){
 const member=overview.members.find(row=>row.userId===userId&&row.role==="attendant");
 const assigned=overview.stores.filter(store=>store.status==="active"&&member?.storeIds.includes(store.id));
 const canSell=assigned.length>0;
 const listedProducts=overview.products.filter(product=>product.active).length;
 return <section className="tb-shop-home tb-attendant-home" aria-label="Attendant home">
   <div className="tb-shop-home-hero">
     <p className="tb-shop-home-eyebrow">ATTENDANT WORKSPACE</p>
     <h2>Welcome back <span aria-hidden="true">👋</span></h2>
     <p className="tb-shop-home-hero-copy">You are working with <strong>{shopName}</strong>. Everything you need for your shift, in one place.</p>
     <button className="tb-shop-home-hero-action" type="button" onClick={()=>onNavigate("sell")} disabled={!canSell}><ShoppingCart aria-hidden="true"/> Start selling <ArrowRight aria-hidden="true"/></button>
   </div>
   <div className="tb-shop-home-section-head"><div><p className="tb-shop-home-eyebrow">YOUR WORKSPACE</p><h3>Ready for your shift</h3></div></div>
   <div className="tb-shop-home-metrics">
     <article className="tb-shop-home-metric"><Store aria-hidden="true"/><h4>Assigned stores</h4><strong>{assigned.length}</strong><p>{assigned.length?assigned.map(store=>store.name).join(", "):"Ask the owner to assign a store before selling."}</p></article>
     <article className="tb-shop-home-metric"><Package aria-hidden="true"/><h4>Listed products</h4><strong>{listedProducts}</strong><p>Visible in your authorized shop overview; stock can vary by store.</p></article>
   </div>
   <div className="tb-shop-home-section-head"><div><p className="tb-shop-home-eyebrow">QUICK ACTIONS</p><h3>What would you like to do?</h3></div></div>
   <div className="tb-shop-home-actions">
     <button type="button" disabled={!canSell} onClick={()=>onNavigate("sell")}><ShoppingCart aria-hidden="true"/><span>Sell products<small>Open your assigned till</small></span><ArrowRight aria-hidden="true"/></button>
     <button type="button" onClick={()=>onNavigate("sales")}><ReceiptText aria-hidden="true"/><span>My sales<small>Review your transactions</small></span><ArrowRight aria-hidden="true"/></button>
     <button type="button" onClick={()=>onNavigate("reports")}><ClipboardList aria-hidden="true"/><span>My day<small>View your authorized daily report</small></span><ArrowRight aria-hidden="true"/></button>
   </div>
   <p className="tb-shop-home-note">Your employer controls your store access and permissions. Business-wide finances, costs and team management remain owner-only.</p>
 </section>;
}
