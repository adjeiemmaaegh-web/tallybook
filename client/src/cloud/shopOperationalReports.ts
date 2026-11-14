/** Read-only operational summaries, computed exclusively from authorized server responses.
 * Do not invent missing costs, move stock, pay suppliers or imply an entire ledger was exported.
 */
import type {ShopReceipt} from "./shopClient";
import type {ShopSupplierBalance} from "./shopPurchasing";

export type TransferStatus = "requested" | "in_transit" | "received" | "cancelled";
export interface TransferSummary {
 total:number;requested:number;inTransit:number;received:number;cancelled:number;unitsReceived:number;
}
export function summarizeTransfers(rows:readonly {status:TransferStatus;quantity:number}[]):TransferSummary {
 const out:TransferSummary={total:rows.length,requested:0,inTransit:0,received:0,cancelled:0,unitsReceived:0};
 for(const row of rows){
  if(row.status==="requested")out.requested++;
  else if(row.status==="in_transit")out.inTransit++;
  else if(row.status==="received"){
   out.received++;
   if(Number.isSafeInteger(row.quantity)&&row.quantity>0)out.unitsReceived+=row.quantity;
  }else if(row.status==="cancelled")out.cancelled++;
 }
 return out;
}
export interface SupplierSummary {suppliers:number;owing:number;outstandingMinor:string|null}
export function summarizeSuppliers(rows:readonly ShopSupplierBalance[]):SupplierSummary {
 let total=0n,owing=0;
 for(const row of rows){
  if(!/^(0|[1-9][0-9]*)$/.test(row.outstandingMinor))return {suppliers:rows.length,owing:0,outstandingMinor:null};
  const due=BigInt(row.outstandingMinor);
  if(due>0n)owing++;
  total+=due;
 }
 return {suppliers:rows.length,owing,outstandingMinor:total.toString()};
}

/** Spreadsheet applications interpret cells beginning with =, +, -, @ and control whitespace as formulas.
 * Prefix potentially attacker-controlled *text* with an apostrophe and quote every cell.
 * Numbers are generated from validated server money values, never from arbitrary strings.
 */
export function safeCsvText(value:unknown):string {
 const raw=String(value??"").replace(/\u0000/g,"");
 const safe=/^[\s\uFEFF]*[=+\-@]/.test(raw)||/^[\t\r\n]/.test(raw)?"'"+raw:raw;
 return '"'+safe.replace(/"/g,'""')+'"';
}
const safeMoney=(minor:number):string=>Number.isSafeInteger(minor)?String(minor):"Unavailable";
/** A downloaded report includes ONLY currently loaded, authorized receipts (up to pagination). */
export function exportLoadedSalesCsv(receipts:readonly ShopReceipt[]):string {
 const heading=["Receipt #","Server posted at","Store","Cashier ID","Customer","Payment method",
   "Gross minor units","Refunded minor units","Net minor units","Currency","Sale ID"];
 const data=receipts.map(sale=>[
  safeCsvText(String(sale.receiptNumber)),safeCsvText(sale.recordedAt),safeCsvText(sale.storeName),
  safeCsvText(sale.cashierId),safeCsvText(sale.customer?.name??""),safeCsvText(sale.payment.method),
  safeCsvText(safeMoney(sale.totalMinor)),safeCsvText(safeMoney(sale.refundedMinor)),
  safeCsvText(safeMoney(sale.totalMinor-sale.refundedMinor)),safeCsvText(sale.currency),safeCsvText(sale.saleId)
 ].join(","));
 return [heading.map(safeCsvText).join(","),...data].join("\r\n")+"\r\n";
}
