/** Presentation-only reconciliations of data already returned by authorized server APIs.
 * No ledger writes, inferred receipts, rounding of large money or simulated balances.
 */
import {formatMinorAmount} from "@/features/inventory/inventory";
import type {ShopExpense} from "./shopExpenses";
import type {Quotation, QuotationStatus} from "./quotations";

export interface CountPreview {expected:number;counted:number;variance:number;direction:"short"|"over"|"matched"}
export function physicalCountPreview(expected:number,text:string):CountPreview|null {
  const raw=text.trim();
  if (!Number.isSafeInteger(expected)||expected<0||!/^(0|[1-9][0-9]*)$/.test(raw))return null;
  const counted=Number(raw);
  if(!Number.isSafeInteger(counted)||counted>2147483647)return null;
  const variance=counted-expected;
  return {expected,counted,variance,direction:variance<0?"short":variance>0?"over":"matched"};
}
export interface ExpenseSummary {loaded:number;active:number;voided:number;totalMinor:string|null}
export function summarizeExpenses(rows:readonly Pick<ShopExpense,"amountMinor"|"voided">[]):ExpenseSummary {
  let total=0n,active=0,voided=0;
  for(const row of rows){
    if(row.voided){voided++;continue;}
    active++;
    if(!/^(0|[1-9][0-9]*)$/.test(row.amountMinor))return {loaded:rows.length,active,voided,totalMinor:null};
    total+=BigInt(row.amountMinor);
  }
  return {loaded:rows.length,active,voided,totalMinor:total.toString()};
}
/** An amount beyond JS safe integer range is shown as original minor units, never rounded. */
export function formatExactExpenseMinor(raw:string,currency:string):string {
  if(!/^(0|[1-9][0-9]*)$/.test(raw))return "Unavailable — invalid amount";
  const n=BigInt(raw);
  return n<=BigInt(Number.MAX_SAFE_INTEGER)
    ?formatMinorAmount(Number(n),currency)
    :n.toString()+" minor units (too large for formatted display)";
}
export type QuoteFilter="all"|"live"|"closed";
export function filterQuotations(rows:readonly Quotation[],filter:QuoteFilter,search:string):Quotation[] {
  const needle=search.trim().toLocaleLowerCase();
  const closed=new Set<QuotationStatus>(["declined","cancelled","converted","expired"]);
  return rows.filter(row=>
    (filter==="all"||(filter==="closed"?closed.has(row.status):!closed.has(row.status)))&&
    (!needle||[row.customerName,String(row.quoteNo),row.quotationId,row.status].some(v=>v.toLocaleLowerCase().includes(needle)))
  );
}
