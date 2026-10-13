import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcilePrepaidLiability as reconcile } from '../client/src/features/reports/prepaidLiabilityReconciliation.mjs';
const company='shop', customer='alice';
const t0='2026-10-09T09:00:00.000Z',t1='2026-10-09T10:00:00.000Z',t2='2026-10-09T11:00:00.000Z',t3='2026-10-09T12:00:00.000Z';
const transfer=(id,kind,amountMinor,when)=>({id,businessProfileId:company,customerId:customer,kind,amountMinor,currency:'GHS',method:'cash',reference:id,submissionKey:`submit-${id}`,benefitEntryId:`b-${id}`,createdAt:when});
const sale={id:'sale1',businessProfileId:company,customerId:customer,paymentMethod:'wallet',walletAppliedMinor:400,amountPaidMinor:400,currency:'GHS',createdAt:t1};
const reversal={id:'reverse1',businessProfileId:company,customerId:customer,originalSaleId:'sale1',createdAt:t3};
const deposit=transfer('deposit','deposit',1000,t0),refund=transfer('refund','refund',200,t2);
const b=(submissionKey,delta,createdAt,id)=>({id,businessProfileId:company,customerId:customer,kind:'wallet',submissionKey,delta,createdAt});
const depBenefit=b('wallet-transfer-deposit',1000,t0,'b-deposit');
const saleBenefit=b('sale-wallet-sale1',-400,t1,'b-sale');
const refundBenefit=b('wallet-transfer-refund',-200,t2,'b-refund');
const reversalBenefit=b('reversal-benefit-b-sale',400,t3,'b-reverse');
const input={transfers:[deposit,refund],sales:[sale],reversals:[],benefits:[saleBenefit,refundBenefit,depBenefit]};
const verify=(changes={})=>reconcile({...input,...changes},'GHS');
test('reconstructs external prepaid receipts, wallet spend and refunds without counting wallet spend as cash',()=>{
  assert.deepEqual(verify(),{currency:'GHS',liabilityMinor:400,customerCount:1});
});
test('a saved full reversal exactly restores wallet liability and cannot be counted twice',()=>{
  assert.deepEqual(verify({reversals:[reversal],benefits:[...input.benefits,reversalBenefit]}),{currency:'GHS',liabilityMinor:800,customerCount:1});
  assert.throws(()=>verify({reversals:[reversal]}),/missing the reversal wallet credit/);
  assert.throws(()=>verify({reversals:[],benefits:[...input.benefits,reversalBenefit]}),/without a saved reversal/);
  assert.throws(()=>verify({reversals:[reversal],benefits:[...input.benefits,reversalBenefit,{...reversalBenefit,id:'twice'}]}),/duplicated|duplicate/);
  assert.throws(()=>verify({reversals:[{...reversal,createdAt:t0}],benefits:[...input.benefits,{...reversalBenefit,createdAt:t0}]}),/before original/);
  assert.throws(()=>verify({reversals:[reversal],benefits:[...input.benefits,{...reversalBenefit,delta:399}]}),/inconsistent/);
});
test('orphan, wrong customer, wrong company and mismatched benefit amount fail closed',()=>{
  for(const changed of [{id:'wrong'}, {customerId:'bob'}, {businessProfileId:'other'}, {delta:900}, {createdAt:t3}])
    assert.throws(()=>verify({benefits:[{...depBenefit,...changed},saleBenefit,refundBenefit]}),/reconcile/);
});
test('missing transfer and sale debit fail even when cash totals look correct',()=>{
  assert.throws(()=>verify({benefits:[depBenefit,refundBenefit]}),/missing.*wallet movement/);
  assert.throws(()=>verify({benefits:[saleBenefit,refundBenefit]}),/missing.*wallet movement/);
});
test('orphan transfers, forged credits and manual legacy wallet entries cannot certify liability',()=>{
  assert.throws(()=>verify({transfers:[],benefits:input.benefits}),/unlinked|inconsistent/);
  assert.throws(()=>verify({benefits:[...input.benefits,b('manual-credit',100,t3,'legacy')]}),/unlinked|inconsistent/);
  assert.throws(()=>verify({benefits:[...input.benefits,b('reversal-benefit-unknown',100,t3,'fake')]}),/orphaned/);
});
test('negative balance at any recorded time, not just the final balance, is rejected',()=>{
  const extra=transfer('late','deposit',800,t3),lateBenefit=b('wallet-transfer-late',800,t3,'b-late');
  const overspend={...sale,walletAppliedMinor:1100,amountPaidMinor:1100};
  const overBenefit={...saleBenefit,delta:-1100};
  assert.throws(()=>verify({transfers:[deposit,extra],sales:[overspend],benefits:[depBenefit,overBenefit,lateBenefit]}),/negative historical/);
});
test('rejects mixed saved currencies, missing legacy currency and cross-company history',()=>{
  for(const currency of [undefined,'USD','ghs'])
    assert.throws(()=>verify({transfers:[{...deposit,currency},refund]}),/transfer evidence/);
  assert.throws(()=>verify({sales:[{...sale,businessProfileId:'other'}]}),/cross-company/);
});
test('duplicates, numeric overflow and out-of-order snapshots cannot certify liabilities',()=>{
  assert.throws(()=>verify({transfers:[deposit,deposit,refund]}),/duplicated/);
  assert.throws(()=>verify({benefits:[...input.benefits,depBenefit]}),/duplicated/);
  const huge=Number.MAX_SAFE_INTEGER;
  const other={...deposit,id:'other',submissionKey:'key-other',customerId:'bob',benefitEntryId:'b-other',amountMinor:1};
  const otherBenefit={...depBenefit,id:'b-other',submissionKey:'wallet-transfer-other',customerId:'bob',delta:1};
  assert.throws(()=>reconcile({transfers:[{...deposit,amountMinor:huge},other],benefits:[{...depBenefit,delta:huge},otherBenefit],sales:[],reversals:[]},'GHS'),/safe monetary|precision/);
  assert.deepEqual(verify({benefits:[refundBenefit,depBenefit,saleBenefit]}),verify());
});
test('a clean, empty saved wallet history proves zero without pretending any deposit occurred',()=>{
  assert.deepEqual(reconcile({transfers:[],benefits:[],sales:[],reversals:[]},'GHS'),{currency:'GHS',liabilityMinor:0,customerCount:0});
});

test('offset-equivalent wallet credits and debits at the identical instant conserve balance independent of input order',()=>{
  const equivalent='2026-10-09T12:00:00+02:00';
  const same=transfer('same-instant','deposit',1000,equivalent);
  const sameBenefit=b('wallet-transfer-same-instant',1000,equivalent,'b-same-instant');
  const ledger={transfers:[same],sales:[sale],reversals:[],benefits:[saleBenefit,sameBenefit]};
  assert.deepEqual(reconcile(ledger,'GHS'),{currency:'GHS',liabilityMinor:600,customerCount:1});
  assert.deepEqual(reconcile({...ledger,benefits:[sameBenefit,saleBenefit]},'GHS'),{currency:'GHS',liabilityMinor:600,customerCount:1});
});

test('debit before credit by one millisecond still fails historical nonnegative-balance validation',()=>{
  const later='2026-10-09T10:00:00.001Z';
  const same=transfer('later','deposit',1000,later);
  const laterBenefit=b('wallet-transfer-later',1000,later,'b-later');
  assert.throws(()=>reconcile({transfers:[same],sales:[sale],reversals:[],benefits:[saleBenefit,laterBenefit]},'GHS'),/negative historical/);
});

test('prepaid evidence independently rejects calendar-invalid timestamp before chronological reconciliation',()=>{
  const invalid='2026-02-30T10:00:00Z';
  const forged=transfer('invalid','deposit',1000,invalid);
  assert.ok(Number.isFinite(Date.parse(invalid)), 'regression must cover a normalized impossible calendar date');
  assert.throws(()=>reconcile({transfers:[forged],benefits:[b('wallet-transfer-invalid',1000,invalid,'b-invalid')],sales:[],reversals:[]},'GHS'),/invalid.*transfer evidence/);
  assert.throws(()=>verify({benefits:[{...saleBenefit,createdAt:invalid},depBenefit,refundBenefit]}),/malformed wallet benefit evidence/);
});
