/** CSV serialization only. Input must be independently authorized and scoped by Tallybook. */
export interface WatchdogExportEvent { eventId:string;businessProfileId:string;storeId:string;staffId:string;shiftId:string;timestamp:string;eventType:string;saleId?:string;amountMinor?:number;currency?:string;reference?:string;reason?:string }
export const WATCHDOG_COLUMNS = ['eventId','businessProfileId','storeId','staffId','shiftId','timestamp','eventType','saleId','amountMinor','currency','reference','reason'] as const;
const csvCell=(value:unknown):string => { const s=String(value??''); const safe=/^\s*[=+@\-]/.test(s) && typeof value!=='number' ? "'"+s : s; return /[",\r\n]/.test(safe)?'"'+safe.replace(/"/g,'""')+'"':safe; };
export function exportWatchdogCsv(events:readonly WatchdogExportEvent[],businessProfileId:string):string {
 if(!businessProfileId.trim()) throw new Error('Company scope required.');
 const ids=new Set<string>();
 const rows=events.map(event=>{
   if(event.businessProfileId!==businessProfileId) throw new Error('Cross-company export denied.');
   if(!event.eventId||!event.storeId||!event.staffId||!event.shiftId||!Number.isFinite(Date.parse(event.timestamp))) throw new Error('Missing event provenance.');
   if(!event.eventType?.trim()) throw new Error('Event type required.');
   if(ids.has(event.eventId)) throw new Error('Duplicate event ID.'); ids.add(event.eventId);
   if(event.amountMinor!==undefined && (!Number.isSafeInteger(event.amountMinor))) throw new Error('Unsafe monetary value.');
   return WATCHDOG_COLUMNS.map(k=>csvCell(event[k])).join(',');
 });
 return [WATCHDOG_COLUMNS.join(','),...rows].join('\r\n')+'\r\n';
}
