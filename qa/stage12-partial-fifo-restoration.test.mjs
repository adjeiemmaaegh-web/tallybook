import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planPartialCostRestoration, assertPartialCostRestoration } from '../client/src/features/inventory/partialCostRestoration.mjs';

const original = () => ({ id: 'issue-1', kind: 'issue', sourceId:'sale-stock-1', businessProfileId:'company-1',
  productId: 'product-1', saleId:'sale-1', quantityDelta:-5,
  allocations:[{receiptId:'receipt-1',quantity:2,unitCostMinor:200},{receiptId:'receipt-2',quantity:3,unitCostMinor:250}] });
const persisted = (before, qty, patch = {}) => ({id:`restored-${before}-${qty}`, kind:'reversal',
  reversesEventId:'issue-1', sourceId:`movement-${before.length}-${qty}`, businessProfileId:'company-1', productId:'product-1', saleId:'sale-1',
  ...planPartialCostRestoration(original(), before, qty), ...patch});

test('single partial return uses original FIFO receipt cost, never current cost', () => {
  const result=planPartialCostRestoration(original(),[],1);
  assert.deepEqual(result.allocations,[{receiptId:'receipt-1',quantity:1,unitCostMinor:200}]);
  assert.equal(result.remainingQuantity,4);
});
test('repeated partial returns conserve exact original receipt allocations', () => {
  const a = persisted([],1); const b = persisted([a],3); const c = persisted([a,b],1);
  assert.deepEqual(b.allocations,[{receiptId:'receipt-1',quantity:1,unitCostMinor:200},{receiptId:'receipt-2',quantity:2,unitCostMinor:250}]);
  assert.deepEqual(c.allocations,[{receiptId:'receipt-2',quantity:1,unitCostMinor:250}]);
  assert.equal(c.remainingQuantity,0);
  for (const entry of [a,b,c]) assert.equal(entry.allocations.reduce((sum,x)=>sum+x.quantity,0),entry.quantityDelta);
  assert.throws(()=>planPartialCostRestoration(original(),[a,b,c],1),/exceeds/);
});
test('original full reversal remains compatible', () => {
  const full=persisted([],5);
  assert.deepEqual(full.allocations,original().allocations);
  assert.doesNotThrow(()=>assertPartialCostRestoration(original(),[],full));
  assert.throws(()=>planPartialCostRestoration(original(),[full],1),/exceeds/);
});
test('rejects duplicate previous reversal evidence', () => {
  const a=persisted([],1);
  assert.throws(()=>planPartialCostRestoration(original(),[a,a],1),/duplicated/);
});
test('rejects duplicated restoration quantities and allocations', () => {
  const a=persisted([],1);
  assert.throws(()=>assertPartialCostRestoration(original(),[a],{...a,id:'r2',quantityDelta:2}),/cannot change/);
  assert.throws(()=>planPartialCostRestoration(original(),[{...a,allocations:[{receiptId:'receipt-2',quantity:1,unitCostMinor:250}]}],1),/alters/);
});
test('fails closed on altered or unknown FIFO unit costs', () => {
  const a=persisted([],1);
  assert.throws(()=>planPartialCostRestoration(original(),[{...a,allocations:[{receiptId:'receipt-1',quantity:1,unitCostMinor:201}]}],1),/alters/);
  const unknown={...original(),allocations:[{receiptId:'receipt-1',quantity:2},{receiptId:'receipt-2',quantity:3}]};
  assert.deepEqual(planPartialCostRestoration(unknown,[],2).allocations,[{receiptId:'receipt-1',quantity:2}]);
});
test('rejects any foreign company, product or sale in saved restoration', () => {
  const a=persisted([],1);
  for(const field of ['businessProfileId','productId','saleId','reversesEventId']){
    assert.throws(()=>planPartialCostRestoration(original(),[{...a,[field]:'other'}],1),/another issue/);
  }
});
test('rejects fractional, zero, negative and unsafe quantities', () => {
  for(const qty of [0,-1,1.5,NaN,Number.MAX_SAFE_INTEGER+1]) assert.throws(()=>planPartialCostRestoration(original(),[],qty),/quantity/);
  assert.throws(()=>planPartialCostRestoration(original(),[],6),/quantity/);
  assert.throws(()=>planPartialCostRestoration({...original(),quantityDelta:-4},[],1),/reconcile/);
  assert.throws(()=>planPartialCostRestoration({...original(),allocations:[{receiptId:'r',quantity:Number.MAX_SAFE_INTEGER},{receiptId:'r2',quantity:2}]},[],1),/reconcile/);
});
test('rejects unknown, duplicate or malformed original FIFO receipts',()=>{
  assert.throws(()=>planPartialCostRestoration({...original(),kind:'receipt'},[],1),/Original FIFO/);
  assert.throws(()=>planPartialCostRestoration({...original(),allocations:[{receiptId:'receipt-1',quantity:2,unitCostMinor:200},{receiptId:'receipt-1',quantity:3,unitCostMinor:200}]},[],1),/malformed/);
  assert.throws(()=>planPartialCostRestoration({...original(),allocations:[{receiptId:'receipt-1',quantity:2,unitCostMinor:-2},{receiptId:'receipt-2',quantity:3}]},[],1),/malformed/);
});
test('fails on wrong order or incomplete previous restore chain',()=>{
  const a=persisted([],1); const b=persisted([a],2);
  assert.throws(()=>planPartialCostRestoration(original(),[b,a],1),/alters/);
  assert.throws(()=>planPartialCostRestoration(original(),[{...b,allocations:original().allocations}],1),/alters/);
});

test('repeated event identity or movement reference cannot be posted twice',()=>{
  const a=persisted([],1);
  assert.throws(()=>assertPartialCostRestoration(original(),[a],{...a}),/cannot change/);
  const b=persisted([a],1);
  assert.throws(()=>assertPartialCostRestoration(original(),[a],{...b,sourceId:a.sourceId}),/cannot change/);
});
test('rejects missing or repeated stock movement evidence in prior return history',()=>{
  const a=persisted([],1); const b=persisted([a],1);
  assert.throws(()=>planPartialCostRestoration(original(),[{...a,sourceId:''}],1),/another issue/);
  assert.throws(()=>planPartialCostRestoration(original(),[a,{...b,sourceId:a.sourceId}],1),/another issue/);
});
