import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reconcileSupplierPayable, reconcileSupplierPayables} from '../client/src/features/purchases/supplierPayables.mjs';
const p = { id:'p-1', businessProfileId:'shop-A', supplierId:'supplier-A', totalCostMinor:10000, currency:'GHS' };
const row = (kind, amountMinor, n, extras={}) => ({ id:`entry-${n}`, submissionKey:`submit-${n}`, businessProfileId:p.businessProfileId, supplierId:p.supplierId, purchaseId:p.id, currency:p.currency, kind, amountMinor, createdAt:`2026-10-10T12:00:0${Math.min(n,9)}Z`, ...extras });
const r = row('recognition',10000,1);
const pay = row('payment',2000,2,{method:'mobile'});
const credit = row('credit',3000,3);
test('a stock receipt with no recognized liability is UNKNOWN, not zero debt',()=>assert.deepEqual(reconcileSupplierPayable(p,[]),{status:'unknown',recognizedMinor:null,paidMinor:null,creditedMinor:null,outstandingMinor:null}));
test('explicit liability, partial payment and supplier credit reconcile without mixing cash and credits',()=>assert.deepEqual(reconcileSupplierPayable(p,[r,pay,credit]),{status:'outstanding',recognizedMinor:10000,paidMinor:2000,creditedMinor:3000,outstandingMinor:5000}));
test('exact settlement has zero remaining liability; no implicit extra payment',()=>assert.equal(reconcileSupplierPayable(p,[r,pay,credit,row('payment',5000,4,{method:'bank'})]).status,'settled'));
test('overpayments, even from combined credits and payments, fail closed',()=>assert.throws(()=>reconcileSupplierPayable(p,[r,pay,credit,row('credit',5001,4)]),/exceeds/));
test('recognition must be for original cost, exactly once, and before settlements',()=>{assert.throws(()=>reconcileSupplierPayable(p,[{...pay,createdAt:"2026-10-10T12:00:00Z"},r]),/lacks/);assert.throws(()=>reconcileSupplierPayable(p,[{...r,amountMinor:9999}]),/recognition/);assert.throws(()=>reconcileSupplierPayable(p,[r,{...r,id:'second',submissionKey:'second-key'}]),/recognition/)});
test('rejects duplicate idempotency keys and duplicate row IDs',()=>{assert.throws(()=>reconcileSupplierPayable(p,[r,{...pay,submissionKey:r.submissionKey}]),/duplicate/);assert.throws(()=>reconcileSupplierPayable(p,[r,{...pay,id:r.id}]),/duplicate/)});
test('rejects foreign-company, purchase or supplier references',()=>{for(const item of [{businessProfileId:'shop-B'},{purchaseId:'p-2'},{supplierId:'supplier-B'}]) assert.throws(()=>reconcileSupplierPayable(p,[r,{...pay,...item}]),/foreign/)});
test('rejects invalid payment methods, credits claiming cash and unknown event types',()=>{assert.throws(()=>reconcileSupplierPayable(p,[r,{...pay,method:'crypto'}]),/method/);assert.throws(()=>reconcileSupplierPayable(p,[r,{...credit,method:'cash'}]),/tender/);assert.throws(()=>reconcileSupplierPayable(p,[r,{...pay,kind:'refund'}]),/unsupported/)});
test('rejects unsafe, zero, negative and fractional amounts',()=>{for(const amountMinor of [0,-1,1.5,Infinity,Number.MAX_SAFE_INTEGER+1]) assert.throws(()=>reconcileSupplierPayable(p,[{...r,amountMinor}]))});
test('company rollup preserves unknowns and counts only recognized liability',()=>{const another={...p,id:'p-2'};const result=reconcileSupplierPayables([p,another],[r,pay]);assert.equal(result.outstandingMinor,8000);assert.equal(result.unknownPurchases,1);assert.equal(result.complete,false)});
test('company rollup refuses orphan events, duplicate identities and overflows',()=>{assert.throws(()=>reconcileSupplierPayables([p],[{...r,purchaseId:'none'}]),/missing/);assert.throws(()=>reconcileSupplierPayables([p,p],[]),/duplicate/);assert.throws(()=>reconcileSupplierPayables([p],[r,{...pay,id:r.id}]),/duplicate/);const pBig={...p,totalCostMinor:Number.MAX_SAFE_INTEGER};assert.throws(()=>reconcileSupplierPayables([pBig,{...pBig,id:'other'}],[{...r,amountMinor:Number.MAX_SAFE_INTEGER},row('recognition',Number.MAX_SAFE_INTEGER,2,{id:'r2',submissionKey:'k2',purchaseId:'other'})]),/safe integer/)});

test('does not mix liabilities denominated in different currencies',()=>{const usd={...p,id:'usd',currency:'USD'}; const ur={...r,id:'r-usd',submissionKey:'key-usd',purchaseId:'usd',currency:'USD'};const result=reconcileSupplierPayables([p,usd],[r,ur]);assert.equal(result.outstandingMinor,null);assert.deepEqual(result.outstandingByCurrency,[{currency:'GHS',amountMinor:10000},{currency:'USD',amountMinor:10000}]);});

test('reconciliation ignores database row ordering, including equal timestamps',()=>{
  const expected=reconcileSupplierPayable(p,[r,pay,credit]);
  assert.deepEqual(reconcileSupplierPayable(p,[credit,pay,r]),expected);
  assert.deepEqual(reconcileSupplierPayable(p,[credit,{...pay,createdAt:r.createdAt},r]),expected);
  assert.deepEqual(reconcileSupplierPayables([p],[credit,pay,r]).results[0],{purchaseId:p.id,...expected});
});
