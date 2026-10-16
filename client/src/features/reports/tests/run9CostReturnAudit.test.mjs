import test from 'node:test';
import assert from 'node:assert/strict';
import {assertRun9ReturnCostCompleteness} from '../run9CostReturnAudit.mjs';
const issue={id:'issue-1',kind:'issue',saleId:'sale-1',
 saleLineId:'line-1',productId:'rice',quantityDelta:-2};
const restoration={id:'reversal-1',kind:'reversal',saleId:'sale-1',
 productId:'rice',reversesEventId:'issue-1',quantityDelta:2,
 createdAt:'2026-10-16T10:00:00.000Z',sourceId:'movement-1'};
const line={id:'line-1',saleId:'sale-1',productId:'rice',
 quantity:2,costEventId:'issue-1'};
const full={id:'full-1',originalSaleId:'sale-1',
 createdAt:'2026-10-16T10:00:00.000Z'};
const partial={id:'partial-1',originalSaleId:'sale-1',
 createdAt:'2026-10-16T10:00:00.000Z',
 lines:[{saleLineId:'line-1',productId:'rice',
 quantity:1,costEventId:'reversal-1',movementId:'movement-1'}]};
const run=(overrides={})=>assertRun9ReturnCostCompleteness({
 events:[issue,restoration],lines:[line],reversals:[full],cashReturns:[],...overrides});
test('valid full sale reversal requires exactly its original FIFO issue restocked',()=>{
 assert.deepEqual(run(),{restorationsVerified:1});
});
test('removing physical cost reversal from journal cannot report full COGS refund',()=>{
 assert.throws(()=>run({events:[issue]}),/missing, partial or duplicate/);
});
test('wrong restored quantity cannot pass a full reversal',()=>{
 assert.throws(()=>run({events:[issue,{...restoration,quantityDelta:1}]}),/missing, partial or duplicate/);
});
test('reversal must match the same financial posting timestamp',()=>{
 assert.throws(()=>run({events:[issue,{...restoration,createdAt:'2026-10-17T10:00:00.000Z'}]}),/missing, partial or duplicate/);
});
test('reversal for foreign sale or product cannot masquerade as stock return',()=>{
 for(const change of [{saleId:'sale-2'},{productId:'other'}])
  assert.throws(()=>run({events:[issue,{...restoration,...change}]}),/missing, partial or duplicate/);
});
test('additional partial restoration invalidates attempted full-sale reversal',()=>{
 const extra={...restoration,id:'partial-extra',quantityDelta:1,
  sourceId:'movement-extra'};
 assert.throws(()=>run({events:[issue,restoration,extra]}),/missing, partial or duplicate/);
});
test('valid partial cash return binds original sale-line and source movement',()=>{
 const good={...restoration,quantityDelta:1,saleLineId:'line-1'};
 const result=run({events:[issue,good],reversals:[],cashReturns:[partial]});
 assert.equal(result.restorationsVerified,1);
});
test('partial return missing cost event is rejected',()=>{
 assert.throws(()=>run({events:[issue],reversals:[],cashReturns:[partial]}),
  /missing or mismatched/);
});
test('duplicate partial return reference cannot double-credit the same restoration',()=>{
 const good={...restoration,quantityDelta:1,saleLineId:'line-1'};
 const duplicate={...partial,id:'partial-2'};
 assert.throws(()=>run({events:[issue,good],reversals:[],cashReturns:[partial,duplicate]}),
  /claimed by multiple/);
});
test('wrong quantity, source ID or line ID breaks partial return integrity',()=>{
 const good={...restoration,quantityDelta:1,saleLineId:'line-1'};
 for(const overrides of [{quantity:2},{movementId:'other'},{saleLineId:'other'}]){
  const ret={...partial,lines:[{...partial.lines[0],...overrides}]};
  assert.throws(()=>run({events:[issue,good],reversals:[],cashReturns:[ret]}),
   /missing or mismatched/);
 }
});
test('unreferenced cost reversal is rejected even without a full-sale document',()=>{
 assert.throws(()=>run({reversals:[],cashReturns:[]}),/orphaned FIFO/);
});
test('untracked historical sale lines keep unavailable valuation without manufactured issue',()=>{
 const saved={id:'old-line',saleId:'old-sale',productId:'rice',quantity:2};
 assert.deepEqual(run({events:[],lines:[saved],
  reversals:[{id:'old-full',originalSaleId:'old-sale',
   createdAt:'2026-10-16T10:00:00.000Z'}]}),{restorationsVerified:0});
});
test('duplicated event or sale-line ID is never accepted',()=>{
 assert.throws(()=>run({events:[issue,issue,restoration]}),/duplicate/);
 assert.throws(()=>run({lines:[line,line]}),/duplicate/);
});
test('a full and partial return for the same sale cannot both restore FIFO',()=>{
 const good={...restoration,quantityDelta:1,saleLineId:'line-1'};
 assert.throws(()=>run({events:[issue,good],cashReturns:[partial]}),/invalid or conflicting/);
});
test('reversed cost lacking original issue linkage cannot pass',()=>{
 const bad={...issue,id:'wrong',productId:'other'};
 assert.throws(()=>run({events:[bad,restoration]}),/missing or mismatched/);
});
