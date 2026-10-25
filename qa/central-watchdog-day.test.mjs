import test from 'node:test';
import assert from 'node:assert/strict';
import {createWatchdogDayEnvelope} from '../client/src/features/integrations/watchdogDayEnvelope.ts';
const example=()=>({companyId:'biz1',storeId:'store1',dayUtc:'2026-10-24',
  events:[{eventId:'sale:s1',businessProfileId:'biz1',storeId:'store1',staffId:'alice',shiftId:'shift1',timestamp:'2026-10-24T12:00:00+00:00',eventType:'sale',saleId:'s1',amountMinor:1200,currency:'GHS',receiptNumber:'TB-11',paymentMethod:'mobile'},
  {eventId:'momo:p1',businessProfileId:'biz1',storeId:'store1',staffId:'alice',shiftId:'shift1',timestamp:'2026-10-24T12:00:00Z',eventType:'momo',amountMinor:1200,currency:'GHS',reference:'trans-1',momoProvider:'MTN'}],
  shifts:[{id:'shift1',businessProfileId:'biz1',staffId:'alice',openedAt:'2026-10-24T08:00:00Z',closedAt:'2026-10-24T18:00:00Z',openingFloatMinor:100,countedCashMinor:250}],
  returns:[{id:'ret1',businessProfileId:'biz1',originalSaleId:'s1',createdAt:'2026-10-24T14:00:00Z',staffId:'alice',shiftId:'shift1',refundedMinor:200,currency:'GHS',refundMethod:'cash',originalReceiptNumber:'TB-11'}]});
test('daily JSON is deterministic in content, sorted, counted, and includes cash/return evidence',()=>{
 const a=createWatchdogDayEnvelope(example(),'2026-10-24T20:00:00Z');
 assert.equal(a.row_count,5); // sale, MoMo, shift opening, count, cash return
 assert.equal(a.events.length,5);
});
test('daily export normalizes ISO offsets to UTC and filters day',()=>{
 const x=example();x.events[0].timestamp='2026-10-25T01:00:00+02:00';
 const a=createWatchdogDayEnvelope(x,'2026-10-24T20:00:00Z');
 assert.equal(a.events.find(e=>e.event_id==='sale:s1').occurred_at_utc,'2026-10-24T23:00:00.000Z');
 assert.ok(a.events.every(e=>e.occurred_at_utc.startsWith('2026-10-24')));
 assert.equal(a.schema_version,1);assert.equal(a.row_count,a.events.length);
});
test('device and cloud provenance never invented',()=>{
 const a=createWatchdogDayEnvelope(example());
 assert.ok(a.events.every(e=>e.device_id===null&&e.register_id===null&&e.received_at_utc===null&&!e.provenance_verified));
 assert.equal(a.contract_status,'partial_unverified_provenance');
 assert.ok(!JSON.stringify(a).includes('customer_phone'));
});
test('rejects foreign rows, orphan return staff, and unclosed cash count',()=>{
 let x=example();x.events[0].businessProfileId='other';assert.throws(()=>createWatchdogDayEnvelope(x),/Cross-company/);
 x=example();x.returns[0].staffId='bob';assert.throws(()=>createWatchdogDayEnvelope(x),/staff shift/);
 x=example();delete x.shifts[0].closedAt;assert.throws(()=>createWatchdogDayEnvelope(x),/Unclosed/);
});
test('rejects duplicate event IDs, currency corruption and numeric overflow',()=>{
 let x=example();x.events.push({...x.events[0]});assert.throws(()=>createWatchdogDayEnvelope(x),/Duplicate/);
 x=example();x.events[0].currency='GHS!';assert.throws(()=>createWatchdogDayEnvelope(x),/currency/);
 x=example();x.events[0].amountMinor=Number.MAX_SAFE_INTEGER+1;assert.throws(()=>createWatchdogDayEnvelope(x),/minor units/);
});
test('rejects nonexistent UTC calendar day and negative refund',()=>{
 let x=example();x.dayUtc='2026-02-30';assert.throws(()=>createWatchdogDayEnvelope(x),/real UTC/);
 x=example();x.returns[0].refundedMinor=-1;assert.throws(()=>createWatchdogDayEnvelope(x),/minor units/);
});
test('never includes other-day shifts and returns in a daily export',()=>{
 const x=example();x.shifts[0].openedAt='2026-10-23T08:00:00Z';x.returns[0].createdAt='2026-10-23T10:00:00Z';
 const a=createWatchdogDayEnvelope(x);assert.equal(a.row_count,3);
});
