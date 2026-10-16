import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileSupplierPayable,reconcileSupplierPayables} from '../supplierPayables.mjs';
const purchase={id:'purchase1',businessProfileId:'primary',supplierId:'supplier1',
 currency:'GHS',totalCostMinor:1000,createdAt:'2026-10-15T09:00:00.000Z'};
const recognize={id:'rec1',submissionKey:'supplier-recognition-0001',
 businessProfileId:'primary',supplierId:'supplier1',purchaseId:'purchase1',
 currency:'GHS',kind:'recognition',amountMinor:1000,
 createdAt:'2026-10-15T09:00:00.000Z'};
const payment={...recognize,id:'pay1',submissionKey:'supplier-payment-0001',
 kind:'payment',amountMinor:400,method:'cash',createdAt:'2026-10-15T10:00:00.000Z'};
const credit={...recognize,id:'cred1',submissionKey:'supplier-credit-0001',
 kind:'credit',amountMinor:100,createdAt:'2026-10-15T11:00:00.000Z'};
test('unrecognized purchase remains UNKNOWN and never zero payable',()=>{
 assert.deepEqual(reconcileSupplierPayable(purchase,[]),{
  status:'unknown',recognizedMinor:null,paidMinor:null,creditedMinor:null,outstandingMinor:null});
});
test('recognized invoice minus manual cash and credit conserves liability',()=>{
 const x=reconcileSupplierPayable(purchase,[credit,payment,recognize]);
 assert.deepEqual(x,{status:'outstanding',recognizedMinor:1000,paidMinor:400,
 creditedMinor:100,outstandingMinor:500});
});
test('fully paid and credited invoice is settled without negative balance',()=>{
 const x=reconcileSupplierPayable(purchase,[recognize,payment,
 {...credit,amountMinor:600}]);assert.equal(x.status,'settled');
 assert.equal(x.outstandingMinor,0);
});
test('overpayment is refused rather than made a supplier asset',()=>{
 assert.throws(()=>reconcileSupplierPayable(purchase,[recognize,
 {...payment,amountMinor:1001}]),/exceeds/);
});
test('duplicate id or submission key fails closed',()=>{
 assert.throws(()=>reconcileSupplierPayable(purchase,[recognize,
 {...payment,id:'rec1'}]),/duplicate/);
 assert.throws(()=>reconcileSupplierPayable(purchase,[recognize,
 {...payment,submissionKey:'supplier-recognition-0001'}]),/duplicate/);
});
test('cross-company or wrong currency payment is refused',()=>{
 assert.throws(()=>reconcileSupplierPayable(purchase,[recognize,
 {...payment,businessProfileId:'other'}]),/foreign/);
 assert.throws(()=>reconcileSupplierPayable(purchase,[recognize,
 {...payment,currency:'USD'}]),/foreign/);
});
test('settlement cannot predate original purchase',()=>{
 assert.throws(()=>reconcileSupplierPayable(purchase,[recognize,
 {...payment,createdAt:'2026-10-14T08:00:00.000Z'}]),/malformed/);
});
test('noncanonical or impossible supplier timestamps are rejected',()=>{
 for(const createdAt of ['2026-10-15T10:00:00Z',
 '2026-10-15T10:00:00+00:00','2026-02-30T10:00:00.000Z']){
  assert.throws(()=>reconcileSupplierPayable(purchase,[recognize,
   {...payment,createdAt}]),/malformed/);
 }
});
test('supplier credit cannot falsely claim a cash tender method',()=>{
 assert.throws(()=>reconcileSupplierPayable(purchase,[recognize,
 {...credit,method:'cash'}]),/must not claim/);
});
test('recognition cannot claim bank payout or supplier credit memo',()=>{
 assert.throws(()=>reconcileSupplierPayable(purchase,[
 {...recognize,method:'bank'}]),/invalid or repeated/);
 assert.throws(()=>reconcileSupplierPayable(purchase,[
 {...recognize,reference:'bank-paid'}]),/invalid or repeated/);
});
test('missing and invalid purchase currency are not assumed from company default',()=>{
 assert.throws(()=>reconcileSupplierPayable({...purchase,currency:undefined},[]),
 /requires reconciliation/);
});
test('supplier event cannot attach unbounded reference or malformed staff identity',()=>{
 assert.throws(()=>reconcileSupplierPayable(purchase,[recognize,
 {...payment,reference:'x'.repeat(121)}]),/malformed/);
 assert.throws(()=>reconcileSupplierPayable(purchase,[recognize,
 {...payment,staffId:''}]),/malformed/);
});
test('company-wide aggregation rejects orphan payable event',()=>{
 assert.throws(()=>reconcileSupplierPayables([purchase],[{
 ...payment,purchaseId:'missing'}]),/missing purchase/);
});
test('company-wide aggregation keeps separate currencies and unknown purchases',()=>{
 const p2={...purchase,id:'purchase2',currency:'USD',supplierId:'supplier2'};
 const r2={...recognize,id:'rec2',submissionKey:'supplier-recognition-0002',
 purchaseId:'purchase2',supplierId:'supplier2',currency:'USD'};
 const x=reconcileSupplierPayables([purchase,p2],[recognize,r2,payment]);
 assert.deepEqual(x.outstandingByCurrency,[
  {currency:'GHS',amountMinor:600},{currency:'USD',amountMinor:1000}]);
 assert.equal(x.outstandingMinor,null);
});
