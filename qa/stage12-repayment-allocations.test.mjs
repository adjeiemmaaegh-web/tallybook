import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileCreditLedger, reconcileRepaymentAllocations } from '../client/src/features/sales/creditLedger.mjs';
import { assertDebtReversalIsUnallocatedPaymentSafe } from '../client/src/features/sales/reversalDebtGuard.mjs';

const sale = (id, amount = 100, customerId = 'alice', businessProfileId = 'gh') => ({id, customerId, businessProfileId, currency:'GHS', outstandingMinor: amount});
const payment = (id, amountMinor, parts, customerId='alice', businessProfileId='gh') => ({id, amountMinor, customerId, businessProfileId, currency:'GHS', ...(parts === undefined ? {} : {saleAllocations:parts})});
const part = (saleId, amountMinor) => ({saleId, amountMinor});
const a=sale('a',100), b=sale('b',250);

test('explicit allocations make a different entirely unpaid sale safely reversible',()=>{
  const rep=payment('r1',50,[part('a',50)]);
  assert.deepEqual(reconcileCreditLedger([a,b],[],[rep]),{salesOutstandingMinor:350,repaidMinor:50,outstandingMinor:300});
  assert.doesNotThrow(()=>assertDebtReversalIsUnallocatedPaymentSafe(b,[a,b],[],[rep]));
  assert.throws(()=>assertDebtReversalIsUnallocatedPaymentSafe(a,[a,b],[],[rep]),/linked repayments/);
});
test('split allocations to two saved sales reconcile exactly',()=>{
  const entries=[payment('r1',140,[part('a',60),part('b',80)]), payment('r2',40,[part('a',40)])];
  const result=reconcileRepaymentAllocations([a,b],[],entries);
  assert.equal(result.unallocatedMinor,0);
  assert.deepEqual([...result.allocatedBySale.entries()], [['a',100],['b',80]]);
  assert.equal(reconcileCreditLedger([a,b],[],entries).outstandingMinor,170);
});
test('unallocated historical repayment remains unknown even with new allocated payments',()=>{
  const records=[payment('old',20),payment('new',35,[part('a',35)])];
  assert.equal(reconcileRepaymentAllocations([a,b],[],records).unallocatedMinor,20);
  assert.throws(()=>assertDebtReversalIsUnallocatedPaymentSafe(b,[a,b],[],records),/not linked to individual sales/);
});
test('a zero-outstanding sale is not a valid target for allocated repayment',()=>{
  assert.throws(()=>reconcileCreditLedger([sale('zero',0)],[],[payment('r',1,[part('zero',1)])]),/exceed/);
});
test('duplicate sale targets within one repayment fail',()=>{
  assert.throws(()=>reconcileCreditLedger([a,b],[],[payment('r',40,[part('a',20),part('a',20)])]),/duplicate/);
});
test('allocated amount must equal immutable paid amount, including no unallocated remainder',()=>{
  for (const amount of [29,31,0])
    assert.throws(()=>reconcileCreditLedger([a],[],[payment('r',30,[part('a',amount)])]),/sum|invalid/i);
});
test('refuse allocations that exceed original sale credit even if aggregate customer debt can cover them',()=>{
  assert.throws(()=>reconcileCreditLedger([a,b],[],[payment('r',120,[part('a',120)])]),/exceed/);
});
test('refuse cumulative overspend of one sale across distinct payments',()=>{
  assert.throws(()=>reconcileCreditLedger([a,b],[],[payment('1',70,[part('a',70)]),payment('2',31,[part('a',31)])]),/exceed/);
});
test('refuse allocation to a different customer or business',()=>{
  assert.throws(()=>reconcileCreditLedger([a,b],[],[payment('r',50,[part('a',50)],'bob')]),/foreign|identities/);
  assert.throws(()=>reconcileCreditLedger([a,b],[],[payment('r',50,[part('a',50)],'alice','other')]),/foreign|identities/);
});
test('refuse missing sale targets and a stale allocation after full reversal',()=>{
  assert.throws(()=>reconcileCreditLedger([a,b],[],[payment('r',50,[part('missing',50)])]),/missing/);
  const rev={originalSaleId:'a',customerId:'alice',businessProfileId:'gh',reversedOutstandingMinor:-100};
  assert.throws(()=>reconcileCreditLedger([a,b],[rev],[payment('r',50,[part('a',50)])]),/reversed/);
});
test('refuse invalid shape, absent entries, excessive entry count and zero amount',()=>{
  const bad=[null,[],{},[part('a',0)],[part('a',1.5)],Array.from({length:257},()=>part('a',1))];
  for (const entries of bad) assert.throws(()=>reconcileRepaymentAllocations([a,b],[],[payment('r',50,entries)]),/allocation/i);
  assert.throws(()=>reconcileRepaymentAllocations([a,b],[],[payment('r',0,[part('a',0)])]),/allocation/i);
});
test('refuse unsafe amounts, negative payments and cumulative overflow',()=>{
  for (const amount of [-1,0.1,Infinity,Number.MAX_SAFE_INTEGER+1])
    assert.throws(()=>reconcileRepaymentAllocations([a,b],[],[payment('r',amount,[part('a',10)])]));
  assert.throws(()=>reconcileRepaymentAllocations([sale('large',Number.MAX_SAFE_INTEGER)],[],[
    payment('r1',Number.MAX_SAFE_INTEGER,[part('large',Number.MAX_SAFE_INTEGER)]),payment('r2',1,[part('large',1)])
  ]),/exceed/);
});
test('future credit can be extended against exact allocated balances',()=>{
  const entries=[payment('r1',100,[part('a',100)]),payment('r2',250,[part('b',250)])];
  assert.equal(reconcileCreditLedger([a,b],[],entries).outstandingMinor,0);
});
test('unallocated full-reversal guard remains fail-closed',()=>{
  assert.throws(()=>assertDebtReversalIsUnallocatedPaymentSafe(b,[a,b],[],[payment('old',15)]),/not linked/);
});
