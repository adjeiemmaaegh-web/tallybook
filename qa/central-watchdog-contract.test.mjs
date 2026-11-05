import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mapSingleStoreWatchdogEvents, serializeSingleStoreWatchdogCsv } from '../client/src/features/integrations/watchdogEventMapper.ts';
const base=()=>({companyId:'company-A',storeId:'shop-A',sales:[],payments:[],reversals:[],
 shifts:[{id:'shift-A',businessProfileId:'company-A',staffId:'staff-A',openedAt:'2026-10-24T07:00:00Z'}],
 noSaleEvents:[{id:'event-A',operationKey:'drawer-operation-A',businessProfileId:'company-A',storeId:'shop-A',deviceId:'local-device-A',staffId:'staff-A',shiftId:'shift-A',createdAt:'2026-10-24T08:00:00Z',reason:'cash_check'}]});
test('Watchdog single-store export includes authenticated local drawer event',()=>{
 const events=mapSingleStoreWatchdogEvents(base());
 assert.equal(events.length,1);
 assert.equal(events[0].eventType,'no_sale');
 assert.match(serializeSingleStoreWatchdogCsv(base()),/no_sale/);
});
test('Watchdog rejects cross-shop no-sale attribution and duplicate keys',()=>{
 assert.throws(()=>mapSingleStoreWatchdogEvents({...base(),noSaleEvents:[{...base().noSaleEvents[0],storeId:'shop-other'}]}));
 const d=base(); assert.throws(()=>mapSingleStoreWatchdogEvents({...d,noSaleEvents:[d.noSaleEvents[0],{...d.noSaleEvents[0],id:'different'}]}));
});
test('Watchdog rejects orphan no-sale shift and event outside shift',()=>{
 const d=base();assert.throws(()=>mapSingleStoreWatchdogEvents({...d,noSaleEvents:[{...d.noSaleEvents[0],shiftId:'missing'}]}));
 assert.throws(()=>mapSingleStoreWatchdogEvents({...d,noSaleEvents:[{...d.noSaleEvents[0],createdAt:'2026-10-24T06:00:00Z'}]}));
});
test('SQL migrations deny direct finance writes to browsers pending trusted ingest',()=>{
 const policies=readFileSync('docs/history/unapplied-migrations/002_rls_policies.sql','utf8');
 assert.match(policies,/revoke all on public/);assert.doesNotMatch(policies,/grant\s+(insert|update|delete)\s+on/i);
 const schema=readFileSync('docs/history/unapplied-migrations/001_core_tables.sql','utf8');
 for(const table of ['tb_sales','tb_payments','tb_shifts','tb_adjustments','tb_drawer_events','tb_sync_operations'])assert.match(schema,new RegExp(`create table if not exists public\\.${table}`));
});
