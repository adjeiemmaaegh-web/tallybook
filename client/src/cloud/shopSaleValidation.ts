/** Local shared-shop financial input and receipt validation.
 * Adapted from the Stage B draft without replacing the newer encrypted outbox.
 * This is defense-in-depth; the authoritative shop RPC still prices sales.
 */
import type { SaleRequest, ShopReceipt } from "./shopClient";
import type { OutboxScope } from "./outboxCore";

const record=(v:unknown): v is Record<string,unknown> =>
  v!==null&&typeof v==="object"&&!Array.isArray(v);
const id=(v:unknown):v is string=>typeof v==="string"&&v.length>0&&v.length<=256;
const money=(v:unknown):v is number=>
  typeof v==="number"&&Number.isSafeInteger(v)&&v>=0&&v<=1_000_000_000_000;

export function validShopSaleRequest(input:unknown):input is SaleRequest{
  if(!record(input))return false;
  const s=input;
  if(typeof s.submissionKey!=="string"||
      !/^[A-Za-z0-9_-]{16,64}$/.test(s.submissionKey)||
      !id(s.storeId)||!Array.isArray(s.lines)||s.lines.length<1||s.lines.length>100)
    return false;
  if(!s.lines.every((item:unknown)=>{
    if(!record(item))return false;
    return id(item.productId)&&typeof item.quantity==="number"&&
      Number.isSafeInteger(item.quantity)&&item.quantity>=1&&item.quantity<=100_000;
  }))return false;
  if(s.clientRecordedAt!==undefined&&
    (typeof s.clientRecordedAt!=="string"||!Number.isFinite(Date.parse(s.clientRecordedAt))))
    return false;
  if(s.tenders!==undefined){
    if(!Array.isArray(s.tenders)||s.tenders.length<1||s.tenders.length>5||
      s.paymentMethod!==undefined||s.amountTenderedMinor!==undefined||
      !s.tenders.every((item:unknown)=>{
        if(!record(item))return false;
        return ["cash","mobile","card","credit"].includes(String(item.method))&&
          money(item.amountMinor)&&
          (item.tenderedMinor===undefined||money(item.tenderedMinor))&&
          (item.reference===undefined||typeof item.reference==="string")&&
          (item.customerId===undefined||id(item.customerId));
      }))return false;
    return (s.discountMinor===undefined||money(s.discountMinor))&&
      (s.discountReason===undefined||typeof s.discountReason==="string");
  }
  return ["cash","mobile","card"].includes(String(s.paymentMethod))&&
    money(s.amountTenderedMinor)&&
    (s.paymentReference===undefined||typeof s.paymentReference==="string")&&
    s.discountMinor===undefined&&s.discountReason===undefined;
}

export function validShopReceiptForSale(
  value:unknown,scope:OutboxScope,sale:SaleRequest,
):value is ShopReceipt{
  if(!record(value)||!validShopSaleRequest(sale))return false;
  const r=value;
  if(r.submissionKey!==sale.submissionKey||r.companyId!==scope.companyId||
    r.cashierId!==scope.userId||r.storeId!==sale.storeId||
    !id(r.saleId)||!Number.isSafeInteger(r.receiptNumber)||Number(r.receiptNumber)<=0||
    typeof r.currency!=="string"||!/^[A-Z]{3}$/.test(r.currency)||
    !Number.isSafeInteger(r.totalMinor)||Number(r.totalMinor)<0||
    typeof r.recordedAt!=="string"||!Number.isFinite(Date.parse(r.recordedAt))||
    typeof r.replayed!=="boolean"||!Array.isArray(r.lines)||r.lines.length===0||
    !record(r.payment)||!Number.isSafeInteger(r.refundedMinor)||
    Number(r.refundedMinor)<0||Number(r.refundedMinor)>Number(r.totalMinor))return false;
  const p=r.payment;
  if(!money(p.amountDueMinor)||p.amountDueMinor!==r.totalMinor||
    !money(p.amountTenderedMinor)||!money(p.changeMinor))return false;
  const quantities=(items:readonly unknown[]):Map<string,number>|null=>{
    const byProduct=new Map<string,number>();
    for(const raw of items){
      if(!record(raw)||!id(raw.productId)||!Number.isSafeInteger(raw.quantity)||
        Number(raw.quantity)<=0)return null;
      const sum=(byProduct.get(raw.productId)??0)+Number(raw.quantity);
      if(!Number.isSafeInteger(sum))return null;
      byProduct.set(raw.productId,sum);
    }
    return byProduct;
  };
  for(const line of r.lines){
    if(!record(line)||!Number.isSafeInteger(line.lineNo)||Number(line.lineNo)<=0||
      !money(line.lineTotalMinor))return false;
  }
  const expected=quantities(sale.lines),actual=quantities(r.lines);
  if(!expected||!actual||expected.size!==actual.size)return false;
  for(const [product,qty] of expected)
    if(actual.get(product)!==qty)return false;
  return true;
}
