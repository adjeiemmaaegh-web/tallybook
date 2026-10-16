import test from 'node:test';
import assert from 'node:assert/strict';
import {currentCompanyReturnPolicy,appendCompanyReturnPolicy,
 saleReturnPolicySnapshot,authorizeReturnPolicy,validateRecordedReturnPolicy,
 validateReturnPolicyHistory} from '../returnPolicy.mjs';
const t='2026-10-16T09:00:00.000Z',later='2026-10-16T10:00:00.000Z';
const saleAt='2026-10-16T09:30:00.000Z';
const enabled={enabled:true,allowFullReversal:true,allowCashPartial:true,maxAgeDays:30};
const history=()=>appendCompanyReturnPolicy(undefined,enabled,t,'Owner permits both paths','staff-owner');
const sale=rows=>({id:'sale-1',createdAt:saleAt,returnPolicyAtSale:saleReturnPolicySnapshot(rows)});
test('unconfigured and legacy company defaults to NO refunds',()=>{
 const p=currentCompanyReturnPolicy(undefined);
 assert.equal(p.enabled,false);assert.equal(p.revision,0);
 assert.throws(()=>authorizeReturnPolicy(undefined,sale(undefined),'full',later),/does not authorize/);
});
test('owner can explicitly configure full and partial within a capped return window',()=>{
 const h=history();const p=currentCompanyReturnPolicy(h);
 assert.equal(p.enabled,true);assert.equal(p.revision,1);
 assert.equal(authorizeReturnPolicy(h,sale(h),'full',later).kind,'full');
 assert.equal(authorizeReturnPolicy(h,sale(h),'partialCash',later).kind,'partialCash');
});
test('full-only company denies physical partial cash refund but retains original policy history',()=>{
 const h=appendCompanyReturnPolicy(undefined,
  {...enabled,allowCashPartial:false},t,'Owner full-only policy');
 assert.equal(authorizeReturnPolicy(h,sale(h),'full',later).decisionPolicy.revision,1);
 assert.throws(()=>authorizeReturnPolicy(h,sale(h),'partialCash',later),/does not authorize/);
});
test('separate businesses do not inherit each other policies',()=>{
 const h=history();
 assert.throws(()=>authorizeReturnPolicy(undefined,sale(h),'full',later),
  /missing, altered or foreign/);
});
test('disabled policy requires both feature controls disabled',()=>{
 assert.throws(()=>appendCompanyReturnPolicy(undefined,
  {...enabled,enabled:false},t,'Impossible permission'),/Invalid return policy/);
});
test('enabled policy must choose at least one supported return lane',()=>{
 assert.throws(()=>appendCompanyReturnPolicy(undefined,
  {...enabled,allowFullReversal:false,allowCashPartial:false},t,'No method'),/Invalid return policy/);
});
test('company can revoke all refunds without retroactively deleting earlier policy evidence',()=>{
 const h=history();const oldSale=sale(h);
 const h2=appendCompanyReturnPolicy(h,{
  enabled:false,allowFullReversal:false,allowCashPartial:false,maxAgeDays:30
 },later,'Business no longer accepts any returns');
 assert.equal(currentCompanyReturnPolicy(h2).enabled,false);
 assert.equal(h2.length,2);assert.equal(h2[0].enabled,true);
 assert.throws(()=>authorizeReturnPolicy(h2,oldSale,'full','2026-10-16T11:00:00.000Z'),
  /does not authorize/);
});
test('sale created before owner opted in cannot retroactively gain refund entitlement',()=>{
 const oldSale=sale(undefined);
 assert.throws(()=>authorizeReturnPolicy(history(),oldSale,'full',later),/does not authorize/);
});
test('missing historical snapshot on a legacy sale is not guessed from current settings',()=>{
 assert.throws(()=>authorizeReturnPolicy(history(),{id:'old-sale',createdAt:saleAt},'full',later),
 /missing, altered or foreign/);
});
test('return age is bounded by both sale-time and current terms',()=>{
 const h=appendCompanyReturnPolicy(undefined,{...enabled,maxAgeDays:1},t,'One day');
 const old=sale(h);
 assert.throws(()=>authorizeReturnPolicy(h,old,'full','2026-10-18T09:30:01.000Z'),
 /outside the company return window/);
});
test('longer new company policy cannot expand an older short sale return promise',()=>{
 const h=appendCompanyReturnPolicy(undefined,{...enabled,maxAgeDays:1},t,'One day');
 const old=sale(h);
 const h2=appendCompanyReturnPolicy(h,enabled,later,'Allow 30 days for future sales');
 assert.throws(()=>authorizeReturnPolicy(h2,old,'full','2026-10-18T09:30:01.000Z'),
 /outside the company return window/);
});
test('new narrower current policy also constrains an old more generous sale promise',()=>{
 const h=history();const old=sale(h);
 const h2=appendCompanyReturnPolicy(h,{...enabled,maxAgeDays:1},later,'Narrow returns');
 assert.throws(()=>authorizeReturnPolicy(h2,old,'full','2026-10-18T09:30:01.000Z'),
 /outside the company return window/);
});
test('exact full refund journal records both sale and decision revision',()=>{
 const h=history();const old=sale(h);
 const policyEvidence=authorizeReturnPolicy(h,old,'full',later);
 const event={createdAt:later,policyEvidence};
 assert.deepEqual(validateRecordedReturnPolicy(h,old,event,'full'),{verified:true,legacy:false});
});
test('later owner revoke retains evidence an earlier recorded refund was authorized',()=>{
 const h=history(),old=sale(h),policyEvidence=authorizeReturnPolicy(h,old,'full',later);
 const rev=appendCompanyReturnPolicy(h,{
  enabled:false,allowFullReversal:false,allowCashPartial:false,maxAgeDays:30
 },'2026-10-16T11:00:00.000Z','Stop refunds');
 assert.deepEqual(validateRecordedReturnPolicy(rev,old,{createdAt:later,policyEvidence},'full'),
 {verified:true,legacy:false});
});
test('journal cannot claim nonexistent, future, wrong-kind or tampered policy revision',()=>{
 const h=history(),old=sale(h);
 const evidence=authorizeReturnPolicy(h,old,'full',later);
 for(const bad of [
  {...evidence,kind:'partialCash'},
  {...evidence,decisionPolicy:{...evidence.decisionPolicy,revision:999}},
  {...evidence,decisionPolicy:{...evidence.decisionPolicy,allowFullReversal:false}},
  {...evidence,authorizedAt:'2026-10-16T11:00:00.000Z'}
 ]){
  assert.throws(()=>validateRecordedReturnPolicy(h,old,
   {createdAt:later,policyEvidence:bad},'full'),/invalid|missing|match|not current/i);
 }
});
test('return journal without policy evidence is retained as LEGACY, never certified',()=>{
 assert.deepEqual(validateRecordedReturnPolicy(history(),sale(history()),
  {createdAt:later},'full'),{verified:false,legacy:true});
});
test('misordered, duplicated or truncated policy history never silently falls back to disabled',()=>{
 const h=history();
 assert.throws(()=>validateReturnPolicyHistory([...h,{...h[0]}]),/Invalid company/);
 assert.throws(()=>validateReturnPolicyHistory([{...h[0],revision:2}]),/Invalid company/);
 assert.throws(()=>validateReturnPolicyHistory({}),/Invalid company/);
});
test('policy update never changes prior revision objects in memory',()=>{
 const h=history(),before=JSON.stringify(h);
 const h2=appendCompanyReturnPolicy(h,{...enabled,maxAgeDays:14},later,'Shorter window');
 assert.equal(JSON.stringify(h),before);
 assert.equal(h2[0].revision,1);assert.equal(h2[1].revision,2);
 assert.ok(Object.isFrozen(h2));
});
test('unsafe age, extra config fields and missing owner reason are rejected',()=>{
 for(const settings of [
  {...enabled,maxAgeDays:0},{...enabled,maxAgeDays:3651},
  {...enabled,maxAgeDays:1.5},{...enabled,serviceRefund:true}
 ])assert.throws(()=>appendCompanyReturnPolicy(undefined,settings,t,'Reason'),/Invalid return policy/);
 assert.throws(()=>appendCompanyReturnPolicy(undefined,enabled,t,' '),/Invalid return policy/);
});
test('company policy must use canonical UTC and chronological revision timestamps',()=>{
 assert.throws(()=>appendCompanyReturnPolicy(undefined,enabled,'yesterday','Reason'),
 /invalid chronological/);
 assert.throws(()=>appendCompanyReturnPolicy(history(),enabled,
 '2026-10-15T09:00:00.000Z','Backdate'),/later instant/);
});
test('policy can explicitly prohibit restocking cash while permitting full correction',()=>{
 const h=appendCompanyReturnPolicy(undefined,
  {...enabled,allowCashPartial:false},t,'No partial cash returns');
 assert.equal(currentCompanyReturnPolicy(h).allowCashPartial,false);
 assert.throws(()=>authorizeReturnPolicy(h,sale(h),'partialCash',later),/does not authorize/);
});
test('unsupported return kind or recording before sale date is rejected',()=>{
 const h=history(),old=sale(h);
 assert.throws(()=>authorizeReturnPolicy(h,old,'giftCard',later),/Unsupported/);
 assert.throws(()=>authorizeReturnPolicy(h,old,'full','2026-10-16T09:00:00.000Z'),
 /cannot predate/);
});
test('a second policy revision in the identical millisecond is rejected as chronologically ambiguous',()=>{
 assert.throws(()=>appendCompanyReturnPolicy(history(),enabled,t,'Same instant'),/later instant/);
});
