import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshotSaleTaxConfiguration,validateRun12SaleTaxEvidence,auditRun12SaleTaxHistory} from '../run12SaleTaxAudit.mjs';
const tax={enabled:true,registrationStatus:'registered',registrationNumber:'TEST-NO-LIVE-FILING',
 label:'Configured tax',rateBasisPoints:1250,priceMode:'exclusive'};
const on=snapshotSaleTaxConfiguration(tax);
const off=snapshotSaleTaxConfiguration();
const sale={id:'sale-1',subtotalMinor:1000,discountMinor:200,
 totalMinor:900,taxConfigurationAtSale:on,
 tax:{policy:{...tax},taxMinor:100,taxableMinor:800,totalMinor:900}};
test('unconfigured company explicitly captures tax OFF, not an inferred exemption',()=>{
 assert.deepEqual(off,{mode:'off'});
 assert.deepEqual(validateRun12SaleTaxEvidence({
  ...sale,totalMinor:800,tax:undefined,taxConfigurationAtSale:off
 }),{verified:true,legacy:false,chargedTax:false});
});
test('disabled configured policy remains OFF even with registered metadata',()=>{
 const disabled={...tax,enabled:false};
 const snapshot=snapshotSaleTaxConfiguration(disabled);
 assert.equal(snapshot.mode,'off');
 assert.equal(validateRun12SaleTaxEvidence({...sale,totalMinor:800,tax:undefined,
  taxConfigurationAtSale:snapshot}).chargedTax,false);
});
test('registered owner-supplied exclusive policy matches original invoice arithmetic',()=>{
 assert.deepEqual(validateRun12SaleTaxEvidence(sale),
  {verified:true,legacy:false,chargedTax:true});
});
test('inclusive tax uses the original tax-inclusive invoice total',()=>{
 const inc={...tax,priceMode:'inclusive'};
 const saved={...sale,subtotalMinor:900,discountMinor:0,totalMinor:900,
  taxConfigurationAtSale:snapshotSaleTaxConfiguration(inc),
  tax:{policy:inc,taxMinor:100,taxableMinor:800,totalMinor:900}};
 assert.equal(validateRun12SaleTaxEvidence(saved).chargedTax,true);
});
test('tax is rounded half-up exactly once per original invoice',()=>{
 const invoice={...sale,subtotalMinor:4,discountMinor:0,totalMinor:5,
  tax:{...sale.tax,taxMinor:1,taxableMinor:4,totalMinor:5}};
 assert.equal(validateRun12SaleTaxEvidence(invoice).verified,true);
});
test('tampered invoice tax, taxable or total does not pass the independent audit',()=>{
 for(const bad of [
  {...sale,tax:{...sale.tax,taxMinor:99}},
  {...sale,tax:{...sale.tax,taxableMinor:799}},
  {...sale,totalMinor:899},
  {...sale,tax:{...sale.tax,totalMinor:901}}
 ])assert.throws(()=>validateRun12SaleTaxEvidence(bad),/do not reconcile/);
});
test('tax-off invoice refuses hidden charged tax',()=>{
 assert.throws(()=>validateRun12SaleTaxEvidence({
  ...sale,taxConfigurationAtSale:off
 }),/tax-off/);
});
test('tax-off invoice refuses a silently enlarged total',()=>{
 assert.throws(()=>validateRun12SaleTaxEvidence({...sale,tax:undefined,
  taxConfigurationAtSale:off}),/tax-off/);
});
test('tax ON with absent invoice tax cannot masquerade as a tax-free sale',()=>{
 assert.throws(()=>validateRun12SaleTaxEvidence({...sale,tax:undefined}),
  /lacks matching/);
});
test('unknown registration is never accepted for an enabled policy',()=>{
 assert.throws(()=>snapshotSaleTaxConfiguration({
  ...tax,registrationStatus:'unknown'}),/malformed or is not registered/);
});
test('tax policy at checkout cannot be forged after sale without disagreement',()=>{
 const changed={...tax,rateBasisPoints:2000};
 assert.throws(()=>validateRun12SaleTaxEvidence({
  ...sale,taxConfigurationAtSale:snapshotSaleTaxConfiguration(changed)
 }),/lacks matching/);
});
test('changing current configuration does not rewrite old invoice tax evidence',()=>{
 const newPolicy=snapshotSaleTaxConfiguration({...tax,rateBasisPoints:2000});
 assert.equal(newPolicy.policy.rateBasisPoints,2000);
 assert.equal(validateRun12SaleTaxEvidence(sale).verified,true);
});
test('legacy sale with original tax evidence is counted unverified for CONFIGURATION',()=>{
 assert.deepEqual(validateRun12SaleTaxEvidence({...sale,taxConfigurationAtSale:undefined}),
 {verified:false,legacy:true,chargedTax:true});
});
test('legacy original tax absence is NOT automatically labelled legitimate OFF',()=>{
 assert.deepEqual(validateRun12SaleTaxEvidence({
  ...sale,totalMinor:800,tax:undefined,taxConfigurationAtSale:undefined
 }),{verified:false,legacy:true,chargedTax:false});
});
test('company history audit separates charged, explicitly off and unknown sales',()=>{
 const a={...sale};const b={...sale,id:'sale-2',tax:undefined,
  totalMinor:800,taxConfigurationAtSale:off};
 const c={...sale,id:'sale-3',taxConfigurationAtSale:undefined};
 assert.deepEqual(auditRun12SaleTaxHistory([a,b,c]),{
  configuredChargedSales:1,explicitNoTaxSales:1,legacyUnverifiedSales:1,
  totalSales:3,statutoryFilingVerified:false
 });
});
test('duplicated original sale ID cannot double count tax evidence',()=>{
 assert.throws(()=>auditRun12SaleTaxHistory([sale,sale]),/duplicate/);
});
test('unsafe amount and changed discount fail before a tax claim is published',()=>{
 assert.throws(()=>validateRun12SaleTaxEvidence({...sale,discountMinor:1100}),
 /invalid original/);
 assert.throws(()=>validateRun12SaleTaxEvidence({...sale,discountMinor:100}),
 /do not reconcile/);
});
test('forged configuration keys or no registration status are rejected',()=>{
 for(const bad of [
  {...on,override:true},{mode:'on',policy:{...tax,rateBasisPoints:10001}},
  {mode:'on',policy:{...tax,registrationStatus:'unknown'}},
  {mode:'unknown',policy:tax}
 ])assert.throws(()=>validateRun12SaleTaxEvidence({...sale,taxConfigurationAtSale:bad}),
 /malformed/);
});
test('unsafe unrepresentable exclusive invoice sum is rejected',()=>{
 const value=Number.MAX_SAFE_INTEGER;
 const bad={...sale,subtotalMinor:value,discountMinor:0,totalMinor:value,
  taxConfigurationAtSale:on,
  tax:{policy:tax,tab:0,taxableMinor:value,taxMinor:0,totalMinor:value}};
 assert.throws(()=>validateRun12SaleTaxEvidence(bad),/do not reconcile/);
});
