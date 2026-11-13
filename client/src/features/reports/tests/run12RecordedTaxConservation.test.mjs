import test from 'node:test';
import assert from 'node:assert/strict';
import {auditRun12RecordedTaxConservation} from '../run12RecordedTaxConservation.mjs';
const at='2026-10-16T08:00:00.000Z',later='2026-10-16T09:00:00.000Z';
const sale=(id='sale1')=>({id,businessProfileId:'primary',createdAt:at,totalMinor:1100,
  tax:{taxMinor:100,taxableMinor:1000,totalMinor:1100}});
const reversal={id:'reverse1',businessProfileId:'primary',originalSaleId:'sale1',
 createdAt:later,reversedSaleTotalMinor:-1100};
const refund={id:'cash1',submissionKey:'cash-retry-1',businessProfileId:'primary',
 originalSaleId:'sale1',createdAt:later,refundedMinor:550,returnedTaxMinor:50};
const audit=(sales=[sale()],full=[],cash=[])=>auditRun12RecordedTaxConservation(sales,full,cash,'primary');
test('recorded sale tax is classified as recorded evidence, never statutory liability',()=>{
 const a=audit();assert.equal(a.grossRecordedTaxMinor,100);
 assert.equal(a.netRecordedTaxMinor,100);assert.equal(a.statutoryTaxLiabilityVerified,false);
});
test('full reversal removes original tax once',()=>{
 const a=audit([sale()],[reversal]);assert.equal(a.fullReversalTaxMinor,100);
 assert.equal(a.netRecordedTaxMinor,0);
});
test('partial cash returns conserve recorded invoice tax',()=>{
 const a=audit([sale()],[],[refund]);assert.equal(a.partialCashRefundTaxMinor,50);
 assert.equal(a.netRecordedTaxMinor,50);
});
test('historical tax absence is unknown, not zero-tax exemption',()=>{
 const a=audit([{...sale(),tax:undefined}],[],[{...refund,returnedTaxMinor:0}]);
 assert.equal(a.unknownTaxSales,1);assert.equal(a.legacyRefundTaxUnverified,1);
 assert.equal(a.recordedTaxEvidenceComplete,false);
});
test('foreign, orphan and duplicate reversals are rejected',()=>{
 for(const x of [[{...reversal,businessProfileId:'other'}],[{...reversal,originalSaleId:'missing'}],
 [reversal,{...reversal,id:'reverse2'}],[reversal,reversal]])
  assert.throws(()=>audit([sale()],x),/reversal/);
});
test('return cannot overlap full reversal or claim another business',()=>{
 assert.throws(()=>audit([sale()],[reversal],[refund]),/cash return/);
 assert.throws(()=>audit([sale()],[],[{...refund,businessProfileId:'other'}]),/cash return/);
});
test('duplicate return id or request key cannot count twice',()=>{
 assert.throws(()=>audit([sale()],[],[refund,{...refund,returnedTaxMinor:0}]),/cash return/);
 assert.throws(()=>audit([sale()],[],[refund,{...refund,id:'cash2'}]),/cash return/);
});
test('tax and refunded cash cannot exceed original invoice',()=>{
 assert.throws(()=>audit([sale()],[],[{...refund,returnedTaxMinor:101}]),/exceed/);
 assert.throws(()=>audit([sale()],[],[refund,{...refund,id:'cash2',submissionKey:'cash-retry-2',refundedMinor:551}]),/exceed/);
});
test('tax snapshot corruption and duplicate original sale fail closed',()=>{
 assert.throws(()=>audit([{...sale(),tax:{taxMinor:101,taxableMinor:1000,totalMinor:1100}}]),/snapshot/);
 assert.throws(()=>audit([sale(),sale()]),/sale/);
});
test('full history aggregates independent full and partial returns with correct net',()=>{
 const a=audit([sale('sale1'),sale('sale2'),sale('sale3')],[reversal],
  [{...refund,originalSaleId:'sale2'}]);
 assert.deepEqual([a.grossRecordedTaxMinor,a.fullReversalTaxMinor,a.partialCashRefundTaxMinor,a.netRecordedTaxMinor],
  [300,100,50,150]);
});

test('tax amounts do not certify legacy missing original policy configuration',()=>{
 const a=audit([sale()]);
 assert.equal(a.grossRecordedTaxMinor,100);
 assert.equal(a.unknownTaxConfigurationSales,1);
 assert.equal(a.recordedTaxEvidenceComplete,false);
 const configured=audit([{...sale(),taxConfigurationAtSale:{mode:'on'}}]);
 assert.equal(configured.unknownTaxConfigurationSales,0);
 assert.equal(configured.recordedTaxEvidenceComplete,true);
});
