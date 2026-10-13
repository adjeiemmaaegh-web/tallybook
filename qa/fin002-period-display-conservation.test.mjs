import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertFinancialPostingDates, reconcileFinancialPeriodDisplay} from '../client/src/features/reports/financialPeriodConservation.mjs';
const d1='2026-10-10T11:00:00.000Z',d2='2026-10-11T11:00:00.000Z';
const source={
  sales:[{id:'s1',totalMinor:1000,createdAt:d1},{id:'s2',totalMinor:200,createdAt:d1}],
  payments:[{amountMinor:600,createdAt:d1},{amountMinor:200,createdAt:d1}],
  repayments:[{amountMinor:200,createdAt:d2}],
  reversals:[{originalSaleId:'s2',reversedSaleTotalMinor:-200,reversedReceivedMinor:-200,createdAt:d2}],
  refunds:[{refundedMinor:100,createdAt:d2}],
  walletTransfers:[{kind:'deposit',amountMinor:500,createdAt:d1},{kind:'refund',amountMinor:100,createdAt:d2}],
  expenses:[{createdAt:d1,expenseDate:'2026-10-10',amountMinor:80,category:'rent'},{createdAt:d2,expenseDate:'2026-10-11',amountMinor:20,category:'rent'}]
};
const original=new Map([['s2',{walletAppliedMinor:0}]]);
const totals={revenue:900,collections:1100,expenses:100};
test('independently conserves saved sales, reversed tenders, cash refunds, wallet deposits, repayments and expenses by day',()=>{
  const output=reconcileFinancialPeriodDisplay(source,original,totals);
  assert.deepEqual(output.daily,[
    {day:'2026-10-10',revenueMinor:1200,collectionsMinor:1300,expensesMinor:80},
    {day:'2026-10-11',revenueMinor:-300,collectionsMinor:-200,expensesMinor:20}
  ]);
  assert.deepEqual(output.expenseByCategory,[{category:'rent',amountMinor:100}]);
  assert.deepEqual(source.sales.map(s=>s.totalMinor),[1000,200]);
});
test('reversal of stored wallet spending does not invent a cash refund or collection',()=>{
  const result=reconcileFinancialPeriodDisplay({reversals:[{...source.reversals[0],reversedReceivedMinor:-400}]},new Map([['s2',{walletAppliedMinor:400}]]),{revenue:-200,collections:0,expenses:0});
  assert.equal(result.daily[0].collectionsMinor,0);
});
test('rejects a daily report that does not reconcile to the headline totals',()=>{
  for(const field of ['revenue','collections','expenses']) {
    assert.throws(()=>reconcileFinancialPeriodDisplay(source,original,{...totals,[field]:totals[field]+1}),/does not reconcile/);
  }
});
test('rejects unsafe daily intermediate even when later reversals would cancel it',()=>{
  const huge=5_000_000_000_000_000;
  assert.throws(()=>reconcileFinancialPeriodDisplay({sales:[{createdAt:d1,totalMinor:huge},{createdAt:d1,totalMinor:huge}],reversals:[{createdAt:d1,originalSaleId:'s1',reversedSaleTotalMinor:-huge,reversedReceivedMinor:0}]},new Map([['s1',{walletAppliedMinor:0}]]),{revenue:huge,collections:0,expenses:0}),/safe monetary precision/);
});
test('rejects unsafe category totals and invalid individual minor values',()=>{
  assert.throws(()=>reconcileFinancialPeriodDisplay({expenses:[{createdAt:d1,expenseDate:'2026-10-10',amountMinor:Number.MAX_SAFE_INTEGER,category:'rent'},{createdAt:d2,expenseDate:'2026-10-11',amountMinor:1,category:'rent'}]},new Map(),{revenue:0,collections:0,expenses:0}),/safe monetary precision/);
  assert.throws(()=>reconcileFinancialPeriodDisplay({refunds:[{createdAt:d1,refundedMinor:Number.MAX_SAFE_INTEGER+1}]},new Map(),{revenue:0,collections:0,expenses:0}),/unsafe monetary/);
});
test('rejects malformed full-history timestamps even for records outside the requested reporting period',()=>{
  for(const group of ['sales','payments','repayments','reversals','cashReturns','walletTransfers']) {
    assert.throws(()=>assertFinancialPostingDates({[group]:[{createdAt:'not-a-date'}]}),/invalid original posting date/);
    assert.throws(()=>assertFinancialPostingDates({[group]:[{createdAt:null}]}),/invalid original posting date/);
  }
});
test('rejects impossible and normalized historical expense calendar dates',()=>{
  for(const expenseDate of ['2026-02-30','2026-13-01','2026-10-00','2026-2-1','not-a-date','2026-02-29'])
    assert.throws(()=>assertFinancialPostingDates({expenses:[{expenseDate,createdAt:d1}]}),/invalid original posting date/);
  assert.equal(assertFinancialPostingDates({expenses:[{expenseDate:'2024-02-29',createdAt:d1}]}),true);
});
test('does not require same-day receipts and sales; accepts legitimate cross-period postings',()=>{
  const result=reconcileFinancialPeriodDisplay({payments:[{createdAt:d2,amountMinor:250}]},new Map(),{revenue:0,collections:250,expenses:0});
  assert.equal(result.daily[0].day,'2026-10-11');
  assert.equal(result.daily[0].collectionsMinor,250);
});
test('rejects missing original reversal and invalid prepaid kind or expense category',()=>{
  assert.throws(()=>reconcileFinancialPeriodDisplay({reversals:source.reversals},new Map(),{revenue:0,collections:0,expenses:0}),/no original sale/);
  assert.throws(()=>reconcileFinancialPeriodDisplay({walletTransfers:[{kind:'unknown',amountMinor:30,createdAt:d1}]},new Map(),{revenue:0,collections:0,expenses:0}),/kind is invalid/);
  assert.throws(()=>reconcileFinancialPeriodDisplay({expenses:[{createdAt:d1,expenseDate:'2026-10-10',amountMinor:1,category:''}]},new Map(),{revenue:0,collections:0,expenses:0}),/category is invalid/);
});

test('rejects dates that Date.parse silently rolls into a different calendar month',()=>{
  for(const posting of ['2026-02-30T12:00:00Z','2026-11-31T00:00:00.000Z','2025-02-29T23:59:59+00:00','2026-04-31T09:00:00']) {
    assert.ok(Number.isFinite(Date.parse(posting)), 'test must exercise a normalized Date.parse value');
    assert.throws(()=>assertFinancialPostingDates({sales:[{createdAt:posting}]}),/invalid original posting date/);
  }
});
test('rejects locale-dependent timestamp syntax and impossible clock and zone values',()=>{
  for(const createdAt of ['Oct 12, 2026','2026/10/12 12:00','2026-10-12','2026-10-12T24:00:00Z','2026-10-12T12:60:00Z','2026-10-12T12:00:60Z','2026-10-12T12:00:00+15:00','2026-10-12T12:00:00+14:01','2026-10-12T12:00:00-00:60'])
    assert.throws(()=>assertFinancialPostingDates({payments:[{createdAt}]}),/invalid original posting date/);
});
test('accepts real leap dates, local legacy ISO time, ISO fractions and standard time zones',()=>{
  for(const createdAt of ['2024-02-29T00:00:00.000Z','2026-10-12T12:00:00','2026-10-12T12:01','2026-10-12T12:00:00.123456Z','2026-10-12T12:00:00+05:30','2026-10-12T12:00:00-04:00'])
    assert.equal(assertFinancialPostingDates({sales:[{createdAt}]}),true);
});
test('rejects missing or invalid expense creation timestamps even if expenseDate is valid',()=>{
  for(const createdAt of [undefined, null, '2026-02-30T12:00:00.000Z', '2026-10-12T24:00:00Z'])
    assert.throws(()=>assertFinancialPostingDates({expenses:[{expenseDate:'2026-10-10',createdAt}]}),/invalid original posting date/);
  assert.equal(assertFinancialPostingDates({expenses:[{expenseDate:'2026-10-10',createdAt:'2026-10-11T12:00:00.000Z'}]}),true);
});
test('independent daily allocator fails closed on malformed dates, not only its parent report',()=>{
  assert.throws(()=>reconcileFinancialPeriodDisplay({sales:[{createdAt:'2026-02-30T12:00:00Z',totalMinor:100}]},new Map(),{revenue:100,collections:0,expenses:0}),/invalid original posting date/);
  assert.throws(()=>reconcileFinancialPeriodDisplay({refunds:[{createdAt:'2026-02-30T12:00:00Z',refundedMinor:100}]},new Map(),{revenue:-100,collections:-100,expenses:0}),/invalid original posting date/);
});
