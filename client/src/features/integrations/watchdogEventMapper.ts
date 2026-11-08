import { exportWatchdogCsv, type WatchdogExportEvent } from './watchdogCsvExport.ts';
import { reconcileSales } from './financialReconciliation.ts';
import {assertSplitPaymentLedger,type SplitTenderEvidence} from '../sales/splitTender.mjs';

/** Maps an authorized, single-store snapshot; it neither changes data nor claims physical device evidence. */
export interface ExportSnapshot {
  companyId: string;
  storeId: string;
  sales: ReadonlyArray<{
    id:string; businessProfileId:string; createdAt:string; staffId?:string; shiftId?:string;
    currency?:string; totalMinor:number; amountPaidMinor:number; outstandingMinor:number;
    discountMinor:number; paymentMethod:string; receiptNumber?:string; submissionKey?:string;customerId?:string;splitTendersAtSale?:SplitTenderEvidence[];
  }>;
  payments: ReadonlyArray<{
    id:string; saleId:string; businessProfileId:string; method:string; amountMinor:number;
    mobileMoneyReference?:string; mobileMoneyProviderName?:string;mobileMoneyProviderId?:string;cardReference?:string;customerId?:string;
  }>;
  shifts: ReadonlyArray<{
    id:string; businessProfileId:string; staffId:string; openedAt:string; closedAt?:string;
    varianceMinor?:number;
  }>;
  noSaleEvents?: ReadonlyArray<{
    id:string; businessProfileId:string; storeId:string; deviceId:string; staffId:string;
    shiftId:string; operationKey:string; createdAt:string; reason:string;
  }>;
  reversals: ReadonlyArray<{
    id:string; businessProfileId:string; originalSaleId:string; createdAt:string;
    staffId?:string; shiftId?:string;
  }>;
}

export function mapSingleStoreWatchdogEvents(data: ExportSnapshot): WatchdogExportEvent[] {
  if (!data.companyId?.trim() || !data.storeId?.trim()) throw new Error('A verified company and store are required.');
  if (data.sales.some(x=>x.businessProfileId!==data.companyId) ||
      data.payments.some(x=>x.businessProfileId!==data.companyId) ||
      data.shifts.some(x=>x.businessProfileId!==data.companyId) ||
      data.reversals.some(x=>x.businessProfileId!==data.companyId) ||
      (data.noSaleEvents??[]).some(x=>x.businessProfileId!==data.companyId || x.storeId!==data.storeId)) throw new Error('Cross-company Watchdog export denied.');
  const violations=reconcileSales(data.sales);
  if (violations.length) throw new Error(`Unreconciled sale ${violations[0].entityId}: ${violations[0].code}`);
  const shifts=new Map(data.shifts.map(s=>[s.id,s]));
  if (shifts.size!==data.shifts.length) throw new Error('Duplicate shift IDs in Watchdog export.');
  const saleById=new Map(data.sales.map(s=>[s.id,s]));
  const events:WatchdogExportEvent[]=[];
  for (const sale of data.sales) {
    if (!sale.staffId?.trim()||!sale.shiftId?.trim()||!sale.currency || !/^[A-Z]{3}$/.test(sale.currency))
      throw new Error(`Sale ${sale.id} has missing staff, shift, or currency evidence.`);
    const shift=shifts.get(sale.shiftId);
    if (!shift || shift.staffId!==sale.staffId || shift.businessProfileId!==data.companyId ||
        !Number.isFinite(Date.parse(sale.createdAt)) || !Number.isFinite(Date.parse(shift.openedAt)) ||
        Date.parse(sale.createdAt)<Date.parse(shift.openedAt) ||
        (shift.closedAt && Date.parse(sale.createdAt)>Date.parse(shift.closedAt)))
      throw new Error(`Sale ${sale.id} cannot be linked to a valid staff shift.`);
    if (!Number.isSafeInteger(sale.discountMinor)||sale.discountMinor<0) throw new Error(`Invalid sale discount ${sale.id}.`);
    const base={businessProfileId:data.companyId,storeId:data.storeId,staffId:sale.staffId,shiftId:sale.shiftId,
      timestamp:sale.createdAt,saleId:sale.id,currency:sale.currency,receiptNumber:sale.receiptNumber,paymentMethod:sale.paymentMethod};
    events.push({...base,eventId:`sale:${sale.id}`,eventType:'sale',amountMinor:sale.totalMinor});
    if(sale.discountMinor>0) events.push({...base,eventId:`discount:${sale.id}`,eventType:'discount',amountMinor:sale.discountMinor});
  }
  const paymentIds=new Set<string>();
  const momoRefs=new Set<string>();
  const salePayments=new Map<string,number>();
  for (const p of data.payments) {
    if (paymentIds.has(p.id)) throw new Error('Duplicate payment ID.'); paymentIds.add(p.id);
    const sale=saleById.get(p.saleId);
    if(!sale) throw new Error(`Payment ${p.id} has no matching sale.`);
    if ((sale.paymentMethod==='split'?!['cash','card','mobile'].includes(p.method):p.method!==sale.paymentMethod) || !Number.isSafeInteger(p.amountMinor) || p.amountMinor<=0)
      throw new Error(`Payment ${p.id} does not reconcile to the original sale tender.`);
    salePayments.set(sale.id,(salePayments.get(sale.id)??0)+p.amountMinor);
    if (!Number.isSafeInteger(salePayments.get(sale.id))) throw new Error('Payment sum overflow.');
    if (p.method!=='mobile') continue;
    if(!p.mobileMoneyReference?.trim()||!Number.isSafeInteger(p.amountMinor)||p.amountMinor<=0)
      throw new Error(`Mobile Money payment ${p.id} lacks verified reference or amount.`);
    const ref=p.mobileMoneyReference.trim();
    if(momoRefs.has(ref)) throw new Error(`Duplicate Mobile Money reference ${ref}.`);
    momoRefs.add(ref);
    events.push({eventId:`momo:${p.id}`,businessProfileId:data.companyId,storeId:data.storeId,
      staffId:sale.staffId!,shiftId:sale.shiftId!,timestamp:sale.createdAt,eventType:'momo',
      saleId:sale.id,amountMinor:p.amountMinor,currency:sale.currency,reference:ref,receiptNumber:sale.receiptNumber,paymentMethod:'mobile',momoProvider:p.mobileMoneyProviderName});
  }
  for (const sale of data.sales) {
    if(sale.paymentMethod==='split')
      assertSplitPaymentLedger(sale,data.payments.filter(p=>p.saleId===sale.id));
    const recorded=salePayments.get(sale.id)??0;
    if (sale.paymentMethod==='wallet' || sale.paymentMethod==='credit') {
      if(recorded!==0) throw new Error(`Sale ${sale.id} has contradictory external payment records.`);
    } else if (recorded!==sale.amountPaidMinor) {
      throw new Error(`Sale ${sale.id} external payment total does not reconcile.`);
    }
  }
  const seenReversals=new Set<string>();
  for(const r of data.reversals){
    if(seenReversals.has(r.originalSaleId))throw new Error('Duplicate full-sale reversals.');
    seenReversals.add(r.originalSaleId);
    const sale=saleById.get(r.originalSaleId);
    if(!sale)throw new Error(`Reversal ${r.id} refers to a missing original sale.`);
    // Reversal = accounting void event, NOT an attestation of refunded cash or provider payout.
    const actor=r.staffId;
    const actorShift=r.shiftId;
    if (!actor||!actorShift||!shifts.has(actorShift)||shifts.get(actorShift)?.staffId!==actor)
      throw new Error(`Reversal ${r.id} lacks authoritative staff and shift evidence.`);
    if(!Number.isFinite(Date.parse(r.createdAt)))throw new Error(`Invalid reversal time ${r.id}.`);
    events.push({eventId:`void:${r.id}`,businessProfileId:data.companyId,storeId:data.storeId,
      staffId:actor,shiftId:actorShift,timestamp:r.createdAt,eventType:'void',saleId:sale.id,currency:sale.currency,
      reason:'Accounting reversal; customer refund is not verified by this event'});
  }
  const seenDrawerKeys=new Set<string>();
  for(const event of data.noSaleEvents??[]){
    if(seenDrawerKeys.has(event.operationKey))throw new Error('Duplicate no-sale operation key.');
    seenDrawerKeys.add(event.operationKey);
    const shift=shifts.get(event.shiftId);
    if(!shift || shift.staffId!==event.staffId || !event.deviceId ||
       !Number.isFinite(Date.parse(event.createdAt)) ||
       Date.parse(event.createdAt)<Date.parse(shift.openedAt) ||
       (shift.closedAt && Date.parse(event.createdAt)>Date.parse(shift.closedAt)))
       throw new Error(`Drawer event ${event.id} lacks valid shift/device evidence.`);
    events.push({eventId:`no_sale:${event.id}`,businessProfileId:data.companyId,storeId:data.storeId,
      staffId:event.staffId,shiftId:event.shiftId,timestamp:event.createdAt,eventType:'no_sale',
      reason:event.reason,deviceId:event.deviceId});
  }
  for(const shift of data.shifts){
    if (!shift.closedAt) continue;
    if (!Number.isFinite(Date.parse(shift.closedAt)) || !Number.isSafeInteger(shift.varianceMinor))
      throw new Error(`Closed shift ${shift.id} lacks verifiable time or variance.`);
    events.push({eventId:`shift:${shift.id}`,businessProfileId:data.companyId,storeId:data.storeId,
      staffId:shift.staffId,shiftId:shift.id,timestamp:shift.closedAt,eventType:'shift_close',amountMinor:shift.varianceMinor});
  }
  return events.sort((a,b)=>a.timestamp.localeCompare(b.timestamp)||a.eventId.localeCompare(b.eventId));
}

export function serializeSingleStoreWatchdogCsv(data:ExportSnapshot):string {
  return exportWatchdogCsv(mapSingleStoreWatchdogEvents(data),data.companyId);
}
