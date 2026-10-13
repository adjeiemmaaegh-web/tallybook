import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertSavedSaleTenderReconciliation as audit} from '../client/src/features/reports/saleTenderReconciliation.mjs';
const sale={id:'S1', businessProfileId:'A', customerId:'C1', currency:'GHS', totalMinor:1000, amountPaidMinor:400, outstandingMinor:600, paymentMethod:'cash'};
const payment={id:'P1', saleId:'S1', businessProfileId:'A', customerId:'C1', method:'cash', amountMinor:400, createdAt:'2026-10-10T10:00:00Z'};
test('credit remaining plus at-sale cash equals saved invoice, independently of report sums',()=>assert.equal(audit([sale],[payment]),true));
test('prepaid wallet spending is not wrongly counted as fresh external tender',()=>{
 const wallet={...sale,paymentMethod:'wallet',totalMinor:500,amountPaidMinor:500,outstandingMinor:0,walletAppliedMinor:500};
 assert.equal(audit([wallet],[]),true);
 assert.throws(()=>audit([wallet],[payment]),/mismatched original tender/);
});
test('unpaid credit sale has no invented cash receipt',()=>assert.equal(audit([{...sale,amountPaidMinor:0,outstandingMinor:1000,paymentMethod:'credit'}],[]),true));
test('partial and missing payments never silently reconcile',()=>{
 assert.throws(()=>audit([sale],[]),/do not reconcile/);
 assert.throws(()=>audit([sale],[{...payment,amountMinor:399}]),/do not reconcile/);
});
test('tampered wallet, negative debt and overstated totals reject',()=>{
 for(const extra of [{walletAppliedMinor:400},{outstandingMinor:-1},{totalMinor:1001},{amountPaidMinor:Number.MAX_SAFE_INTEGER}])
   assert.throws(()=>audit([{...sale,...extra}],[payment]),/do not reconcile/);
});
test('duplicate payment identity and double-counted cash reject',()=>{
 assert.throws(()=>audit([sale],[payment,{...payment}]),/duplicated/);
 assert.throws(()=>audit([sale],[payment,{...payment,id:'P2'}]),/do not reconcile/);
});
test('wrong company, customer or payment method rejects even with exact amount',()=>{
 for(const extra of [{businessProfileId:'B'},{customerId:'C2'},{method:'card'}])
  assert.throws(()=>audit([sale],[{...payment,...extra}]),/foreign|mismatched/);
});
test('orphan payments, zero payment and malformed timestamps reject',()=>{
 for(const extra of [{saleId:'missing'},{amountMinor:0},{createdAt:'bad'}])
  assert.throws(()=>audit([sale],[{...payment,...extra}]),/orphan|invalid|mismatched/);
});
test('two companies with independent valid sales are not cross-associated',()=>{
 const second={...sale,id:'S2',businessProfileId:'B',customerId:'C2'};
 const p2={...payment,id:'P2',saleId:'S2',businessProfileId:'B',customerId:'C2'};
 assert.equal(audit([sale,second],[payment,p2]),true);
});
