/** Pure, read-only diagnostics. This is not an accounting ledger replacement. */
import { reconcileSales } from '../integrations/financialReconciliation.ts';
import {assertSplitPaymentLedger} from '../sales/splitTender.mjs';
import type { Sale, Payment } from '../sales/sales';
import type { StaffShift } from '../staff/staff';
export interface IntegrityFinding { code:string; entityId:string; message:string }
export interface IntegritySnapshot {
  businessProfileId:string; saleCount:number; paymentCount:number;
  errors:IntegrityFinding[]; warnings:IntegrityFinding[];
}
export function inspectLocalSaleEvidence(
  company:string, sales:readonly Sale[], payments:readonly Payment[], shifts:readonly StaffShift[]
):IntegritySnapshot {
  if(!company?.trim() || [...sales,...payments,...shifts].some(x=>x.businessProfileId!==company))
    throw new Error('Company scope mismatch in local integrity review.');
  const errors:IntegrityFinding[]=[...reconcileSales(sales)];
  const warnings:IntegrityFinding[]=[];
  const saleById=new Map(sales.map(s=>[s.id,s]));
  const shiftById=new Map(shifts.map(s=>[s.id,s]));
  const ids=new Set<string>(); const paymentSums=new Map<string,number>();
  const mobileRefs=new Set<string>();
  for(const pay of payments) {
    if(!pay.id || ids.has(pay.id)) errors.push({code:'DUPLICATE_PAYMENT',entityId:pay.id,message:'Duplicate or missing payment ID'});
    ids.add(pay.id);
    const sale=saleById.get(pay.saleId);
    if(!sale) { errors.push({code:'ORPHAN_PAYMENT',entityId:pay.id,message:'Payment is not linked to a saved sale in this company'}); continue; }
    if((sale.paymentMethod==='split'?!['cash','card','mobile'].includes(pay.method):pay.method!==sale.paymentMethod) || !Number.isSafeInteger(pay.amountMinor) || pay.amountMinor<=0)
      errors.push({code:'INVALID_TENDER',entityId:pay.id,message:'Payment method or amount does not match the sale'});
    const sum=(paymentSums.get(pay.saleId)??0)+pay.amountMinor;
    if(!Number.isSafeInteger(sum)) errors.push({code:'TENDER_OVERFLOW',entityId:pay.id,message:'Tender total exceeds safe integer bounds'});
    paymentSums.set(pay.saleId,sum);
    if(pay.method==='mobile'){
      const provider=pay.mobileMoneyProviderId?.trim();const ref=pay.mobileMoneyReference?.trim().toUpperCase();
      if(!provider || !ref) warnings.push({code:'LEGACY_MOMO_EVIDENCE',entityId:pay.id,message:'Mobile Money provider/reference was not captured'});
      else { const key=JSON.stringify([company,provider,ref]);
        if(mobileRefs.has(key)) errors.push({code:'DUPLICATE_MOMO_CLAIM',entityId:pay.id,message:'Provider reference has multiple POS claims'});
        mobileRefs.add(key); }
    }
  }
  const seenShiftIds=new Set<string>();
  for(const shift of shifts) {
    if(!shift.id || seenShiftIds.has(shift.id)) errors.push({code:'DUPLICATE_SHIFT',entityId:shift.id,message:'Missing or duplicate shift identity'});
    seenShiftIds.add(shift.id);
  }
  for(const sale of sales) {
    try{assertSplitPaymentLedger(sale,payments.filter(row=>row.saleId===sale.id));}
    catch{errors.push({code:'SPLIT_TENDER_MISMATCH',entityId:sale.id,message:'Split payment entries do not reconcile with the immutable original receipt'});}
    if (!sale.staffId?.trim() || !sale.shiftId?.trim() || !sale.currency)
      warnings.push({code:'LEGACY_SALE_PROVENANCE',entityId:sale.id,message:'Historical sale lacks staff, shift or currency evidence'});
    if(sale.staffId && sale.shiftId &&
       (!shiftById.has(sale.shiftId) || shiftById.get(sale.shiftId)?.staffId!==sale.staffId))
      errors.push({code:'SHIFT_MISMATCH',entityId:sale.id,message:'Sale and staff shift identities do not match'});
    // Prepaid wallet and credit do not always create external tender records.
    if(sale.paymentMethod!=='credit' && sale.paymentMethod!=='wallet' &&
       (paymentSums.get(sale.id)??0)!==sale.amountPaidMinor)
      errors.push({code:'TENDER_MISMATCH',entityId:sale.id,message:'Saved external payment total differs from sale paid amount'});
  }
  return {businessProfileId:company,saleCount:sales.length,paymentCount:payments.length,errors,warnings};
}
