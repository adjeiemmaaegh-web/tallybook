import test from 'node:test';
import assert from 'node:assert/strict';
import {mapSingleStoreWatchdogEvents} from '../client/src/features/integrations/watchdogEventMapper.ts';
import {createWatchdogDayEnvelope} from '../client/src/features/integrations/watchdogDayEnvelope.ts';
const snapshot=()=>({companyId:'companyA',storeId:'shopA',sales:[{
 id:'sale1',businessProfileId:'companyA',staffId:'staff1',shiftId:'shift1',createdAt:'2026-10-24T12:00:00Z',currency:'GHS',totalMinor:2000,amountPaidMinor:2000,outstandingMinor:0,discountMinor:100,paymentMethod:'mobile',receiptNumber:'R-001'}],payments:[{
 id:'payment1',saleId:'sale1',businessProfileId:'companyA',method:'mobile',amountMinor:2000,mobileMoneyProviderName:'MTN',mobileMoneyReference:'MTN-321'}],
 shifts:[{id:'shift1',businessProfileId:'companyA',staffId:'staff1',openedAt:'2026-10-24T08:00:00Z',closedAt:'2026-10-24T18:00:00Z',openingFloatMinor:200,countedCashMinor:100,varianceMinor:-100}],
 reversals:[],noSaleEvents:[{id:'n1',businessProfileId:'companyA',storeId:'shopA',deviceId:'dev1',staffId:'staff1',shiftId:'shift1',operationKey:'no-sale-n1',createdAt:'2026-10-24T15:00:00Z',reason:'cash_check'}]});
test('real mapper feeds daily export; shift and cash count included without invented device',()=>{
 const raw=snapshot(); const events=mapSingleStoreWatchdogEvents(raw);
 const document=createWatchdogDayEnvelope({...raw,events,dayUtc:'2026-10-24'},'2026-10-24T20:00:00Z');
 assert.equal(document.row_count,7);
 assert.deepEqual(document.events.map(e=>e.event_type).sort(),['cash_count','discount','momo','no_sale','sale','shift_close','shift_open'].sort());
 assert.equal(document.events.find(e=>e.event_type==='sale').receipt_number,'R-001');
 assert.equal(document.events.find(e=>e.event_type==='momo').momo_provider,'MTN');
 assert.equal(document.events.find(e=>e.event_type==='momo').momo_reference,'MTN-321');
 assert.equal(document.events.find(e=>e.event_type==='shift_close').amount_minor,-100);
 assert.equal(document.events.find(e=>e.event_type==='no_sale').device_id,'dev1');
 assert.equal(document.events.find(e=>e.event_type==='no_sale').provenance_verified,false);
});
test('invalid legacy sale prevents both mapper and daily export',()=>{
 const raw=snapshot();raw.sales[0].shiftId=undefined;
 assert.throws(()=>mapSingleStoreWatchdogEvents(raw),/missing staff/);
});
test('refund without reconciled original sale refuses export',()=>{
 const raw=snapshot();const events=mapSingleStoreWatchdogEvents(raw);
 const refund={id:'refund1',businessProfileId:'companyA',originalSaleId:'other',createdAt:'2026-10-24T16:00:00Z',staffId:'staff1',shiftId:'shift1',refundedMinor:300,currency:'GHS',refundMethod:'cash',originalReceiptNumber:'R-001'};
 assert.throws(()=>createWatchdogDayEnvelope({...raw,events,returns:[refund],dayUtc:'2026-10-24'}),/reconciled original/);
});
test('staff recorded cash return is a claim, never cloud settlement proof',()=>{
 const raw=snapshot();const events=mapSingleStoreWatchdogEvents(raw);
 const refund={id:'refund1',businessProfileId:'companyA',originalSaleId:'sale1',createdAt:'2026-10-24T16:00:00Z',staffId:'staff1',shiftId:'shift1',refundedMinor:300,currency:'GHS',refundMethod:'cash',originalReceiptNumber:'R-001'};
 const output=createWatchdogDayEnvelope({...raw,events,returns:[refund],dayUtc:'2026-10-24'});
 const row=output.events.find(e=>e.event_type==='refund');assert.equal(row.amount_minor,300);
 assert.match(row.reason,/independent/);assert.equal(row.received_at_utc,null);
});
