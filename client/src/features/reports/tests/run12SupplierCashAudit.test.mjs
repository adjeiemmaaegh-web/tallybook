import test from 'node:test';
import assert from 'node:assert/strict';
import {auditRun12SupplierCashConservation} from '../run12SupplierCashAudit.mjs';
const report=()=>({
 recognizedByCurrency:[{currency:'GHS',amountMinor:10000}],
 paidToDateByCurrency:[{currency:'GHS',amountMinor:3000}],
 creditedToDateByCurrency:[{currency:'GHS',amountMinor:1000}],
 outstandingByCurrency:[{currency:'GHS',amountMinor:6000}],
 periodPaymentsByCurrency:[{currency:'GHS',amountMinor:2000}],
 unknownPurchases:1,complete:false
});
const summary=()=>({collectionsMinor:20000,expensesMinor:4000,
 netRecordedCashMovementMinor:16000});
const audit=(s=summary(),r=report(),currency='GHS')=>
 auditRun12SupplierCashConservation(s,r,currency);
test('supplier payment is subtracted exactly once from customer collections less expenses',()=>{
 const x=audit();assert.equal(x.localSupplierPaymentsMinor,2000);
 assert.equal(x.collectionsLessExpensesAndLocalSupplierPaymentsMinor,14000);
});
test('supplier credits reduce payable but never appear as cash tender',()=>{
 const x=audit();assert.equal(x.localSupplierPaymentsMinor,2000);
 assert.equal(x.unknownSupplierLiabilityPurchases,1);
});
test('foreign supplier payments remain separately reported, not converted',()=>{
 const r=report();for(const field of ['recognizedByCurrency','paidToDateByCurrency',
 'creditedToDateByCurrency','outstandingByCurrency','periodPaymentsByCurrency'])
  r[field].push({currency:'USD',amountMinor:field==='recognizedByCurrency'?300:
   field==='paidToDateByCurrency'?100:field==='outstandingByCurrency'?200:
   field==='periodPaymentsByCurrency'?100:0});
 const x=audit(summary(),r);
 assert.equal(x.localSupplierPaymentsMinor,2000);
 assert.deepEqual(x.foreignCurrencySupplierPayments,[{currency:'USD',amountMinor:100}]);
 assert.equal(x.foreignSupplierPaymentsExcluded,true);
});
test('supplier recognized equals paid plus credit plus due',()=>{
 const r=report();r.outstandingByCurrency[0].amountMinor=5999;
 assert.throws(()=>audit(summary(),r),/does not conserve/);
});
test('period supplier payments cannot exceed all saved manual payments',()=>{
 const r=report();r.periodPaymentsByCurrency[0].amountMinor=3001;
 assert.throws(()=>audit(summary(),r),/exceeds saved lifetime/);
});
test('duplicate currency evidence is not silently aggregated',()=>{
 const r=report();r.periodPaymentsByCurrency.push({currency:'GHS',amountMinor:100});
 assert.throws(()=>audit(summary(),r),/duplicates/);
});
test('invalid currency and unsafe amounts reject',()=>{
 assert.throws(()=>audit(summary(),report(),'ghs'),/exact company currency/);
 const r=report();r.paidToDateByCurrency[0].amountMinor=1.5;
 assert.throws(()=>audit(summary(),r),/duplicates or unsafe/);
});
test('collections and recorded expenses must independently reconcile',()=>{
 const s=summary();s.netRecordedCashMovementMinor=16001;
 assert.throws(()=>audit(s),/do not reconcile/);
});
test('negative consolidated cash movement is permitted when saved outflows exceed collections',()=>{
 const s=summary();s.collectionsMinor=1000;s.expensesMinor=4000;
 s.netRecordedCashMovementMinor=-3000;
 assert.equal(audit(s).collectionsLessExpensesAndLocalSupplierPaymentsMinor,-5000);
});
test('unknown supplier liability never becomes an assumed paid balance',()=>{
 const x=audit();assert.equal(x.supplierLiabilityComplete,false);
 assert.equal(x.unknownSupplierLiabilityPurchases,1);
});
