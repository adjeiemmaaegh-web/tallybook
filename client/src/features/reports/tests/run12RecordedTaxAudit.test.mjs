import test from 'node:test';
import assert from 'node:assert/strict';
import {auditRun12RecordedTax} from '../run12RecordedTaxAudit.mjs';
const at='2026-10-16T08:00:00.000Z',later='2026-10-16T09:00:00.000Z';
const profile={id:'primary',taxPolicy:{enabled:true}};
const sale=(id='sale1')=>({id,businessProfileId:'primary',createdAt:at,
 totalMinor:1100,tax:{taxMinor:100,taxableMinor:1000,totalMinor:1100,
 policy:{enabled:true,registrationStatus:'registered',rateBasisPoints:1000}}});
const reversal={businessProfileId:'primary',originalSaleId:'sale1',
 createdAt:later,reversedSaleTotalMinor:-1100};
const partial={businessProfileId:'primary',originalSaleId:'sale1',
 createdAt:later,refundedMinor:550,returnedTaxMinor:50};
const audit=(sales=[sale()],full=[],cash=[],p=profile)=>
 auditRun12RecordedTax(sales,full,cash,p);
test('records tax from saved sale snapshot, not current company tax setting',()=>{
 const x=audit();assert.equal(x.grossRecordedTaxMinor,100);
 assert.equal(x.netRecordedTaxMinor,100);
 assert.equal(x.statutoryTaxLiabilityVerified,false);
});
test('historical sale without a tax snapshot is unknown rather than presumed exempt',()=>{
 const x=audit([{...sale(),tax:undefined}]);
 assert.equal(x.unknownTaxSales,1);assert.equal(x.recordedTaxSales,0);
});
test('signed full reversal reduces gross recorded tax exactly once',()=>{
 const x=audit([sale()],[reversal]);
 assert.equal(x.fullReversalTaxMinor,100);assert.equal(x.netRecordedTaxMinor,0);
});
test('partial cash refund reduces saved tax using returnedTaxMinor',()=>{
 const x=audit([sale()],[],[partial]);
 assert.equal(x.partialCashRefundTaxMinor,50);assert.equal(x.netRecordedTaxMinor,50);
});
test('mixed full and partial returns from different original sales reconcile',()=>{
 const x=audit([sale(),sale('sale2')],[reversal],
  [{...partial,originalSaleId:'sale2'}]);
 assert.equal(x.grossRecordedTaxMinor,200);assert.equal(x.netRecordedTaxMinor,50);
});
test('duplicate full reversal tax is not double-counted',()=>{
 assert.throws(()=>audit([sale()],[reversal,{...reversal}]),/duplicate full reversal/);
});
test('foreign or missing original sale refund fails closed',()=>{
 assert.throws(()=>audit([sale()],[{...reversal,originalSaleId:'missing'}]),/orphan/);
 assert.throws(()=>audit([sale()],[{...reversal,businessProfileId:'other'}]),/foreign/);
});
test('corrupted tax sum or nonregistered enabled tax cannot be certified',()=>{
 assert.throws(()=>audit([{...sale(),tax:{...sale().tax,taxableMinor:999}}]),/tax snapshot/);
 assert.throws(()=>audit([{...sale(),tax:{...sale().tax,policy:{
  ...sale().tax.policy,registrationStatus:'unknown'}}}]),/tax snapshot/);
});
test('legacy refund without saved original tax stays visible but unverified',()=>{
 const x=audit([{...sale(),tax:undefined}],[reversal]);
 assert.equal(x.legacyRefundTaxUnverified,1);assert.equal(x.netRecordedTaxMinor,0);
});
test('negative saved cash refund tax fails closed',()=>{
 assert.throws(()=>audit([sale()],[],[{...partial,returnedTaxMinor:-1}]),/invalid/);
});
test('net recorded tax cannot be negative after excess cash refund tax',()=>{
 assert.throws(()=>audit([sale()],[],[{...partial,returnedTaxMinor:101}]),/does not conserve/);
});
test('tax currently off does not erase historic recorded tax',()=>{
 const x=audit([sale()],[],[],{id:'primary',taxPolicy:{enabled:false}});
 assert.equal(x.currentTaxConfigured,false);assert.equal(x.netRecordedTaxMinor,100);
});
