import test from 'node:test';
import assert from 'node:assert/strict';
import {mapSingleStoreWatchdogEvents,serializeSingleStoreWatchdogCsv} from '../client/src/features/integrations/watchdogEventMapper.ts';
const sample=()=>({ companyId:'acme',storeId:'shop1',sales:[{id:'s1',businessProfileId:'acme',staffId:'alice',shiftId:'sh1',createdAt:'2026-01-20T12:00:00Z',currency:'GHS',totalMinor:1000,amountPaidMinor:1000,outstandingMinor:0,discountMinor:150,paymentMethod:'mobile'}],payments:[{id:'p1',saleId:'s1',businessProfileId:'acme',method:'mobile',amountMinor:1000,mobileMoneyReference:'ref1'}],shifts:[{id:'sh1',businessProfileId:'acme',staffId:'alice',openedAt:'2026-01-20T08:00:00Z',closedAt:'2026-01-20T18:00:00Z',varianceMinor:-50}],reversals:[]});
test('single-store sale, discount, momo and shift export carry exact provenance',()=>{const x=sample();const events=mapSingleStoreWatchdogEvents(x);assert.equal(events.length,4);assert.deepEqual(events.map(e=>e.eventType).sort(),['discount','momo','sale','shift_close']);const csv=serializeSingleStoreWatchdogCsv(x);assert.match(csv,/ref1/);assert.match(csv,/shop1/);assert.match(csv,/shift_close/);});
test('company switching evidence fails closed',()=>{const x=sample();x.payments[0].businessProfileId='other';assert.throws(()=>serializeSingleStoreWatchdogCsv(x),/Cross-company/);});
test('missing staff, shifts and currency cannot be invented',()=>{for(const field of ['staffId','shiftId','currency']){const x=sample();delete x.sales[0][field];assert.throws(()=>serializeSingleStoreWatchdogCsv(x),/missing staff, shift, or currency/);}});
test('missing and duplicate MoMo references are rejected',()=>{let x=sample();x.payments[0].mobileMoneyReference='';assert.throws(()=>serializeSingleStoreWatchdogCsv(x),/lacks verified reference/);x=sample();x.payments.push({...x.payments[0],id:'p2'});assert.throws(()=>serializeSingleStoreWatchdogCsv(x),/Duplicate Mobile Money reference/);});
test('sale-to-shift timing is checked',()=>{const x=sample();x.sales[0].createdAt='2026-01-20T06:00:00Z';assert.throws(()=>serializeSingleStoreWatchdogCsv(x),/valid staff shift/);});
test('financial conservation fails closed',()=>{const x=sample();x.sales[0].outstandingMinor=15;assert.throws(()=>serializeSingleStoreWatchdogCsv(x),/Unreconciled sale/);});
test('reversal is a void, never represented as completed customer refund',()=>{const x=sample();x.reversals=[{id:'r1',businessProfileId:'acme',originalSaleId:'s1',createdAt:'2026-01-20T13:00:00Z',staffId:'alice',shiftId:'sh1'}];const csv=serializeSingleStoreWatchdogCsv(x);assert.match(csv,/Accounting reversal/);assert.doesNotMatch(csv,/refund_settled/);});
test('formula injection in MoMo reference is escaped',()=>{const x=sample();x.payments[0].mobileMoneyReference='=1+1';const csv=serializeSingleStoreWatchdogCsv(x);assert.ok(csv.includes("'=1+1"));});

test('orphan, duplicate and wrong-amount tender postings fail closed',()=>{
 let x=sample();x.payments[0].saleId='missing';assert.throws(()=>serializeSingleStoreWatchdogCsv(x),/no matching sale/);
 x=sample();x.payments[0].amountMinor=999;assert.throws(()=>serializeSingleStoreWatchdogCsv(x),/does not reconcile/);
 x=sample();x.payments.push({...x.payments[0],id:'p2',mobileMoneyReference:'ref2'});assert.throws(()=>serializeSingleStoreWatchdogCsv(x),/does not reconcile/);
});
test('void actor cannot be guessed from original cashier',()=>{const x=sample();x.reversals=[{id:'r1',businessProfileId:'acme',originalSaleId:'s1',createdAt:'2026-01-20T13:00:00Z'}];assert.throws(()=>serializeSingleStoreWatchdogCsv(x),/lacks authoritative staff/);});
