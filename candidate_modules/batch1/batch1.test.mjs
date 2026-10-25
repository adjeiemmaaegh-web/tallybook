import test from 'node:test';import assert from 'node:assert/strict';
import {reconcileSales} from './financialReconciliation.ts';
import {reviewCustomerCredit} from './customerCreditLedger.ts';
import {reviewWallet} from './walletReconciliation.ts';
import {reviewSupplierPayables} from './supplierPayableSettlement.ts';
import {reviewRefundEvidence} from './refundSettlement.ts';
import {planPartialRefund} from './partialRefundEngine.ts';
const sale={id:'s1',businessProfileId:'a',customerId:'c',currency:'GHS',totalMinor:500,amountPaidMinor:300,outstandingMinor:200};
test('sale conservation',()=>{assert.equal(reconcileSales([sale]).length,0);assert.equal(reconcileSales([{...sale,outstandingMinor:201}])[0].code,'SALE_BALANCE')});
test('credit allocation',()=>{const r=reviewCustomerCredit([sale],[{id:'p',businessProfileId:'a',customerId:'c',amountMinor:100,saleAllocations:[{saleId:'s1',amountMinor:100}]}],'a','c');assert.equal(r.balanceMinor,100)});
test('unallocated credit fails closed',()=>assert.equal(reviewCustomerCredit([sale],[{id:'p',businessProfileId:'a',customerId:'c',amountMinor:100}],'a','c').balanceMinor,null));
test('wallet no overdraft',()=>assert.equal(reviewWallet([{id:'1',businessProfileId:'a',customerId:'c',kind:'refund',amountMinor:5,createdAt:'2026-01-01',submissionKey:'key1'}],'a','c').balanceMinor,null));
test('supplier recognition and repayment',()=>assert.equal(reviewSupplierPayables([{id:'1',businessProfileId:'a',supplierId:'p',purchaseId:'x',currency:'GHS',kind:'recognition',amountMinor:200,submissionKey:'1'},{id:'2',businessProfileId:'a',supplierId:'p',purchaseId:'x',currency:'GHS',kind:'payment',amountMinor:50,submissionKey:'2'}],'a').balances['p:x'],150));
test('refund must be evidenced',()=>assert.equal(reviewRefundEvidence([{id:'r',companyId:'a',originalSaleId:'s1',currency:'GHS',amountMinor:100,method:'cash',reference:'',confirmedByStaffId:'p',confirmedAt:'2026-01-01',submissionKey:'key',status:'confirmed'}],'a','s1',500).confirmedMinor,0));
test('partial returns cannot exceed quantity',()=>assert.equal(planPartialRefund([{saleLineId:'l',originalQuantity:2,previouslyReturnedQuantity:1,requestedQuantity:2,originalGrossMinor:200}],200,0).maximumRefundMinor,null));

// Adversarial regressions found during pre-Batch-7 review.
test('equivalent wallet instants reconcile regardless of offset spelling',()=>{
 const rows=[{id:'debit',businessProfileId:'a',customerId:'c',kind:'spend',amountMinor:100,createdAt:'2026-01-01T00:00:00Z',submissionKey:'debit'},
 {id:'credit',businessProfileId:'a',customerId:'c',kind:'deposit',amountMinor:100,createdAt:'2026-01-01T01:00:00+01:00',submissionKey:'credit'}];
 assert.equal(reviewWallet(rows,'a','c').balanceMinor,0);
});
test('wallet rejects unsafe accumulated credits',()=>{
 const rows=[{id:'1',businessProfileId:'a',customerId:'c',kind:'deposit',amountMinor:Number.MAX_SAFE_INTEGER,createdAt:'2026-01-01',submissionKey:'a'},
 {id:'2',businessProfileId:'a',customerId:'c',kind:'deposit',amountMinor:1,createdAt:'2026-01-02',submissionKey:'b'}];
 assert.equal(reviewWallet(rows,'a','c').balanceMinor,null);
});
test('wallet rejects duplicate posting id independently of idempotency key',()=>{
 const rows=[{id:'1',businessProfileId:'a',customerId:'c',kind:'deposit',amountMinor:1,createdAt:'2026-01-01',submissionKey:'a'},
 {id:'1',businessProfileId:'a',customerId:'c',kind:'deposit',amountMinor:1,createdAt:'2026-01-02',submissionKey:'b'}];
 assert.equal(reviewWallet(rows,'a','c').balanceMinor,null);
});
test('credit review rejects aggregate unsafe allocations',()=>{
 const bigSale={...sale,totalMinor:Number.MAX_SAFE_INTEGER,amountPaidMinor:0,outstandingMinor:Number.MAX_SAFE_INTEGER};
 const rows=[{id:'r1',businessProfileId:'a',customerId:'c',amountMinor:Number.MAX_SAFE_INTEGER,saleAllocations:[{saleId:'s1',amountMinor:Number.MAX_SAFE_INTEGER}]},
 {id:'r2',businessProfileId:'a',customerId:'c',amountMinor:1,saleAllocations:[{saleId:'s1',amountMinor:1}]}];
 assert.equal(reviewCustomerCredit([bigSale],rows,'a','c').balanceMinor,null);
});
test('partial refund large arithmetic uses exact minor units',()=>{
 const r=planPartialRefund([{saleLineId:'x',originalQuantity:3,previouslyReturnedQuantity:0,requestedQuantity:1,originalGrossMinor:Number.MAX_SAFE_INTEGER}],Number.MAX_SAFE_INTEGER,0);
 assert.equal(r.maximumRefundMinor,3002399751580330);
});
test('refund reference duplicate keys across original sales rejected',()=>{
 const a={id:'r1',companyId:'a',originalSaleId:'s1',currency:'GHS',amountMinor:100,method:'cash',reference:'ref1',confirmedByStaffId:'staff',confirmedAt:'2026-01-01',submissionKey:'key',status:'confirmed'};
 const b={...a,id:'r2',originalSaleId:'s2',submissionKey:'key'};
 assert.equal(reviewRefundEvidence([a,b],'a','s1',500).confirmedMinor,0);
});

test('partial refund exact floor avoids floating-point overpayment',()=>{
 const r=planPartialRefund([{saleLineId:'x',originalQuantity:3,previouslyReturnedQuantity:0,requestedQuantity:2,originalGrossMinor:Number.MAX_SAFE_INTEGER}],Number.MAX_SAFE_INTEGER,0);
 assert.equal(r.maximumRefundMinor,6004799503160660);
});
