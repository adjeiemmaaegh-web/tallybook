import test from 'node:test';
import assert from 'node:assert/strict';
import {appendCompanyReturnPolicy,saleReturnPolicySnapshot,authorizeReturnPolicy}
 from '../returnPolicy.mjs';
import {auditCompanyReturnPolicyEvidence} from '../returnPolicyAudit.mjs';
const start='2026-10-16T08:00:00.000Z';
const at='2026-10-16T09:00:00.000Z';
const refund='2026-10-16T10:00:00.000Z';
const settings={enabled:true,allowFullReversal:true,allowCashPartial:true,maxAgeDays:30};
const h=appendCompanyReturnPolicy(undefined,settings,start,'Initial approval');
const company=(history=h)=>({id:'primary',returnPolicyHistory:history});
const sale={id:'sale-1',businessProfileId:'primary',createdAt:at,
 returnPolicyAtSale:saleReturnPolicySnapshot(h)};
const full={id:'full-1',businessProfileId:'primary',originalSaleId:'sale-1',
 createdAt:refund,policyEvidence:authorizeReturnPolicy(h,sale,'full',refund)};
const partial={id:'part-1',businessProfileId:'primary',originalSaleId:'sale-1',
 createdAt:refund,policyEvidence:authorizeReturnPolicy(h,sale,'partialCash',refund)};
const audit=(options={})=>auditCompanyReturnPolicyEvidence(
 options.profile??company(),
 options.sales??[sale],options.reversals??[full],
 options.partialReturns??[]
);
test('a saved full reversal proves two owner policy snapshots',()=>{
 assert.deepEqual(audit(),{verifiedRefunds:1,legacyRefunds:0,
  salesWithoutHistoricalTerms:0,activeRevision:1});
});
test('a supported partial cash return also proves its saved revision',()=>{
 const x=audit({reversals:[],partialReturns:[partial]});
 assert.equal(x.verifiedRefunds,1);
});
test('older refunds without saved return policy evidence remain unverified legacy',()=>{
 const x=audit({reversals:[{...full,policyEvidence:undefined}]});
 assert.equal(x.verifiedRefunds,0);assert.equal(x.legacyRefunds,1);
});
test('older sales without a policy snapshot are counted rather than rewritten',()=>{
 const legacy={...sale,id:'old',returnPolicyAtSale:undefined};
 const x=audit({sales:[sale,legacy]});
 assert.equal(x.salesWithoutHistoricalTerms,1);
});
test('unknown company or orphan refund evidence blocks financial report',()=>{
 assert.throws(()=>audit({reversals:[{...full,originalSaleId:'missing'}]}),
 /foreign or missing sale/);
 assert.throws(()=>audit({profile:{...company(),id:'other'}}),/foreign original sale/);
});
test('tampered refund decision settings cannot be blessed by current configuration',()=>{
 const bad={...full,policyEvidence:{
  ...full.policyEvidence,decisionPolicy:{...full.policyEvidence.decisionPolicy,
   maxAgeDays:3650}}};
 assert.throws(()=>audit({reversals:[bad]}),/missing, altered or foreign/);
});
test('sale cannot cite a return policy activated AFTER its original completion',()=>{
 const revised={...sale,createdAt:'2026-10-16T07:00:00.000Z'};
 assert.throws(()=>audit({sales:[revised]}),/became effective later/);
});
test('corrupted policy revision chain is rejected even with no refunds',()=>{
 const profile={id:'primary',returnPolicyHistory:[{...h[0],revision:2}]};
 assert.throws(()=>audit({profile,reversals:[],partialReturns:[]}),
 /Invalid company return policy/);
});
test('later owner disable preserves historical verified refund decision',()=>{
 const h2=appendCompanyReturnPolicy(h,{
  enabled:false,allowFullReversal:false,allowCashPartial:false,maxAgeDays:30
 },'2026-10-16T11:00:00.000Z','Closed return program');
 const x=audit({profile:company(h2)});
 assert.equal(x.verifiedRefunds,1);assert.equal(x.activeRevision,2);
});
test('journal with policy evidence but original sale without terms is rejected',()=>{
 const old={...sale,returnPolicyAtSale:undefined};
 assert.throws(()=>audit({sales:[old]}),/missing, altered or foreign|do not match saved company history/);
});
