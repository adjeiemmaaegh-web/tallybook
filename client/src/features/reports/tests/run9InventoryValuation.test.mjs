import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeRun9InventoryValuation} from '../run9InventoryValuation.mjs';
const rice={id:'rice',stockQuantity:5,costPriceMinor:999};
const known={historyAvailable:true,quantity:5,knownValueMinor:800,unknownCostUnits:0};
const riceOnly=(state=known)=>summarizeRun9InventoryValuation([rice],[state]);
test('fully reconstructed FIFO cost is complete without current editable product price',()=>{
 assert.deepEqual(riceOnly(),{
  knownValueMinor:800,unknownCostUnits:0,unverifiedProducts:0,
  trackedProducts:1,complete:true,totalValueMinor:800
 });
});
test('unknown historical receipt costs remain unknown instead of using current price',()=>{
 const v=riceOnly({...known,knownValueMinor:300,unknownCostUnits:2});
 assert.equal(v.knownValueMinor,300);assert.equal(v.unknownCostUnits,2);
 assert.equal(v.complete,false);
 assert.equal(v.totalValueMinor,undefined);
});
test('legacy positive stock without any cost history is explicitly unverified',()=>{
 const v=riceOnly(null);
 assert.deepEqual(v,{knownValueMinor:0,unknownCostUnits:5,
  unverifiedProducts:1,trackedProducts:1,complete:false});
});
test('zero-stock old product does not manufacture opening value or false uncertainty',()=>{
 const v=summarizeRun9InventoryValuation([{id:'old',stockQuantity:0}],[null]);
 assert.equal(v.totalValueMinor,0);
 assert.equal(v.unverifiedProducts,0);
});
test('service item cannot carry physical inventory value',()=>{
 const v=summarizeRun9InventoryValuation([{id:'svc',itemKind:'service',stockQuantity:0}],[null]);
 assert.equal(v.trackedProducts,0);
 assert.equal(v.totalValueMinor,0);
 assert.throws(()=>summarizeRun9InventoryValuation(
  [{id:'svc',itemKind:'service',stockQuantity:1}],[null]),/unsafe/);
});
test('different products add known and unknown cost components separately',()=>{
 const v=summarizeRun9InventoryValuation([rice,{id:'beans',stockQuantity:3}],[
  known,{historyAvailable:true,quantity:3,knownValueMinor:200,unknownCostUnits:1}]);
 assert.equal(v.knownValueMinor,1000);
 assert.equal(v.unknownCostUnits,1);
 assert.equal(v.unverifiedProducts,1);
 assert.equal(v.trackedProducts,2);
});
test('missing history objects, contradictory quantities or unsafe types fail closed',()=>{
 for(const state of [{...known,quantity:4},
  {...known,knownValueMinor:-1},{...known,unknownCostUnits:6},
  {...known,knownValueMinor:0.5},{...known,historyAvailable:false}]){
  assert.throws(()=>riceOnly(state),/unsafe or contradictory/);
 }
});
test('duplicated product IDs cannot double-claim a receipt balance',()=>{
 assert.throws(()=>summarizeRun9InventoryValuation([rice,{...rice}],
  [known,known]),/unsafe/);
});
test('known value totals cannot exceed JS safe integer precision',()=>{
 const b={...known,knownValueMinor:Number.MAX_SAFE_INTEGER};
 assert.throws(()=>summarizeRun9InventoryValuation([rice,{id:'beans',stockQuantity:5}],
  [b,{...known,knownValueMinor:1}]),/unsafe/);
});
test('unknown quantity accumulation also checks overflow',()=>{
 const big={id:'big',stockQuantity:Number.MAX_SAFE_INTEGER};
 const v=summarizeRun9InventoryValuation([big],[null]);
 assert.equal(v.unknownCostUnits,Number.MAX_SAFE_INTEGER);
 assert.throws(()=>summarizeRun9InventoryValuation([big,{id:'small',stockQuantity:1}],
  [null,null]),/unsafe/);
});
test('valuation summary is immutable and does not modify source objects',()=>{
 const old=structuredClone(rice),oldState=structuredClone(known);
 const v=riceOnly();
 assert.ok(Object.isFrozen(v));
 assert.deepEqual(rice,old);
 assert.deepEqual(known,oldState);
});
