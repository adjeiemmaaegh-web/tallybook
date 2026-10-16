import test from 'node:test';
import assert from 'node:assert/strict';
import {auditRun10PrepaidCashConservation} from '../run10PrepaidCashAudit.mjs';
const company='primary',customer='c1';
const at1='2026-10-16T09:00:00.000Z',at2='2026-10-16T10:00:00.000Z',at3='2026-10-16T11:00:00.000Z';
const deposit={id:'transfer-1',businessProfileId:company,customerId:customer,
 kind:'deposit',amountMinor:1000,currency:'GHS',
 benefitEntryId:'benefit-1',submissionKey:'deposit-0001',createdAt:at1};
const credit={id:'benefit-1',businessProfileId:company,customerId:customer,
 kind:'wallet',delta:1000,submissionKey:'wallet-transfer-transfer-1',createdAt:at1};
const sale={id:'sale-1',businessProfileId:company,customerId:customer,
 walletAppliedMinor:400,amountPaidMinor:400,paymentMethod:'wallet',currency:'GHS',
 createdAt:at2};
const spend={id:'benefit-2',businessProfileId:company,customerId:customer,
 kind:'wallet',delta:-400,submissionKey:'sale-wallet-sale-1',createdAt:at2};
const reversal={id:'full-1',businessProfileId:company,customerId:customer,
 originalSaleId:'sale-1',createdAt:at3};
const restored={id:'benefit-3',businessProfileId:company,customerId:customer,
 kind:'wallet',delta:400,submissionKey:'reversal-benefit-benefit-2',createdAt:at3};
const sample=(change={})=>({transfers:[deposit],
 benefits:[credit,spend],sales:[sale],reversals:[],...change});
const audit=(change={},currency='GHS')=>auditRun10PrepaidCashConservation(sample(change),currency);
test('deposit less wallet purchase is an actual liability, not double-counted cash',()=>{
 assert.deepEqual(audit(),{currency:'GHS',liabilityMinor:600,customerCount:1,
  depositedMinor:1000,refundedMinor:0,spentMinor:400,reversedWalletSpendMinor:0,
  recordedNetExternalCashMinor:1000,netWalletConsumptionMinor:400});
});
test('full wallet sale reversal restores liability but cannot create new external cash',()=>{
 const a=audit({benefits:[credit,spend,restored],reversals:[reversal]});
 assert.equal(a.liabilityMinor,1000);
 assert.equal(a.recordedNetExternalCashMinor,1000);
 assert.equal(a.netWalletConsumptionMinor,0);
 assert.equal(a.reversedWalletSpendMinor,400);
});
test('prepaid cash refund decreases both customer funds and external cash',()=>{
 const refund={...deposit,id:'transfer-2',kind:'refund',amountMinor:200,
 benefitEntryId:'benefit-4',submissionKey:'refund-0002',createdAt:at3};
 const debit={...credit,id:'benefit-4',delta:-200,
 submissionKey:'wallet-transfer-transfer-2',createdAt:at3};
 const a=audit({transfers:[deposit,refund],benefits:[credit,spend,debit]});
 assert.equal(a.depositedMinor,1000);
 assert.equal(a.refundedMinor,200);
 assert.equal(a.recordedNetExternalCashMinor,800);
 assert.equal(a.liabilityMinor,400);
});
test('wallet transfer without matching benefit cannot be counted as customer liability',()=>{
 assert.throws(()=>audit({benefits:[spend]}),/Prepaid wallet/);
});
test('wallet sale without spending benefit cannot consume customer liability',()=>{
 assert.throws(()=>audit({benefits:[credit]}),/Prepaid wallet/);
});
test('orphan wallet reversal credit is never a free customer deposit',()=>{
 assert.throws(()=>audit({benefits:[credit,spend,restored]}),/Prepaid wallet/);
});
test('negative historical per-customer wallet balance cannot hide behind another customer',()=>{
 const extra={...spend,id:'benefit-other',customerId:'c2',
 submissionKey:'sale-wallet-fake',delta:-900,createdAt:at1};
 assert.throws(()=>audit({benefits:[credit,spend,extra]}),/Prepaid wallet/);
});
test('saved amount or currency tamper rejects before financial report uses wallet totals',()=>{
 assert.throws(()=>audit({transfers:[{...deposit,amountMinor:1200}]}),/Prepaid wallet/);
 assert.throws(()=>audit({},'USD'),/Prepaid wallet/);
});
test('wallet cross-company benefit fails in a single-company audit',()=>{
 assert.throws(()=>audit({benefits:[{...credit,businessProfileId:'other'},spend]}),/Prepaid wallet/);
});
test('duplicate transfer ID and submission key cannot inflate cash twice',()=>{
 assert.throws(()=>audit({transfers:[deposit,{...deposit}]}),/Prepaid wallet/);
});
test('unsafe money and altered customer links fail closed',()=>{
 assert.throws(()=>audit({transfers:[{...deposit,amountMinor:Number.MAX_SAFE_INTEGER+1}]}),/Prepaid wallet/);
 assert.throws(()=>audit({transfers:[{...deposit,customerId:'c2'}]}),/Prepaid wallet/);
});
test('empty wallet history creates no fictitious deposit or liability',()=>{
 const a=audit({transfers:[],benefits:[],sales:[],reversals:[]});
 assert.equal(a.liabilityMinor,0);
 assert.equal(a.recordedNetExternalCashMinor,0);
});
