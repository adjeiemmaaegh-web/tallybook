/** Server-authorized owner overview: all sales/refunds use the backend's
 * trailing-N-day definition. Cash/card/MoMo settlement and profit remain unverified.
 */
import {useEffect,useState} from "react";
import type {ShopOverview} from "./shopClient";
import {callShop} from "./shopClient";
import {getShopSupplierBalances,type ShopSupplierBalance} from "./shopPurchasing";
import {formatMinorAmount} from "@/features/inventory/inventory";
interface SalesSummary {
 companyId:string;role:"owner"|"attendant";days:number;currency:string;
 salesCount:number;grossMinor:string;refundMinor:string;netSalesMinor:string;
 customerCreditOutstandingMinor:string|null;
}
const amount=(text:string|undefined|null,currency:string)=>{
 if(text===undefined||text===null||!/^-?[0-9]+$/.test(text))return "Unavailable";
 const value=BigInt(text);
 return value<=BigInt(Number.MAX_SAFE_INTEGER)&&value>=BigInt(Number.MIN_SAFE_INTEGER)
 ?formatMinorAmount(Number(value),currency):text+" minor units (too large to format)";
};
export function SharedShopOwnerDashboard({companyId,overview,online}:{companyId:string;overview:ShopOverview;online:boolean}){
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
 return <section className="shop-card space-y-3" aria-label="Shared Shop owner dashboard">
   <h2>Owner dashboard — server-recorded facts</h2>
   <p className="shop-muted">All stores in this company. Sales windows are rolling 24 hours and 7 days, not a Ghana-calendar-day close. Only server responses are shown; cached figures are never presented as current.</p>
   {!online&&<p role="status">Offline: live shared sales, credit, and supplier balances are unavailable. Offline POS sales still follow the separate safeguarded outbox.</p>}
   {error&&<p role="status">{error}</p>}
   <button className="secondary-action" type="button" onClick={()=>setRefreshKey(n=>n+1)} disabled={!online}>Refresh financial facts</button>
   <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    <article className="rounded border p-3"><h3>Net sales — last 24 hours</h3><strong>{amount(oneDay?.netSalesMinor,currency)}</strong><p>{oneDay?.salesCount??"—"} server sales; recorded refunds {amount(oneDay?.refundMinor,currency)}</p></article>
    <article className="rounded border p-3"><h3>Net sales — last 7 days</h3><strong>{amount(week?.netSalesMinor,currency)}</strong><p>Gross before refunds: {amount(week?.grossMinor,currency)}</p></article>
    <article className="rounded border p-3"><h3>Outstanding customer credit</h3><strong>{amount(week?.customerCreditOutstandingMinor,currency)}</strong><p>As of latest authorized server read, not collections received.</p></article>
    <article className="rounded border p-3"><h3>Shop stock</h3><strong>{totalStock.toLocaleString()} units</strong><p>{noStock} store-product entries at zero · {overview.products.length} products · {overview.stores.length} stores.</p></article>
    <article className="rounded border p-3"><h3>Outstanding supplier payables</h3><strong>{supplierAmount}</strong><p>Recognized goods receipts less manually attested supplier payments.</p></article>
    <article className="rounded border p-3"><h3>Profit and loss / expenses</h3><strong>Not verified</strong><p>Shared Shop does not yet have a reconciled operating-expense and FIFO-COGS profit ledger. Do not equate sales with profit.</p></article>
   </div>
   <p className="shop-muted">Provider settlement, bank balances, tax filings, sales not yet synchronized, and unrecorded operating expenses are not included in these server figures.</p>
 </section>;
}
