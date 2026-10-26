import type { createWatchdogDayEnvelope } from './watchdogDayEnvelope.ts';

type DayEnvelope = ReturnType<typeof createWatchdogDayEnvelope>;
const columns = ['external_id','kind','occurred_at','store_id','register_id','reference','amount','currency'] as const;
const supported = new Set(['sale','refund','void','discount','no_sale']);
const omittedKinds = new Set(['momo','shift_open','shift_close','cash_count']);

const cell = (value:string):string => {
  if (value.length > 180 || /[\r\n\0]/.test(value) || /^\s*[=+@-]/.test(value))
    throw new Error('Watchdog canonical CSV contains an unsafe or oversized text field.');
  return /[",]/.test(value) ? `"${value.replace(/"/g,'""')}"` : value;
};

/** Exact Watchdog Stage 17 parser format. Unsupported evidence is reported, never silently remapped. */
export function serializeWatchdogCanonicalCsv(day:DayEnvelope):{
  csv:string; included:number; omitted:ReadonlyArray<{event_id:string;event_type:string}>;
} {
  if(day.format!=='tallybook.watchdog.local_preview' || day.schema_version!==1 ||
     day.contract_status!=='partial_unverified_provenance' || day.row_count!==day.events.length)
    throw new Error('Unexpected Watchdog day envelope.');
  const rows:string[]=[];
  const omitted:{event_id:string;event_type:string}[]=[];
  const ids=new Set<string>();
  for(const event of day.events){
    if(event.business_id!==day.business_id || event.shop_id!==day.shop_id ||
       ids.has(event.event_id) || !Number.isFinite(Date.parse(event.occurred_at_utc)) ||
       event.occurred_at_utc.slice(0,10)!==day.utc_day)
      throw new Error('Watchdog event scope, identity or UTC day is invalid.');
    ids.add(event.event_id);
    if(omittedKinds.has(event.event_type)){
      omitted.push({event_id:event.event_id,event_type:event.event_type});
      continue;
    }
    if(!supported.has(event.event_type)) throw new Error(`Unmapped Watchdog event type ${event.event_type}.`);
    const monetary = event.event_type==='sale'||event.event_type==='refund'||event.event_type==='discount';
    if(monetary && (!Number.isSafeInteger(event.amount_minor) || (event.amount_minor??0)<=0 ||
                    !event.currency || !/^[A-Z]{3}$/.test(event.currency)))
      throw new Error(`Watchdog ${event.event_type} lacks a valid amount and currency.`);
    if(!monetary && event.amount_minor!==null)
      throw new Error(`Watchdog ${event.event_type} amount has no agreed canonical meaning.`);
    const amount = monetary ? `${Math.floor(event.amount_minor!/100)}.${String(event.amount_minor!%100).padStart(2,'0')}` : '';
    if(monetary && event.amount_minor!>100_000_000_000_000)
      throw new Error('Watchdog amount exceeds importer bounds.');
    const values=[event.event_id,event.event_type,event.occurred_at_utc,event.shop_id,
      event.register_id??'',event.receipt_number??'',amount,monetary?event.currency!:''];
    rows.push(values.map(cell).join(','));
  }
  if(rows.length===0) throw new Error('No Watchdog canonical POS rows for this UTC day. Use the full JSON preview to inspect omitted events.');
  return {csv:[columns.join(','),...rows].join('\r\n')+'\r\n',included:rows.length,omitted};
}
