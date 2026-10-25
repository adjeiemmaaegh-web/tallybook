import {minor,type Finding} from './financialReconciliation.ts';
export type ReturnLine={saleLineId:string;originalQuantity:number;previouslyReturnedQuantity:number;requestedQuantity:number;originalGrossMinor:number};
/** Upper-bound planner only, not an approved tax/discount allocation or disbursement. */
export function planPartialRefund(lines:readonly ReturnLine[],originalSaleTotalMinor:number,previouslyRefundedMinor:number):{maximumRefundMinor:number|null;findings:Finding[]}{
 const f:Finding[]=[];const used=new Set<string>();let max=0n;
 for(const l of lines){
  if(!l.saleLineId||used.has(l.saleLineId))f.push({code:'RETURN_DUPLICATE_LINE',entityId:l.saleLineId,message:'Missing or duplicate sale line'});
  used.add(l.saleLineId);
  if(![l.originalQuantity,l.previouslyReturnedQuantity,l.requestedQuantity].every(x=>Number.isSafeInteger(x)&&x>=0)||!l.originalQuantity||!l.requestedQuantity||l.previouslyReturnedQuantity+l.requestedQuantity>l.originalQuantity||!minor(l.originalGrossMinor)){
   f.push({code:'RETURN_QUANTITY',entityId:l.saleLineId,message:'Invalid or excessive return quantity'});continue;
  }
  // Integer arithmetic avoids accidental extra minor units with high-value invoices.
  max+=(BigInt(l.originalGrossMinor)*BigInt(l.requestedQuantity))/BigInt(l.originalQuantity);
 }
 if(!minor(originalSaleTotalMinor)||!minor(previouslyRefundedMinor)||max>BigInt(Number.MAX_SAFE_INTEGER)||max+BigInt(minor(previouslyRefundedMinor)?previouslyRefundedMinor:0)>BigInt(minor(originalSaleTotalMinor)?originalSaleTotalMinor:0))
  f.push({code:'RETURN_EXCESS',entityId:'sale',message:'Return estimate exceeds safe or authorized total'});
 return {maximumRefundMinor:f.length?null:Number(max),findings:f};
}
