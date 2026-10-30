import {reconcileCashPartialReturns} from '../sales/cashPartialReturn.mjs';
const quantity=n=>Number.isSafeInteger(n)&&n>=0;
const add=(a,b)=>{const n=a+b;if(!quantity(n))throw Error('Unit demand exceeds safe quantity bounds.');return n;};
/** Net units from a sale cohort, including returns recorded through asOf.
 * Read-only: the coverage scenario is not a forecast or purchase instruction. */
export function deriveSkuDemand({company,products,sales,lines,payments,reversals,returns,startMs,endMs,asOfMs,windowDays,horizonDays=14}){
 if(!company||![startMs,endMs,asOfMs].every(Number.isFinite)||startMs<0||endMs<=startMs||asOfMs<startMs||
   (windowDays!==null&&(!Number.isSafeInteger(windowDays)||windowDays<1))||
   !Number.isSafeInteger(horizonDays)||horizonDays<1||horizonDays>90)throw Error('Invalid unit-demand reporting window.');
 const index=(rows,label)=>{const map=new Map();for(const r of rows){
   if(!r||typeof r.id!=='string'||!r.id||r.businessProfileId!==company||map.has(r.id))throw Error(`Duplicate or foreign ${label} evidence.`);
   map.set(r.id,r);
 }return map;};
 const productById=index(products,'product'),saleById=index(sales,'sale'),lineById=index(lines,'sale line');
 index(payments,'payment');index(reversals,'reversal');index(returns,'partial return');
 const time=r=>{const t=Date.parse(r.createdAt);if(!Number.isFinite(t))throw Error('Invalid unit-demand posting date.');return t;};
 for(const sale of sales)time(sale);
 for(const line of lines)if(!saleById.has(line.saleId)||!productById.has(line.productId)||!quantity(line.quantity)||line.quantity===0)
   throw Error('Missing or invalid original sale-line evidence.');
 for(const sale of sales)if(!lines.some(line=>line.saleId===sale.id))throw Error('Original sale has no line evidence.');
 const reversed=new Set();
 for(const r of reversals){const sale=saleById.get(r.originalSaleId);
   if(!sale||time(r)<time(sale)||reversed.has(sale.id))throw Error('Invalid or repeated full reversal evidence.');
   const byProduct=rows=>{const result=new Map();for(const row of rows){
     if(!quantity(row.quantity)||row.quantity===0||!productById.has(row.productId))throw Error('Invalid reversal unit evidence.');
     result.set(row.productId,add(result.get(row.productId)??0,row.quantity));
   }return result;};
   if(!Array.isArray(r.lines))throw Error('Full reversal has no unit evidence.');
   const original=byProduct(lines.filter(l=>l.saleId===sale.id)),restored=byProduct(r.lines);
   if(original.size!==restored.size||[...original].some(([id,q])=>restored.get(id)!==q))
     throw Error('Full reversal units differ from original sale.');
   if(time(r)<=asOfMs)reversed.add(sale.id);
 }
 // Reuse the existing full original-tender/amount/sequence return validator;
 // counting a returned unit must not conceal corrupt refund evidence.
 reconcileCashPartialReturns(sales,lines,payments,returns,reversals);
 const returned=new Map();
 for(const r of returns)if(time(r)<=asOfMs)for(const entry of r.lines){
   const line=lineById.get(entry.saleLineId);
   if(!line||line.saleId!==r.originalSaleId)throw Error('Return has no matching original sale line.');
   returned.set(line.id,add(returned.get(line.id)??0,entry.quantity));
 }
 const totals=new Map();
 for(const line of lines){const sale=saleById.get(line.saleId),at=time(sale);
   if(at<startMs||at>=endMs||at>asOfMs||reversed.has(sale.id))continue;
   const net=line.quantity-(returned.get(line.id)??0);
   if(!quantity(net))throw Error('Returned units exceed original sold units.');
   const previous=totals.get(line.productId)??{soldUnits:0,returnedUnits:0,netUnits:0,sourceLineIds:[]};
   previous.soldUnits=add(previous.soldUnits,line.quantity);
   previous.returnedUnits=add(previous.returnedUnits,returned.get(line.id)??0);
   previous.netUnits=add(previous.netUnits,net);previous.sourceLineIds.push(line.id);totals.set(line.productId,previous);
 }
 return [...totals].filter(([,t])=>t.netUnits>0).map(([productId,t])=>{
   const product=productById.get(productId);
   if(!quantity(product.stockQuantity))throw Error('Saved stock must be reconciled before unit-demand review.');
   let coverageUnits=null,reorderUnits=null;
   // Services and all-history windows have no stock-order scenario.
   if(windowDays!==null&&product.itemKind!=="service"){
     const numerator=t.netUnits*horizonDays;
     if(!Number.isSafeInteger(numerator))throw Error('Coverage scenario exceeds safe quantity bounds.');
     coverageUnits=Math.ceil(numerator/windowDays);reorderUnits=Math.max(0,coverageUnits-product.stockQuantity);
   }
   return {productId,productName:product.name,...t,stockQuantity:product.stockQuantity,windowDays,horizonDays,coverageUnits,reorderUnits};
 }).sort((a,b)=>b.netUnits-a.netUnits||a.productId.localeCompare(b.productId));
}
