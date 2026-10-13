import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertSingleCurrencyFinancialEvidence as verify } from '../client/src/features/reports/financialCurrencyEvidence.mjs';
const empty=()=>({sales:[],repayments:[],expenses:[],walletTransfers:[],cashReturns:[]});
const sale={id:'sale-1',currency:'GHS',totalMinor:1500};
const repayment={id:'rep-1',currency:'GHS',amountMinor:300};
const expense={id:'expense-1',currency:'GHS',amountMinor:200};
const transfer={id:'transfer-1',currency:'GHS',amountMinor:600};
const returned={id:'return-1',currency:'GHS',refundedMinor:100};
test('same saved currency from five distinct money sources can be shown as one currency',()=>{
 assert.equal(verify({sales:[sale],repayments:[repayment],expenses:[expense],walletTransfers:[transfer],cashReturns:[returned]},'GHS'),true);
});
test('foreign saved currency cannot be relabelled using the current business profile currency',()=>{
 for(const [table,record] of [['sales',sale],['repayments',repayment],['expenses',expense],['walletTransfers',transfer],['cashReturns',returned]]){
  assert.throws(()=>verify({...empty(),[table]:[{...record,currency:'USD'}]},'GHS'),/different currency/);
 }
});
test('unknown legacy currency cannot be reinterpreted as current currency',()=>{
 for(const [table,record] of [['sales',sale],['repayments',repayment],['expenses',expense],['walletTransfers',transfer],['cashReturns',returned]]){
  assert.throws(()=>verify({...empty(),[table]:[{...record,currency:undefined}]},'GHS'),/unknown historical currency/);
 }
});
test('invalid evidence and unsafe money never produces a currency-certified report',()=>{
 for(const value of [-1,1.2,Infinity,Number.MAX_SAFE_INTEGER+1])
  assert.throws(()=>verify({...empty(),expenses:[{...expense,amountMinor:value}]},'GHS'),/invalid monetary/);
 for(const currency of ['ghs','GHS1','',null])
  assert.throws(()=>verify({...empty(),expenses:[{...expense,currency}]},'GHS'),/currency/);
});
test('empty history is allowed, invalid profile denomination is not',()=>{
 assert.equal(verify(empty(),'GHS'),true);
 assert.throws(()=>verify(empty(),'undefined'),/business currency/);
});
test('unknown currency on a truly zero-valued old sale does not cause a false monetary conversion',()=>{
 assert.equal(verify({...empty(),sales:[{...sale,totalMinor:0,currency:undefined}]},'GHS'),true);
});
test('complete source history must be supplied, rather than treating omitted ledgers as empty',()=>{
 assert.throws(()=>verify({sales:[],repayments:[],expenses:[],walletTransfers:[]},'GHS'),/evidence is missing/);
});
