import {minor,type Finding} from './financialReconciliation.ts';
export type RefundEvidence={id:string;companyId:string;originalSaleId:string;currency:string;amountMinor:number;method:'cash'|'card'|'mobile'|'bank';reference:string;confirmedByStaffId:string;confirmedAt:string;submissionKey:string;status:'confirmed'|'proposed'};
/** Evidence reviewer ONLY. Neither a reversal nor this reviewer transfers any money. */
export function reviewRefundEvidence(refunds:readonly RefundEvidence[],companyId:string,saleId:string,maxReturnMinor:number):{confirmedMinor:number;findings:Finding[]}{
 const f:Finding[]=[];let paid=0;
 const companyRefunds=refunds.filter(r=>r.companyId===companyId);
 const keys=new Map<string,number>();
 for(const r of companyRefunds)if(r.submissionKey)keys.set(r.submissionKey,(keys.get(r.submissionKey)??0)+1);
 const ids=new Set<string>();let currency:string|undefined;
 for(const r of companyRefunds.filter(r=>r.originalSaleId===saleId)){
  if(!r.id||ids.has(r.id))f.push({code:'REFUND_ID',entityId:r.id,message:'Missing or duplicate refund ID'});ids.add(r.id);
  if(!r.submissionKey||keys.get(r.submissionKey)!==1)f.push({code:'REFUND_DUPLICATE',entityId:r.id,message:'Missing or reused company refund key'});
  if(!minor(r.amountMinor)||r.amountMinor===0||!['cash','card','mobile','bank'].includes(r.method)||!['confirmed','proposed'].includes(r.status))
   f.push({code:'REFUND_RECORD',entityId:r.id,message:'Invalid refund amount, method or status'});
  if(!/^[A-Z]{3}$/.test(r.currency)||(currency!==undefined&&currency!==r.currency))f.push({code:'REFUND_CURRENCY',entityId:r.id,message:'Invalid or inconsistent refund currency'});
  if(currency===undefined)currency=r.currency;
  if(r.status==='confirmed'){
   if(!r.reference?.trim()||!r.confirmedByStaffId?.trim()||!Number.isFinite(Date.parse(r.confirmedAt)))
    f.push({code:'REFUND_EVIDENCE',entityId:r.id,message:'Confirmed disbursement requires external reference, staff and time'});
   if(minor(r.amountMinor)&&Number.isSafeInteger(paid+r.amountMinor))paid+=r.amountMinor;
   else f.push({code:'REFUND_OVERFLOW',entityId:r.id,message:'Unsafe aggregate disbursement'});
  }
 }
 if(!minor(maxReturnMinor)||paid>maxReturnMinor)f.push({code:'REFUND_EXCESS',entityId:saleId,message:'Confirmed amounts exceed approved return ceiling'});
 return {confirmedMinor:f.length?0:paid,findings:f};
}
