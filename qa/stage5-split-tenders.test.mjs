import test from "node:test";
import assert from "node:assert/strict";
import {normalizeSplitTenders,assertSplitPaymentLedger} from "../client/src/features/sales/splitTender.mjs";
const lines=[{method:"cash",amountMinor:500},{method:"mobile",amountMinor:700,providerId:"mtn",reference:"MOMO-123"}];
test("split payment keeps exact per-tender evidence and fails closed on over/underpayment",()=>{
 assert.deepEqual(normalizeSplitTenders(lines,1200,1200),lines);
 for(const amount of [1100,1201])assert.throws(()=>normalizeSplitTenders(lines,amount,1200),/Split/);
 assert.throws(()=>normalizeSplitTenders([lines[0],lines[0]],1000,1000),/distinct/);
 assert.throws(()=>normalizeSplitTenders([{method:"card",amountMinor:100,reference:"4000000000000002"},lines[0]],600,600),/card number/);
});
test("immutable split tender posts require exact method, amount, provider, card ref and company",()=>{
 const sale={id:"sale-1",businessProfileId:"business",paymentMethod:"split",amountPaidMinor:1200,totalMinor:2000,splitTendersAtSale:lines};
 const posts=[{saleId:"sale-1",businessProfileId:"business",method:"cash",amountMinor:500},
  {saleId:"sale-1",businessProfileId:"business",method:"mobile",amountMinor:700,mobileMoneyProviderId:"mtn",mobileMoneyReference:"MOMO-123"}];
 assert.equal(assertSplitPaymentLedger(sale,posts),true);
 assert.throws(()=>assertSplitPaymentLedger(sale,posts.slice(0,1)),/missing/);
 assert.throws(()=>assertSplitPaymentLedger(sale,[posts[0],{...posts[1],mobileMoneyReference:"MOMO-999"}]),/MoMo/);
 assert.throws(()=>assertSplitPaymentLedger(sale,[posts[0],{...posts[1],businessProfileId:"wrong"}]),/reconcile/);
});
