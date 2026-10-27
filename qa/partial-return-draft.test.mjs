import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateSavedInvoiceMinor, planPartialSaleReturn } from '../client/src/features/sales/partialReturnPlan.mjs';
import { assertDebtReversalIsUnallocatedPaymentSafe } from '../client/src/features/sales/reversalDebtGuard.mjs';

const sale = { id:'sale-1', businessProfileId:'company-1', customerId:'customer-1', subtotalMinor: 600, discountMinor: 60,
  totalMinor:540, amountPaidMinor:340, outstandingMinor:200 };
const lines = [
  {id:'line-A',saleId:'sale-1',businessProfileId:'company-1',quantity:2,unitPriceMinor:100,lineTotalMinor:200},
  {id:'line-B',saleId:'sale-1',businessProfileId:'company-1',quantity:4,unitPriceMinor:100,lineTotalMinor:400},
];
const plan=(past,request,s=sale,l=lines)=>planPartialSaleReturn(s,l,past,request);

test('draft only: a single unit receives its fixed saved-invoice share', () => {
  const result = plan([], [{saleLineId:'line-A',quantity:1}]);
  assert.equal(result.draftAmountMinor,90);
  assert.equal(result.status,'DRAFT_ONLY_NO_FINANCIAL_OR_STOCK_POSTING');
  assert.equal(result.taxAllocationStatus,'historical-tax-unknown');
});
test('cumulative partial return is order-independent across requests', () => {
  const first = plan([], [{saleLineId:'line-B',quantity:1}]);
  const second = plan([{saleLineId:'line-B',quantity:1}], [{saleLineId:'line-B',quantity:3}]);
  assert.equal(first.draftAmountMinor + second.draftAmountMinor, 360);
  assert.equal(plan([], [{saleLineId:'line-B',quantity:4}]).draftAmountMinor, 360);
});
test('all line shares conserve the saved invoice total', () => {
  const all = plan([], [{saleLineId:'line-A',quantity:2},{saleLineId:'line-B',quantity:4}]);
  assert.equal(all.draftAmountMinor, sale.totalMinor);
  assert.equal(all.lines.reduce((sum,r)=>sum+r.allocatedMinor,0),sale.totalMinor);
});
test('ties use stable identity, not caller order', () => {
  const a = [{id:'b',lineTotalMinor:1},{id:'a',lineTotalMinor:1},{id:'c',lineTotalMinor:1}];
  assert.deepEqual(allocateSavedInvoiceMinor(2,a),allocateSavedInvoiceMinor(2,[...a].reverse()));
  assert.deepEqual(allocateSavedInvoiceMinor(2,a),{a:1,b:1,c:0});
});
test('zero-value service lines receive no monetary allocation',()=>{
  const l=[lines[0],{id:'free',saleId:sale.id,businessProfileId:sale.businessProfileId,quantity:1,unitPriceMinor:0,lineTotalMinor:0}];
  const s={...sale,subtotalMinor:200,discountMinor:20,totalMinor:180,amountPaidMinor:180,outstandingMinor:0};
  assert.equal(plan([], [{saleLineId:'free',quantity:1}],s,l).draftAmountMinor,0);
});
test('taxed snapshot kept as labelled draft, not claimed tax refund',()=>{
  const taxed={...sale,totalMinor:594,amountPaidMinor:394,tax:{totalMinor:594,taxableMinor:540,taxMinor:54}};
  const result=plan([], [{saleLineId:'line-A',quantity:2}],taxed);
  assert.equal(result.draftAmountMinor,198);
  assert.equal(result.taxAllocationStatus,'invoice-snapshot-proportional-draft');
});
test('prior returned quantities and request quantities are strictly bounded',()=>{
  assert.throws(()=>plan([{saleLineId:'line-A',quantity:2}],[{saleLineId:'line-A',quantity:1}]),/Cumulative returns exceed/);
  assert.throws(()=>plan([{saleLineId:'line-A',quantity:3}],[{saleLineId:'line-B',quantity:1}]),/history exceeds/);
  assert.throws(()=>plan([], [{saleLineId:'line-A',quantity:3}]),/quantity exceeds/);
  assert.throws(()=>plan([], [{saleLineId:'line-A',quantity:0}]),/positive integer/);
  assert.throws(()=>plan([], [{saleLineId:'line-A',quantity:1.2}]),/positive integer/);
});
test('duplicate requested rows do not allow exceeding the original quantity',()=>{
  assert.throws(()=>plan([],[{saleLineId:'line-A',quantity:2},{saleLineId:'line-A',quantity:1}]),/quantity exceeds/);
});
test('foreign, orphaned and duplicated sale lines rejected',()=>{
  assert.throws(()=>plan([],[{saleLineId:'missing',quantity:1}]),/missing or foreign/);
  assert.throws(()=>plan([],[{saleLineId:'line-A',quantity:1}],sale,[lines[0],lines[0]]),/duplicated/);
  assert.throws(()=>plan([],[{saleLineId:'line-A',quantity:1}],sale,[{...lines[0],businessProfileId:'other'},lines[1]]),/another sale\/company/);
});
test('tampered financial totals and line unit/quantity evidence rejected',()=>{
  assert.throws(()=>plan([],[{saleLineId:'line-A',quantity:1}],{...sale,amountPaidMinor:400}),/money does not reconcile/);
  assert.throws(()=>plan([],[{saleLineId:'line-A',quantity:1}],{...sale,discountMinor:700}),/money does not reconcile/);
  assert.throws(()=>plan([],[{saleLineId:'line-A',quantity:1}],sale,[{...lines[0],unitPriceMinor:90},lines[1]]),/quantities and prices/);
  assert.throws(()=>plan([],[{saleLineId:'line-A',quantity:1}],sale,[{...lines[0],lineTotalMinor:201},lines[1]]),/quantities and prices/);
});
test('unsafe integers rejected without rounding or overflow',()=>{
  assert.throws(()=>plan([],[{saleLineId:'line-A',quantity:1}],{...sale,totalMinor:Number.MAX_SAFE_INTEGER+1}),/Invalid sale total/);
  assert.throws(()=>plan([],[{saleLineId:'line-A',quantity:1}],sale,[{...lines[0],quantity: Number.MAX_SAFE_INTEGER+1},lines[1]]),/line quantity/);
  assert.throws(()=>allocateSavedInvoiceMinor(Number.MAX_SAFE_INTEGER+1,lines),/Invalid invoice amount/);
});
test('large exact integer proportional division does not round via floating point',()=>{
  const max=Number.MAX_SAFE_INTEGER;
  const shares=allocateSavedInvoiceMinor(max,[{id:'z',lineTotalMinor:max},{id:'a',lineTotalMinor:max}]);
  assert.equal(shares.z+shares.a,max);
  assert.equal(shares.a-shares.z,1);
});
test('incremental allocations telescope to exact total even with tiny rounding remainders',()=>{
  const s={...sale,subtotalMinor:3,discountMinor:2,totalMinor:1,amountPaidMinor:1,outstandingMinor:0};
  const l=[{...lines[0],quantity:3,unitPriceMinor:1,lineTotalMinor:3}];
  let total=0;
  for (let i=0;i<3;i++) total+=plan(i?[{saleLineId:'line-A',quantity:i}]:[],[{saleLineId:'line-A',quantity:1}],s,l).draftAmountMinor;
  assert.equal(total,1);
});

const credit = (saleId, outstandingMinor, createdAt='2026-10-10T10:00:00.000Z') =>
  ({id:saleId,businessProfileId:'company-1',customerId:'customer-1',currency:'GHS',outstandingMinor,createdAt});
const repayment = amountMinor => ({amountMinor,businessProfileId:'company-1',customerId:'customer-1',currency:'GHS'});
const a=credit('a',100), b=credit('b',200);
test('unallocated repayments prevent reversing the wrong unpaid credit sale',()=>{
  // Customer has 200 left in total after paying 100, but the system does not
  // know whether the payment applied to sale a, b, or both.
  const payments=[repayment(100)];
  assert.throws(()=>assertDebtReversalIsUnallocatedPaymentSafe(a,[a,b],[],payments),/not linked to individual sales/);
  assert.throws(()=>assertDebtReversalIsUnallocatedPaymentSafe(b,[a,b],[],payments),/not linked to individual sales/);
});
test('full credit reversal permitted when no repayment and ledger reconciles',()=>{
  assert.doesNotThrow(()=>assertDebtReversalIsUnallocatedPaymentSafe(a,[a,b],[],[]));
});
test('fully paid sale cannot erase any credit debt, even if customer has other repayments',()=>{
  const paid=credit('paid',0);
  assert.doesNotThrow(()=>assertDebtReversalIsUnallocatedPaymentSafe(paid,[paid,a],[],[repayment(10)]));
});
test('orphan and duplicate reversals rejected before posting',()=>{
  assert.throws(()=>assertDebtReversalIsUnallocatedPaymentSafe(a,[a,b],[{originalSaleId:'a',reversedOutstandingMinor:-100,customerId:'customer-1',businessProfileId:'company-1'}],[]),/already reversed/);
  assert.throws(()=>assertDebtReversalIsUnallocatedPaymentSafe(a,[a,b],[{originalSaleId:'missing',reversedOutstandingMinor:-10,customerId:'customer-1',businessProfileId:'company-1'}],[]),/invalid, orphaned/);
});
test('foreign sale and negative ledger balances cannot approve reversal',()=>{
  assert.throws(()=>assertDebtReversalIsUnallocatedPaymentSafe({...a,businessProfileId:'other'},[a,b],[],[]),/not part of/);
  assert.throws(()=>assertDebtReversalIsUnallocatedPaymentSafe(a,[a,b],[],[repayment(301)]),/reconciliation/);
});

// Saved invoice components remain independent and conservative across partial
// returns. These tests do not authorize ledger posting or a tax refund.
const taxPolicy = (priceMode) => ({ enabled: true, registrationStatus:'registered',
  label:'owner-configured', rateBasisPoints:1000, priceMode });
test('exclusive tax draft splits saved taxable/tax/discount pools exactly',()=>{
  const s={...sale,totalMinor:594,amountPaidMinor:394,
    tax:{policy:taxPolicy('exclusive'),taxableMinor:540,taxMinor:54,totalMinor:594}};
  const part=plan([], [{saleLineId:'line-A',quantity:1}],s);
  assert.deepEqual([part.draftAmountMinor,part.draftTaxableMinor,part.draftTaxMinor,part.draftDiscountMinor],[99,90,9,10]);
  assert.equal(part.taxPolicyVerified,true);
  assert.deepEqual([part.lines[0].taxableMinor,part.lines[0].taxMinor,part.lines[0].discountMinor],[90,9,10]);
  const all=plan([], [{saleLineId:'line-A',quantity:2},{saleLineId:'line-B',quantity:4}],s);
  assert.deepEqual([all.draftAmountMinor,all.draftTaxableMinor,all.draftTaxMinor,all.draftDiscountMinor],[594,540,54,60]);
});
test('inclusive owner tax snapshot retains original invoice total and split',()=>{
  const s={...sale,totalMinor:540,amountPaidMinor:340,
    tax:{policy:taxPolicy('inclusive'),taxableMinor:491,taxMinor:49,totalMinor:540}};
  const all=plan([], [{saleLineId:'line-A',quantity:2},{saleLineId:'line-B',quantity:4}],s);
  assert.equal(all.taxPolicyVerified,true);
  assert.deepEqual([all.draftAmountMinor,all.draftTaxableMinor,all.draftTaxMinor,all.draftDiscountMinor],[540,491,49,60]);
});
test('repeated tax-bearing returns telescope to exact original pools, including tiny remainders',()=>{
  const s={...sale,subtotalMinor:6,discountMinor:1,totalMinor:6,amountPaidMinor:6,outstandingMinor:0,
    tax:{policy:{...taxPolicy('exclusive'),rateBasisPoints:2000},taxableMinor:5,taxMinor:1,totalMinor:6}};
  const l=[{...lines[0],quantity:3,unitPriceMinor:1,lineTotalMinor:3},{...lines[1],quantity:3,unitPriceMinor:1,lineTotalMinor:3}];
  const previous=[];
  const totals={amount:0,tax:0,taxable:0,discount:0};
  for(const line of ['line-B','line-A','line-B','line-A','line-A','line-B']){
    const row={saleLineId:line,quantity:1};
    const next=plan(previous,[row],s,l);
    totals.amount+=next.draftAmountMinor;
    totals.tax+=next.draftTaxMinor;
    totals.taxable+=next.draftTaxableMinor;
    totals.discount+=next.draftDiscountMinor;
    previous.push(row);
  }
  assert.deepEqual(totals,{amount:6,tax:1,taxable:5,discount:1});
});
test('policy-free legacy tax is draft only, with explicitly unverified policy',()=>{
  const s={...sale,totalMinor:594,amountPaidMinor:394,tax:{totalMinor:594,taxableMinor:540,taxMinor:54}};
  const draft=plan([], [{saleLineId:'line-A',quantity:2}],s);
  assert.equal(draft.taxPolicyVerified,false);
  assert.equal(draft.draftTaxMinor,18);
  assert.equal(draft.status,'DRAFT_ONLY_NO_FINANCIAL_OR_STOCK_POSTING');
});
test('tampered, malformed, and inconsistent saved tax evidence is rejected',()=>{
  const original={...sale,totalMinor:594,amountPaidMinor:394,
    tax:{policy:taxPolicy('exclusive'),taxableMinor:540,taxMinor:54,totalMinor:594}};
  for(const tax of [
    {...original.tax,taxMinor:55},
    {...original.tax,taxableMinor:539},
    {...original.tax,taxMinor:1.2},
    {...original.tax,taxMinor:-1},
    {...original.tax,policy:{...taxPolicy('inclusive')}},
    {...original.tax,policy:{...taxPolicy('exclusive'),rateBasisPoints:800}},
    {...original.tax,policy:{...taxPolicy('exclusive'),registrationStatus:'unknown'}},
    {...original.tax,policy:{...taxPolicy('exclusive'),rateBasisPoints:Number.MAX_SAFE_INTEGER}},
    {...original.tax,policy:{...taxPolicy('exclusive'),enabled:false}},
  ]) assert.throws(()=>plan([], [{saleLineId:'line-A',quantity:1}],{...original,tax}),/(Invalid|do(?:es)? not reconcile|invalid)/);
});
test('full return component allocations independent of original sale-line input order',()=>{
  const s={...sale,totalMinor:594,amountPaidMinor:394,
    tax:{policy:taxPolicy('exclusive'),taxableMinor:540,taxMinor:54,totalMinor:594}};
  const request=[{saleLineId:'line-B',quantity:2},{saleLineId:'line-A',quantity:1}];
  assert.deepEqual(plan([],request,s,lines),plan([],request,s,[...lines].reverse()));
});
test('overflow of received plus debt cannot be hidden by imprecise floating point',()=>{
  const max=Number.MAX_SAFE_INTEGER;
  assert.throws(()=>plan([], [{saleLineId:'line-A',quantity:1}],
    {...sale,amountPaidMinor:max,outstandingMinor:max}),/money does not reconcile/);
});
