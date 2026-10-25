/** Read-only stock conservation diagnostics; no mutation or inventory posting. */
export type StockSnapshot = {companyId:string; productId:string; storeId:string; opening:number; receipts:number; returns:number; sales:number; transfersIn:number; transfersOut:number; adjustments:number; closing:number};
export type StockFinding = {key:string;code:string;expected?:number;actual?:number};
export function reconcileInventory(rows:readonly StockSnapshot[]):StockFinding[] {
 const out:StockFinding[]=[]; const seen=new Set<string>();
 for(const r of rows){const key=JSON.stringify([r.companyId,r.storeId,r.productId]);
  if(!r.companyId||!r.storeId||!r.productId){out.push({key,code:'MISSING_ID'});continue;}
  if(seen.has(key))out.push({key,code:'DUPLICATE_SCOPE'});seen.add(key);
  const nums=[r.opening,r.receipts,r.returns,r.sales,r.transfersIn,r.transfersOut,r.adjustments,r.closing];
  if(nums.some(n=>!Number.isSafeInteger(n))){out.push({key,code:'INVALID_QUANTITY'});continue;}
  if([r.receipts,r.returns,r.sales,r.transfersIn,r.transfersOut].some(n=>n<0)){out.push({key,code:'NEGATIVE_FLOW'});continue;}
  const expected=r.opening+r.receipts+r.returns-r.sales+r.transfersIn-r.transfersOut+r.adjustments;
  if(!Number.isSafeInteger(expected)){out.push({key,code:'OVERFLOW'});continue;}
  if(expected!==r.closing)out.push({key,code:'STOCK_MISMATCH',expected,actual:r.closing});
  if(r.closing<0)out.push({key,code:'NEGATIVE_CLOSING'});
 }
 return out;
}
