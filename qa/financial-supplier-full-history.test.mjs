import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileSupplierFinancialReport } from '../client/src/features/reports/supplierReporting.mjs';

const period = { start: new Date('2026-10-10T00:00:00Z'), end: new Date('2026-10-11T00:00:00Z') };
const purchase = { id:'P1', businessProfileId:'A', supplierId:'S1', totalCostMinor:10000, currency:'GHS', createdAt:'2026-10-08T00:00:00Z' };
function event(kind, n, amountMinor, extra={}) { return {
  id:`event-${n}`, submissionKey:`key-${n}`, purchaseId:'P1', businessProfileId:'A', supplierId:'S1', currency:'GHS',
  kind, amountMinor, createdAt:`2026-10-${String(n < 5 ? 9 : 10).padStart(2,'0')}T12:00:${String(n).padStart(2,'0')}Z`,
  ...(kind==='payment'?{method:'cash'}:{}), ...extra,
}; }
const recognition = event('recognition', 1, 10000);
const cash = event('payment', 5, 2000);
const credit = event('credit', 6, 3000);

test('a complete historical payable is reconciled as-of and cash outflows are period-only', () => {
  const result = reconcileSupplierFinancialReport([purchase],[credit,cash,recognition],period);
  assert.equal(result.complete,true);
  assert.equal(result.unknownPurchases,0);
  assert.deepEqual(result.outstandingByCurrency,[{currency:'GHS',amountMinor:5000}]);
  assert.deepEqual(result.periodPaymentsByCurrency,[{currency:'GHS',amountMinor:2000}]);
  assert.deepEqual(result.creditedToDateByCurrency,[{currency:'GHS',amountMinor:3000}]);
  assert.deepEqual(result.paidToDateByCurrency,[{currency:'GHS',amountMinor:2000}]);
  assert.deepEqual(result.recognizedByCurrency,[{currency:'GHS',amountMinor:10000}]);
});
test('credits lower payables but never pretend to be outgoing money', () => {
  const result = reconcileSupplierFinancialReport([purchase],[recognition,credit],period);
  assert.equal(result.outstandingByCurrency[0].amountMinor,7000);
  assert.deepEqual(result.periodPaymentsByCurrency,[]);
});
test('unclassified purchases remain explicitly unknown and not paid', () => {
  const legacy={ ...purchase,id:'P2', currency:undefined };
  const result=reconcileSupplierFinancialReport([purchase,legacy],[recognition],period);
  assert.equal(result.unknownPurchases,1);
  assert.equal(result.complete,false);
  assert.deepEqual(result.outstandingByCurrency,[{currency:'GHS',amountMinor:10000}]);
});
test('different saved currencies stay in separate ledgers, including period payments', () => {
  const USD={...purchase,id:'USD',currency:'USD'};
  const r={...recognition,id:'rUSD',submissionKey:'key-usd',purchaseId:'USD',currency:'USD'};
  const p={...cash,id:'pUSD',submissionKey:'pay-usd',purchaseId:'USD',currency:'USD'};
  const result=reconcileSupplierFinancialReport([USD,purchase],[p,cash,r,recognition],period);
  assert.deepEqual(result.periodPaymentsByCurrency,[{currency:'GHS',amountMinor:2000},{currency:'USD',amountMinor:2000}]);
  assert.deepEqual(result.outstandingByCurrency,[{currency:'GHS',amountMinor:8000},{currency:'USD',amountMinor:8000}]);
});
test('out-of-range payments affect as-of liability but not period outflows', () => {
  const oldCash={...cash,createdAt:'2026-10-09T14:00:00Z'};
  const result=reconcileSupplierFinancialReport([purchase],[recognition,oldCash],period);
  assert.deepEqual(result.periodPaymentsByCurrency,[]);
  assert.equal(result.outstandingByCurrency[0].amountMinor,8000);
});
test('a settlement dated before the original recognition is rejected even after sorting', () => {
  const early={...cash, createdAt:'2026-10-08T14:00:00Z'};
  assert.throws(()=>reconcileSupplierFinancialReport([purchase],[early,recognition],period),/lacks an explicit liability/);
});
test('duplicate payments, reused submission keys, and orphaned events fail closed', () => {
  for(const extra of [ {...cash}, {...cash,id:'different'}, {...cash,submissionKey:'different',purchaseId:'unknown'} ]) {
    assert.throws(()=>reconcileSupplierFinancialReport([purchase],[recognition,cash,extra],period),/duplicate|missing|orphan/);
  }
});
test('foreign company, invalid currency and invalid date fail before financial reporting', () => {
  for(const extra of [ {businessProfileId:'B'}, {currency:'USD'}, {createdAt:'invalid'} ]) {
    assert.throws(()=>reconcileSupplierFinancialReport([purchase],[recognition,{...cash,...extra}],period),/foreign|date|currency/);
  }
});
test('overpayment, unsafe totals and malformed recognized invoices are rejected', () => {
  assert.throws(()=>reconcileSupplierFinancialReport([purchase],[recognition,{...cash,amountMinor:10001}],period),/exceeds/);
  assert.throws(()=>reconcileSupplierFinancialReport([{...purchase,totalCostMinor:Number.MAX_SAFE_INTEGER+1}],[],period),/invalid/);
  assert.throws(()=>reconcileSupplierFinancialReport([purchase,purchase],[],period),/duplicate/);
});
test('safe-money accumulation refuses two individually legal currencies exceeding maximum combined', () => {
  const huge=Number.MAX_SAFE_INTEGER;
  const p2={...purchase,id:'P2',totalCostMinor:huge};
  const p1={...purchase,totalCostMinor:huge};
  const r1={...recognition,amountMinor:huge};
  const r2={...recognition,id:'R2',submissionKey:'key-r2',purchaseId:'P2',amountMinor:huge};
  assert.throws(()=>reconcileSupplierFinancialReport([p1,p2],[r1,r2],period),/safe integer|safe monetary/);
});
test('equal-timestamp recognition and settlement do not depend on IndexedDB id sort order', () => {
  const at=recognition.createdAt;
  const result=reconcileSupplierFinancialReport([purchase],[{...cash,createdAt:at},recognition],period);
  assert.equal(result.outstandingByCurrency[0].amountMinor,8000);
});

test('pure reporting cannot combine purchases belonging to separate companies', () => {
  assert.throws(() => reconcileSupplierFinancialReport([purchase,{...purchase,id:'Other',businessProfileId:'B'}],[recognition],period),/invalid|unsupported/);
});
