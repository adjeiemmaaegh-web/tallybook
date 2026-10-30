import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshotCreditTerms,validateCreditTerms} from '../../credit/creditTerms.mjs';
import {summarizeReceivableAgeing} from '../receivableAgeing.mjs';
const customer={id:'c1',businessProfileId:'primary'};
const sale=(id,date='2026-10-01',days=0)=>({id,businessProfileId:'primary',customerId:'c1',
 totalMinor:1000,amountPaidMinor:0,outstandingMinor:1000,currency:'GHS',createdAt:date+'T09:00:00.000Z',
 creditTermsAtSale:snapshotCreditTerms(date+'T09:00:00.000Z',days)});
const input=(sales,extra={})=>({company:'primary',customers:[customer],sales,repayments:[],reversals:[],...extra});
const payment={id:'r1',businessProfileId:'primary',customerId:'c1',amountMinor:400,currency:'GHS',
 submissionKey:'payment-1',createdAt:'2026-10-30T10:00:00.000Z'};
test('snapshots UTC due date through month and leap-year boundaries; rejects invalid terms',()=>{
 assert.deepEqual(snapshotCreditTerms('2024-02-28T23:00:00Z',2),{version:1,paymentDueDays:2,dueDateUtc:'2024-03-01'});
 assert.equal(snapshotCreditTerms('2026-10-01T01:00:00+03:00',0).dueDateUtc,'2026-09-30');
 for(const n of [-1,3651,0.5,NaN,null])assert.throws(()=>snapshotCreditTerms('2026-10-01T00:00:00Z',n));
 assert.throws(()=>snapshotCreditTerms('invalid',0));
});
test('each overdue boundary conserves the original debt',()=>{
 const rows=['2026-10-31','2026-10-30','2026-10-29','2026-09-30','2026-09-29','2026-08-31','2026-08-30','2026-08-01','2026-07-31']
  .map((date,i)=>sale('s'+i,'2026-07-01',Math.round((Date.parse(date)-Date.parse('2026-07-01'))/86400000)));
 const g=summarizeReceivableAgeing(input(rows),'2026-10-30').groups[0];
 assert.deepEqual(g,{currency:'GHS',outstandingMinor:9000,currentMinor:2000,days1to30Minor:2000,
  days31to60Minor:2000,days61to90Minor:2000,over90Minor:1000,unknownTermsMinor:0,unknownAllocationMinor:0});
});
test('only explicit sale allocations reduce the corresponding overdue bucket',()=>{
 const a=summarizeReceivableAgeing(input([sale('s1')],{repayments:[{...payment,saleAllocations:[{saleId:'s1',amountMinor:400}]}]}),'2026-10-30');
 assert.equal(a.groups[0].days1to30Minor,600);
 const b=summarizeReceivableAgeing(input([sale('s1')],{repayments:[payment]}),'2026-10-30');
 assert.equal(b.groups[0].days1to30Minor,0);assert.equal(b.groups[0].unknownAllocationMinor,600);
});
test('legacy and explicit unknown terms remain unknown without rewriting history',()=>{
 const old=sale('old');delete old.creditTermsAtSale;
 const unknown=sale('new');unknown.creditTermsAtSale=snapshotCreditTerms(unknown.createdAt);
 const before=JSON.stringify([old,unknown]);
 assert.equal(summarizeReceivableAgeing(input([old,unknown]),'2026-10-30').groups[0].unknownTermsMinor,2000);
 assert.equal(JSON.stringify([old,unknown]),before);
});
test('reversals remove the exact original exposure',()=>{
 const result=summarizeReceivableAgeing(input([sale('s1'),sale('s2')],{reversals:[{id:'v1',businessProfileId:'primary',
  originalSaleId:'s1',customerId:'c1',reversedOutstandingMinor:-1000,createdAt:'2026-10-02T09:00:00Z'}]}),'2026-10-30');
 assert.equal(result.groups[0].outstandingMinor,1000);
});
test('separates currencies and excludes unknown currency amounts',()=>{
 const rows=[sale('s1'),{...sale('s2'),customerId:'c2',currency:'USD'},{...sale('s3'),customerId:'c3',currency:undefined}];
 const result=summarizeReceivableAgeing(input(rows,{customers:[customer,{...customer,id:'c2'},{...customer,id:'c3'}]}),'2026-10-30');
 assert.deepEqual(result.groups.map(g=>[g.currency,g.outstandingMinor]),[['GHS',1000],['USD',1000]]);
 assert.equal(result.unknownCurrencyCustomers,1);
});
test('rejects altered terms, future postings, invalid dates and foreign company records',()=>{
 const changed=sale('s1');changed.creditTermsAtSale.dueDateUtc='2026-12-01';
 assert.throws(()=>validateCreditTerms(changed),/differs/);
 assert.throws(()=>summarizeReceivableAgeing(input([changed]),'2026-10-30'),/differs/);
 assert.throws(()=>summarizeReceivableAgeing(input([sale('s1','2026-10-31')]),'2026-10-30'),/Future/);
 assert.throws(()=>summarizeReceivableAgeing(input([]),'2026-02-30'),/valid UTC/);
 assert.throws(()=>summarizeReceivableAgeing(input([{...sale('s1'),businessProfileId:'other'}]),'2026-10-30'),/foreign/);
});
