const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const assert=require('node:assert/strict');
const ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');
const file=path.join(__dirname,'client/src/features/reports/financialIntelligence.ts');
const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
assert.equal(code.diagnostics?.length??0,0);
const sandboxModule={exports:{}};
vm.runInNewContext(code.outputText,{exports:sandboxModule.exports,require:(name)=>{
  if(name==='@/features/staff/staff')return {requirePermission:async()=>{}};
  if(name==='@/features/business/activeCompany')return {getActiveBusinessProfileId:()=> 'biz'};
  if(name==='@/db/TallybookDB')return {db:{}};
  throw Error('unexpected dependency '+name);
},Date,Number,Map,Set,Error,String,Array,Object}, {filename:file});
const {financialRange,summarizeFinancials}=sandboxModule.exports;
const range=financialRange('custom',new Date('2026-10-09T12:00:00'),'2026-10-09','2026-10-09');
const base={sales:[],payments:[],repayments:[],expenses:[],reversals:[]};
const transfer=(extra={})=>({id:'wt1',submissionKey:'key1',customerId:'c1',businessProfileId:'biz',kind:'deposit',amountMinor:900,createdAt:'2026-10-09T12:00:00',...extra});
test('net cash includes valid deposits minus refunds exactly once',()=>{
 const result=summarizeFinancials({...base,walletTransfers:[transfer(),transfer({id:'wt2',submissionKey:'key2',kind:'refund',amountMinor:200})]},range);
 assert.equal(result.walletNetCashMinor,700);assert.equal(result.collectionsMinor,700);assert.equal(result.daily[0].collectionsMinor,700);
});
test('rejects malformed transfer amounts and kinds',()=>{
 for(const bad of [{kind:'adjustment'},{amountMinor:-1},{amountMinor:0},{amountMinor:0.2},{amountMinor:Number.MAX_SAFE_INTEGER}])
  assert.throws(()=>summarizeFinancials({...base,walletTransfers:[transfer(bad)]},range),/invalid cash movement/);
});
test('rejects reused IDs and submission keys across selected and historical windows',()=>{
 const historic=transfer({createdAt:'2025-01-01T12:00:00'});
 for(const bad of [transfer({id:'wt1',submissionKey:'key2'}),transfer({id:'wt2',submissionKey:'key1'})])
  assert.throws(()=>summarizeFinancials({...base,walletTransfers:[historic,bad]},range),/duplicate or missing identity/);
});
test('rejects invalid historical transfers even outside selected range',()=>{
 assert.throws(()=>summarizeFinancials({...base,walletTransfers:[transfer({createdAt:'2025-01-01T12:00:00',kind:'other'})]},range),/invalid cash movement/);
});
