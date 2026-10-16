import {validateReturnPolicyHistory,checkSaleReturnPolicySnapshot,
 validateRecordedReturnPolicy} from './returnPolicy.mjs';

/** Account for policy authorization evidence independently of cash, tax and
 * FIFO audits. Historical refunds lacking snapshots stay LEGACY UNVERIFIED,
 * not automatically invalidated or reinterpreted under today's policy.
 */
export function auditCompanyReturnPolicyEvidence(profile,sales,reversals,partialReturns){
 if(!profile||typeof profile.id!=='string'||!profile.id||
    ![sales,reversals,partialReturns].every(Array.isArray))
  throw Error('Company return policy audit requires complete saved records.');
 validateReturnPolicyHistory(profile.returnPolicyHistory);
 const originals=new Map();
 let salesWithoutHistoricalTerms=0,verifiedRefunds=0,legacyRefunds=0;
 for(const sale of sales){
  if(typeof sale?.id!=='string'||!sale.id||originals.has(sale.id)||
     sale.businessProfileId!==profile.id)
   throw Error('Return policy audit contains duplicate or foreign original sale.');
  originals.set(sale.id,sale);
  if(sale.returnPolicyAtSale===undefined){salesWithoutHistoricalTerms++;continue;}
  const snapshot=checkSaleReturnPolicySnapshot(profile.returnPolicyHistory,sale.returnPolicyAtSale);
  if(Date.parse(snapshot.effectiveAt)>Date.parse(sale.createdAt))
   throw Error('Original sale claims refund policy that became effective later.');
 }
 for(const [events,kind] of [[reversals,'full'],[partialReturns,'partialCash']]){
  for(const event of events){
   const sale=originals.get(event?.originalSaleId);
   if(!sale||event.businessProfileId!==profile.id)
    throw Error('Saved refund policy event references a foreign or missing sale.');
   const result=validateRecordedReturnPolicy(profile.returnPolicyHistory,sale,event,kind);
   if(result.verified)verifiedRefunds++;else legacyRefunds++;
  }
 }
 return Object.freeze({verifiedRefunds,legacyRefunds,
  salesWithoutHistoricalTerms,
  activeRevision:profile.returnPolicyHistory?.at(-1)?.revision??0});
}
