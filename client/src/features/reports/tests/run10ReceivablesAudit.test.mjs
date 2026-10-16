import test from 'node:test';
import assert from 'node:assert/strict';
import {auditRun10CompanyReceivables} from '../run10ReceivablesAudit.mjs';
const t='2026-10-16T09:00:00.000Z',later='2026-10-16T10:00:00.000Z';
const customers=[
{id:'c1',businessProfileId:'primary'},{id:'c2',businessProfileId:'primary'}];
const s1={id:'s1',businessProfileId:'primary',customerId:'c1',totalMinor:1000,
 amountPaidMinor:0,outstandingMinor:1000,currency:'GHS',createdAt:t};
const s2={id:'s2',businessProfileId:'primary',customerId:'c2',totalMinor:900,
 amountPaidMinor:0,outstandingMinor:900,currency:'GHS',createdAt:t};
const payment={id:'r1',businessProfileId:'primary',customerId:'c1',
 amountMinor:400,currency:'GHS',submissionKey:'key-0001',createdAt:later};
const args=(extra={})=>({company:'primary',customers,sales:[s1,s2],
 repayments:[payment],reversals:[],...extra});
test('keeps two customer receivable ledgers separate without inventing allocations',()=>{
 assert.deepEqual(auditRun10CompanyReceivables(args()),{
  outstandingMinor:1500,salesOutstandingMinor:1900,repaidMinor:400,
  allocatedRepaymentMinor:0,unallocatedRepaymentMinor:400,
  indebtedCustomers:2,historicalUnknownCurrencyCustomers:0,customerCount:2
 });
});
test('sale-linked partial repayments conserve immutable sale attribution',()=>{
 const linked={...payment,saleAllocations:[{saleId:'s1',amountMinor:400}]};
 const a=auditRun10CompanyReceivables(args({repayments:[linked]}));
 assert.equal(a.allocatedRepaymentMinor,400);
 assert.equal(a.unallocatedRepaymentMinor,0);
 assert.equal(a.outstandingMinor,1500);
});
test('overpayment of customer A cannot be hidden by customer B credit',()=>{
 const huge={...payment,amountMinor:1200};
 assert.throws(()=>auditRun10CompanyReceivables(args({repayments:[huge]})),
  /customer c1 has unreconciled debt/);
});
test('repaid sale cannot be targeted beyond its original outstanding balance',()=>{
 const invalid={...payment,amountMinor:1200,
 saleAllocations:[{saleId:'s1',amountMinor:1200}]};
 assert.throws(()=>auditRun10CompanyReceivables(args({repayments:[invalid]})),
  /allocations exceed|customer c1/);
});
test('historical customer-level repayment remains unallocated',()=>{
 const legacy={...payment,currency:'GHS'};
 const a=auditRun10CompanyReceivables(args({repayments:[legacy]}));
 assert.equal(a.unallocatedRepaymentMinor,400);
});
test('repayment before original sale cannot be allocated retroactively',()=>{
 const early={...payment,createdAt:'2026-10-15T10:00:00.000Z',
 saleAllocations:[{saleId:'s1',amountMinor:400}]};
 assert.throws(()=>auditRun10CompanyReceivables(args({repayments:[early]})),
  /predates its target sale/);
});
test('foreign customer and foreign company repayments are rejected',()=>{
 assert.throws(()=>auditRun10CompanyReceivables(args({repayments:[
 {...payment,customerId:'foreign'}]})),/orphan or invalid repayment/);
 assert.throws(()=>auditRun10CompanyReceivables(args({repayments:[
 {...payment,businessProfileId:'other'}]})),/foreign/);
});
test('repayment targeting another customer sale cannot transfer their debt',()=>{
 const forged={...payment,saleAllocations:[{saleId:'s2',amountMinor:400}]};
 assert.throws(()=>auditRun10CompanyReceivables(args({repayments:[forged]})),
  /crosses a customer/);
});
test('duplicate IDs and submission keys cannot double count a repayment',()=>{
 const two={...payment,id:'r2',submissionKey:'key-0001'};
 assert.throws(()=>auditRun10CompanyReceivables(args({repayments:[payment,two]})),
  /repeated or malformed/);
 assert.throws(()=>auditRun10CompanyReceivables(args({repayments:[payment,payment]})),
  /duplicate, foreign/);
});
test('full sale reversal removes matching debtor exposure exactly',()=>{
 const full={id:'v1',businessProfileId:'primary',originalSaleId:'s2',
 customerId:'c2',reversedOutstandingMinor:-900,createdAt:later};
 const a=auditRun10CompanyReceivables(args({reversals:[full]}));
 assert.equal(a.outstandingMinor,600);
 assert.equal(a.salesOutstandingMinor,1000);
});
test('double reversal and wrong customer or early full correction are rejected',()=>{
 const v={id:'v1',businessProfileId:'primary',originalSaleId:'s2',
 customerId:'c2',reversedOutstandingMinor:-900,createdAt:later};
 for(const changes of [{id:'v2',customerId:'c1'},
  {id:'v2',createdAt:'2026-10-15T09:00:00.000Z'}])
 assert.throws(()=>auditRun10CompanyReceivables(args({reversals:[{...v,...changes}]})),
 /orphaned, premature or cross-customer/);
 assert.throws(()=>auditRun10CompanyReceivables(args({reversals:[v,{...v,id:'v2'}]})),
 /duplicate or foreign/);
});
test('mixed currencies and unknown currency cannot be summed or relabeled',()=>{
 assert.throws(()=>auditRun10CompanyReceivables(args({sales:[s1,{...s2,
 customerId:'c1',currency:'USD'}],repayments:[]})),/customer c1 has unreconciled debt/);
 const a=auditRun10CompanyReceivables(args({sales:[{...s1,currency:undefined}],
 repayments:[],customers:[customers[0]]}));
 assert.equal(a.historicalUnknownCurrencyCustomers,1);
});
test('missing customer for positive credit is never a walk-in receivable',()=>{
 assert.throws(()=>auditRun10CompanyReceivables(args({sales:[{
 ...s1,customerId:undefined}]})),/unattributed credit sale/);
});
test('duplicate customer or sale identities and invalid amounts are rejected',()=>{
 assert.throws(()=>auditRun10CompanyReceivables(args({customers:[customers[0],customers[0]]})),
 /duplicate or foreign customer/);
 assert.throws(()=>auditRun10CompanyReceivables(args({sales:[s1,s1]})),/duplicate, foreign or invalid original sale/);
 assert.throws(()=>auditRun10CompanyReceivables(args({sales:[{...s1,outstandingMinor:-1}]})),/invalid original sale/);
});
test('safe integer overflow cannot be hidden by many customer balances',()=>{
 const max=Number.MAX_SAFE_INTEGER;
 assert.throws(()=>auditRun10CompanyReceivables(args({sales:[
 {...s1,totalMinor:max,outstandingMinor:max},
 {...s2,totalMinor:max,outstandingMinor:max}],repayments:[]})),/monetary sum/);
});
test('invalid posting dates block linked receivable evidence',()=>{
 assert.throws(()=>auditRun10CompanyReceivables(args({repayments:[
 {...payment,createdAt:'yesterday'}]})),/invalid saved posting date/);
});
