/** Read-only, daily Watchdog *preview* envelope. It is not a signed cloud receipt.
 * Device/register attribution for legacy sales is unknown and is NEVER fabricated.
 */
import type { WatchdogExportEvent } from './watchdogCsvExport.ts';

export interface WatchdogDayShift {
  id: string; businessProfileId: string; staffId: string; openedAt: string;
  closedAt?: string; openingFloatMinor: number; countedCashMinor?: number;
}
export interface WatchdogDayReturn {
  id: string; businessProfileId: string; originalSaleId: string; createdAt: string;
  staffId?: string; shiftId?: string; refundedMinor: number; currency: string;
  refundMethod: 'cash'; originalReceiptNumber: string;
}
export interface WatchdogDaySource {
  companyId: string; storeId: string; dayUtc: string;
  events: readonly WatchdogExportEvent[];
  shifts: readonly WatchdogDayShift[];
  returns?: readonly WatchdogDayReturn[];
}
export type WatchdogV1Event = {
  event_id:string; event_type:string; business_id:string; shop_id:string;
  register_id:null; staff_id:string; shift_id:string; receipt_number:string|null;
  occurred_at_utc:string; received_at_utc:null; amount_minor:number|null;
  currency:string|null; payment_method:string|null; momo_provider:string|null;
  momo_reference:string|null; reason:string|null; approved_by:null; device_id:string|null;
  source_kind:'local_browser_record'; provenance_verified:false;
};
const asUtc = (raw:string, description:string) => {
  const date = new Date(raw);
  if (typeof raw !== 'string' || !Number.isFinite(date.getTime())) throw new Error(`Invalid ${description} timestamp.`);
  return date.toISOString();
};
const money = (value:number|null|undefined, label:string, allowSigned = false) => {
  if (value == null) return null;
  if (!Number.isSafeInteger(value) || (!allowSigned && value < 0)) throw new Error(`Invalid ${label} minor units.`);
  return value;
};
export function createWatchdogDayEnvelope(source:WatchdogDaySource, generatedAt = new Date().toISOString()) {
  const {companyId,storeId,dayUtc} = source;
  if (!companyId?.trim() || !storeId?.trim()) throw new Error('Company and shop are required.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayUtc) ||
      !Number.isFinite(Date.parse(`${dayUtc}T00:00:00.000Z`)) ||
      new Date(`${dayUtc}T00:00:00.000Z`).toISOString().slice(0,10)!==dayUtc)
    throw new Error('Select a real UTC calendar date.');
  const output:WatchdogV1Event[]=[];
  const ids=new Set<string>();
  const add = (item:WatchdogV1Event) => {
    if (ids.has(item.event_id)) throw new Error('Duplicate Watchdog event identity.');
    ids.add(item.event_id);
    if(item.occurred_at_utc.slice(0,10)===dayUtc) output.push(item);
  };
  const common = (id:string,type:string,staff:string,shift:string,when:string):WatchdogV1Event => {
    if(!id?.trim()||!type?.trim()||!staff?.trim()||!shift?.trim())
      throw new Error('Watchdog event is missing staff, shift or identity.');
    return {event_id:id,event_type:type,business_id:companyId,shop_id:storeId,register_id:null,
      staff_id:staff,shift_id:shift,receipt_number:null,occurred_at_utc:asUtc(when,type),
      received_at_utc:null,amount_minor:null,currency:null,payment_method:null,
      momo_provider:null,momo_reference:null,reason:null,approved_by:null,device_id:null,
      source_kind:'local_browser_record',provenance_verified:false};
  };
  // Only events already reconciled by Tallybook's single-store mapper are accepted.
  for(const event of source.events) {
    if(event.businessProfileId!==companyId || event.storeId!==storeId) throw new Error('Cross-company or cross-shop Watchdog event denied.');
    const row=common(event.eventId,event.eventType,event.staffId,event.shiftId,event.timestamp);
    row.amount_minor=money(event.amountMinor, event.eventType, event.eventType==='shift_close');
    row.currency=event.currency??null;
    if(row.currency!==null && !/^[A-Z]{3}$/.test(row.currency)) throw new Error('Invalid event currency.');
    row.receipt_number=event.receiptNumber??null;
    row.payment_method=event.paymentMethod??null;
    row.momo_provider=event.momoProvider??null;
    row.momo_reference=event.reference??null;
    row.reason=event.reason??null;
    // Device is a locally registered *claim*, not authenticated hardware identity.
    row.device_id=event.deviceId??null;
    if (event.eventType==='momo' && (!row.momo_provider?.trim() || !row.momo_reference?.trim() ||
        row.amount_minor===null || row.amount_minor<=0))
      throw new Error('MoMo event lacks provider, reference or claimed amount.');
    add(row);
  }
  const shifts=new Map<string,WatchdogDayShift>();
  for(const shift of source.shifts){
    if(shift.businessProfileId!==companyId || !shift.staffId?.trim() || !shift.id?.trim() || shifts.has(shift.id))
      throw new Error('Shift identity or company scope is invalid.');
    shifts.set(shift.id,shift);
    const row=common(`shift_open:${shift.id}`,'shift_open',shift.staffId,shift.id,shift.openedAt);
    row.amount_minor=money(shift.openingFloatMinor,'opening float');
    add(row);
    if(shift.countedCashMinor!==undefined){
      if(!shift.closedAt) throw new Error('Unclosed shift cannot have finalized cash count.');
      const count=common(`cash_count:${shift.id}`,'cash_count',shift.staffId,shift.id,shift.closedAt);
      count.amount_minor=money(shift.countedCashMinor,'cash count');
      add(count);
    }
  }
  const originalSaleIds=new Set(source.events.filter(e=>e.eventType==='sale').map(e=>e.saleId).filter((id):id is string=>Boolean(id)));
  for(const refund of source.returns??[]){
    if(refund.businessProfileId!==companyId || !refund.originalSaleId?.trim() || !refund.staffId?.trim() || !refund.shiftId?.trim() ||
       refund.refundMethod!=='cash' || !/^[A-Z]{3}$/.test(refund.currency))
      throw new Error('Unverified local cash return cannot be exported.');
    if(!originalSaleIds.has(refund.originalSaleId)) throw new Error('Local cash return has no reconciled original sale.');
    const shift=shifts.get(refund.shiftId);
    if(!shift || shift.staffId!==refund.staffId ||
       Date.parse(refund.createdAt)<Date.parse(shift.openedAt) ||
       (shift.closedAt && Date.parse(refund.createdAt)>Date.parse(shift.closedAt)))
      throw new Error('Return cannot be linked to the original staff shift.');
    const row=common(`refund:${refund.id}`,'refund',refund.staffId,refund.shiftId,refund.createdAt);
    row.receipt_number=refund.originalReceiptNumber;
    row.amount_minor=money(refund.refundedMinor,'cash refund');
    if(row.amount_minor===0) throw new Error('Zero cash refund cannot be exported.');
    row.currency=refund.currency; row.payment_method='cash';
    row.reason='Cash return recorded by attendant; independent disbursement unverified';
    add(row);
  }
  output.sort((a,b)=>a.occurred_at_utc.localeCompare(b.occurred_at_utc)||a.event_id.localeCompare(b.event_id));
  return {
    schema_version:1, format:'tallybook.watchdog.local_preview', contract_status:'partial_unverified_provenance',
    business_id:companyId, shop_id:storeId, utc_day:dayUtc, generated_at_utc:asUtc(generatedAt,'generation'),
    row_count:output.length,
    limitations:[
      'Single-store inference is not independent historical proof of store location.',
      'Originating register/device ID and trusted server receipt timestamps are unavailable for historical sales.',
      'MoMo entries are payment claims, not provider-confirmed settlements.',
      'A cash return is staff-confirmed, not independently verified cash disbursement.',
      'This preview is NOT the final negotiated Alchemy Watchdog importer contract.'
    ], events:output
  };
}
