/** Evaluates inter-store transfer evidence; never authorizes or executes a transfer. */
export type TransferEvidence={id:string;companyId:string;productId:string;sourceStoreId:string;destinationStoreId:string;quantity:number;dispatched:number;received:number;status:'requested'|'dispatched'|'received'|'cancelled'};
export function auditStoreTransfers(entries:readonly TransferEvidence[]):{id:string;code:string}[]{
 const errors:{id:string;code:string}[]=[];const ids=new Set<string>();
 for(const t of entries){const push=(code:string)=>errors.push({id:t.id,code});
  if(!t.id||ids.has(t.id))push('DUPLICATE_OR_MISSING_ID');ids.add(t.id);
  if(!t.companyId||!t.productId||!t.sourceStoreId||!t.destinationStoreId||t.sourceStoreId===t.destinationStoreId)push('INVALID_ROUTE');
  if([t.quantity,t.dispatched,t.received].some(n=>!Number.isSafeInteger(n)||n<0)||t.quantity===0){push('INVALID_QUANTITY');continue;}
  if(t.dispatched>t.quantity||t.received>t.dispatched)push('OVER_TRANSFER');
  if(t.status==='requested'&&(t.dispatched!==0||t.received!==0))push('PREMATURE_MOVEMENT');
  if(t.status==='received'&&t.received!==t.dispatched)push('INCOMPLETE_RECEIPT');
  if(t.status==='cancelled'&&(t.dispatched!==0||t.received!==0))push('CANCELLED_WITH_MOVEMENT');
 }
 return errors;
}
