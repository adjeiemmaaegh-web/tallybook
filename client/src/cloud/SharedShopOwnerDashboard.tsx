/** Server-authorized owner overview. Rolling time windows are not calendar-day totals.
 * Missing figures stay unavailable; device data is never silently merged with the shared shop.
 */
import {useEffect,useState} from "react";
import { ArrowRight, BarChart3, ClipboardList, Package, RefreshCw, ShoppingCart, Users, Wallet } from "lucide-react";
import type {ShopOverview} from "./shopClient";
import {callShop} from "./shopClient";
import {getShopSupplierBalances,type ShopSupplierBalance} from "./shopPurchasing";
import {formatMinorAmount} from "@/features/inventory/inventory";
interface SalesSummary {
 companyId:string;role:"owner"|"attendant";days:number;currency:string;
 salesCount:number;grossMinor:string;refundMinor:string;netSalesMinor:string;
 customerCreditOutstandingMinor:string|null;
}
type OwnerDestination = "sell" | "stock" | "team" | "reports";
const amount=(value:string|undefined|null,currency:string)=>{
 if(value===undefined||value===null||!/^-?[0-9]+$/.test(value))return "Unavailable";
 const minor=BigInt(value);
 return minor<=BigInt(Number.MAX_SAFE_INTEGER)&&minor>=BigInt(Number.MIN_SAFE_INTEGER)
 ?formatMinorAmount(Number(minor),currency):value+" minor units (too large to format)";
};
export function SharedShopOwnerDashboard({companyId,businessName,overview,online,onNavigate}:{
 companyId:string;businessName:string;overview:ShopOverview;online:boolean;
 onNavigate?:(destination:OwnerDestination)=>void;
}){
 const [oneDay,setOneDay]=useState<SalesSummary|null>(null);
 const [week,setWeek]=useState<SalesSummary|null>(null);
 const [suppliers,setSuppliers]=useState<ShopSupplierBalance[]|null>(null);
 const [error,setError]=useState("");
 const [refreshKey,setRefreshKey]=useState(0);
 useEffect(()=>{
  let live=true;setOneDay(null);setWeek(null);setSuppliers(null);setError("");
  if(!online)return;
  void Promise.allSettled([
   callShop<SalesSummary>("salesSummary",{companyId,days:1},"tallybook_shop_ops"),
   callShop<SalesSummary>("salesSummary",{companyId,days:7},"tallybook_shop_ops"),
   getShopSupplierBalances(companyId)
  ]).then(result=>{
   if(!live)return;
   if(result[0].status==="fulfilled"&&result[0].value.companyId===companyId&&result[0].value.role==="owner")setOneDay(result[0].value);
   if(result[1].status==="fulfilled"&&result[1].value.companyId===companyId&&result[1].value.role==="owner")setWeek(result[1].value);
   if(result[2].status==="fulfilled")setSuppliers(result[2].value.suppliers);
   if(result.some(row=>row.status==="rejected"))setError("Some authorized server reporting sources were unavailable. Missing figures are not estimated.");
  });
  return()=>{live=false;};
 },[companyId,online,refreshKey,overview]);
 const currency=overview.currency??"GHS";
 const noStock=overview.stock.filter(stock=>stock.quantity===0).length;
 const totalStock=overview.stock.reduce((sum,row)=>sum+row.quantity,0);
 const payables=suppliers?.reduce((sum,row)=>sum+BigInt(row.outstandingMinor),0n);
 const supplierAmount=payables!==undefined?amount(payables.toString(),currency):"Unavailable";
 return <section className="tb-shop-home tb-owner-home" aria-label="Shared Shop owner dashboard">
   <div className="tb-shop-home-hero">
     <p className="tb-shop-home-eyebrow">OWNER WORKSPACE · TALLYBOOK BY ALCHEMY</p>
     <h2>Welcome back <span aria-hidden="true">👋</span></h2>
     <p className="tb-shop-home-hero-copy"><strong>{businessName}</strong> — your sales, stock and team together in one place.</p>
     <button type="button" className="tb-shop-home-hero-action" disabled={!onNavigate} onClick={()=>onNavigate?.("sell")}><ShoppingCart aria-hidden="true"/> Open POS <ArrowRight aria-hidden="true"/></button>
   </div>
   <div className="tb-shop-home-section-head">
     <div><p className="tb-shop-home-eyebrow">BUSINESS OVERVIEW</p><h3>Your business at a glance</h3></div>
     <button className="secondary-action" type="button" onClick={()=>setRefreshKey(value=>value+1)} disabled={!online}><RefreshCw aria-hidden="true"/> Refresh</button>
   </div>
   {!online&&<p role="status" className="shop-muted">Offline: live shared sales, credit, and supplier balances are unavailable. Offline POS sales still follow the separate safeguarded outbox.</p>}
   {error&&<p role="status" className="shop-alert">{error}</p>}
   <div className="tb-shop-home-metrics">
     <article className="tb-shop-home-metric tb-shop-home-metric-featured"><BarChart3 aria-hidden="true"/><h4>Net sales — last 24 hours</h4><strong>{amount(oneDay?.netSalesMinor,currency)}</strong><p>{oneDay?.salesCount??"—"} server sales · refunds {amount(oneDay?.refundMinor,currency)}</p></article>
     <article className="tb-shop-home-metric"><Wallet aria-hidden="true"/><h4>Net sales — last 7 days</h4><strong>{amount(week?.netSalesMinor,currency)}</strong><p>Gross before refunds: {amount(week?.grossMinor,currency)}</p></article>
     <article className="tb-shop-home-metric"><Users aria-hidden="true"/><h4>Outstanding customer credit</h4><strong>{amount(week?.customerCreditOutstandingMinor,currency)}</strong><p>As of the latest authorized server read</p></article>
     <article className="tb-shop-home-metric"><Package aria-hidden="true"/><h4>Shop stock</h4><strong>{totalStock.toLocaleString()} units</strong><p>{noStock} stock entries at zero · {overview.products.length} products</p></article>
     <article className="tb-shop-home-metric"><ClipboardList aria-hidden="true"/><h4>Outstanding supplier payables</h4><strong>{supplierAmount}</strong><p>Receipts less recorded supplier payments</p></article>
     <article className="tb-shop-home-metric"><BarChart3 aria-hidden="true"/><h4>Profit and loss / expenses</h4><strong>Not verified</strong><p>No reconciled shared-shop profit ledger is claimed here</p></article>
   </div>
   <div className="tb-shop-home-section-head"><div><p className="tb-shop-home-eyebrow">QUICK ACTIONS</p><h3>Keep your shop moving</h3></div></div>
   <div className="tb-shop-home-actions">
     <button type="button" disabled={!onNavigate} onClick={()=>onNavigate?.("sell")}><ShoppingCart aria-hidden="true"/><span>New sale<small>Open POS</small></span><ArrowRight aria-hidden="true"/></button>
     <button type="button" disabled={!onNavigate} onClick={()=>onNavigate?.("stock")}><Package aria-hidden="true"/><span>Manage stock<small>Products and quantities</small></span><ArrowRight aria-hidden="true"/></button>
     <button type="button" disabled={!onNavigate} onClick={()=>onNavigate?.("reports")}><BarChart3 aria-hidden="true"/><span>Reports<small>Review business performance</small></span><ArrowRight aria-hidden="true"/></button>
     <button type="button" disabled={!onNavigate} onClick={()=>onNavigate?.("team")}><Users aria-hidden="true"/><span>Team & stores<small>Control authorized access</small></span><ArrowRight aria-hidden="true"/></button>
   </div>
   <p className="tb-shop-home-note">Sales figures are rolling 24-hour and 7-day totals, not calendar-day close figures. Only verified server responses are shown. Provider settlements, bank balances, taxes, unrecorded expenses and unsynchronized sales are not included in these figures.</p>
 </section>;
}
