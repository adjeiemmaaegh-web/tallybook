import test from 'node:test';
import assert from 'node:assert/strict';
import {assertRun9PurchaseCostCompleteness} from '../run9PurchaseCostAudit.mjs';
const company='primary',date='2026-10-16T10:00:00.000Z';
const purchase={id:'purchase-1',businessProfileId:company,
 totalCostMinor:600,currency:'GHS',createdAt:date};
const line={id:'line-1',businessProfileId:company,purchaseId:'purchase-1',
 productId:'rice',quantity:3,unitCostMinor:200,lineTotalMinor:600};
const movement={id:'stock-1',businessProfileId:company,purchaseId:'purchase-1',
 productId:'rice',movementType:'purchase',quantityDelta:3,
 previousQuantity:2,resultingQuantity:5,createdAt:date};
const receipt={id:'receipt-1',businessProfileId:company,purchaseId:'purchase-1',
 productId:'rice',kind:'receipt',unitCostMinor:200,quantityDelta:3,
 sourceId:'stock-1',createdAt:date};
const run=(overrides={})=>assertRun9PurchaseCostCompleteness({
 purchases:[purchase],purchaseLines:[line],movements:[movement],
 events:[receipt],company,expectedCurrency:'GHS',...overrides
});
test('exact supplier price matches FIFO receipt and physical stock transaction',()=>{
 assert.deepEqual(run(),{verifiedPurchases:1,legacyUnverifiedPurchases:0});
});
test('historical purchase without any saved cost events stays explicitly unverified',()=>{
 assert.deepEqual(run({events:[]}),{verifiedPurchases:0,legacyUnverifiedPurchases:1});
});
test('receipt unit cost must equal the immutable purchase line cost',()=>{
 assert.throws(()=>run({events:[{...receipt,unitCostMinor:250}]}),/unit cost or physical/);
});
test('purchase receipt must match invoice quantity',()=>{
 assert.throws(()=>run({events:[{...receipt,quantityDelta:2}]}),/unit cost or physical/);
});
test('purchase stock movement source cannot be switched to another transaction',()=>{
 assert.throws(()=>run({events:[{...receipt,sourceId:'other'}]}),/unit cost or physical/);
});
test('supplier currency must match company reporting currency when cost is claimed',()=>{
 assert.throws(()=>run({purchases:[{...purchase,currency:'USD'}]}),/currency/);
 assert.throws(()=>run({purchases:[{...purchase,currency:undefined}]}),/currency/);
});
test('invoice total and each line product cost must reconcile as safe integers',()=>{
 assert.throws(()=>run({purchases:[{...purchase,totalCostMinor:700}]}),/invoice total/);
 assert.throws(()=>run({purchaseLines:[{...line,lineTotalMinor:999}]}),/supplier line cost/);
});
test('partial purchase cost evidence is not certified as an entire multi-line purchase',()=>{
 const extra={...line,id:'line-2',productId:'beans',quantity:1,
 unitCostMinor:100,lineTotalMinor:100};
 const newPurchase={...purchase,totalCostMinor:700};
 assert.throws(()=>run({purchases:[newPurchase],purchaseLines:[line,extra]}),
  /missing or duplicated receipt layers/);
});
test('cost event referencing missing purchase is rejected',()=>{
 assert.throws(()=>run({events:[{...receipt,purchaseId:'orphan'}]}),/unlinked or invalid/);
});
test('stock movement referencing another purchase is rejected',()=>{
 assert.throws(()=>run({movements:[{...movement,purchaseId:'orphan'}]}),
  /orphaned physical/);
});
test('receipt created at different time cannot be used to verify supplier cost',()=>{
 assert.throws(()=>run({events:[{...receipt,createdAt:'2026-10-17T10:00:00.000Z'}]}),
  /unit cost or physical/);
});
test('reused physical stock movement and cost identities cannot double-claim',()=>{
 assert.throws(()=>run({movements:[movement,movement]}),/duplicate stock/);
 assert.throws(()=>run({events:[receipt,receipt]}),/duplicate cost/);
});
test('duplicate product lines for one invoice are not silently accepted',()=>{
 const second={...line,id:'second'};
 assert.throws(()=>run({purchaseLines:[line,second],purchases:[
  {...purchase,totalCostMinor:1200}]}),/repeats a product/);
});
test('foreign supplier purchase or stock movement is rejected',()=>{
 assert.throws(()=>run({purchases:[{...purchase,businessProfileId:'other'}]}),
  /invalid or repeated/);
 assert.throws(()=>run({movements:[{...movement,businessProfileId:'other'}]}),
  /orphaned physical/);
});
test('safe-integer overflow cannot be masked by a later offsetting invoice line',()=>{
 const huge={...line,id:'huge',productId:'rice',unitCostMinor:Number.MAX_SAFE_INTEGER,
  quantity:1,lineTotalMinor:Number.MAX_SAFE_INTEGER};
 const second={...line,id:'second',productId:'beans',quantity:1,
  unitCostMinor:1,lineTotalMinor:1};
 assert.throws(()=>run({purchaseLines:[huge,second],
  purchases:[{...purchase,totalCostMinor:Number.MAX_SAFE_INTEGER}]}),
  /integer cost total overflow/);
});
