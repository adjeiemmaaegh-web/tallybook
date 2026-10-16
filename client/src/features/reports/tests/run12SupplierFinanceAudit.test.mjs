import test from 'node:test';
import assert from 'node:assert/strict';
import {auditRun12SupplierFinance} from '../run12SupplierFinanceAudit.mjs';
const d0='2026-10-01T10:00:00.000Z',
 d1='2026-10-02T11:00:00.000Z',d2='2026-10-03T11:00:00.000Z';
const supplier={id:'sup-1',businessProfileId:'primary',name:'Supplier A'};
const purchase={id:'pur-1',businessProfileId:'primary',supplierId:'sup-1',
 currency:'GHS',totalCostMinor:3000,createdAt:d0};
const recognition={id:'rec-1',businessProfileId:'primary',supplierId:'sup-1',
 purchaseId:'pur-1',kind:'recognition',amountMinor:3000,currency:'GHS',
 submissionKey:'recognition-0001',createdAt:d0};
const payment={id:'pay-1',businessProfileId:'primary',supplierId:'sup-1',
 purchaseId:'pur-1',kind:'payment',method:'bank',amountMinor:1100,
 currency:'GHS',submissionKey:'supplier-pay-0001',createdAt:d1,reference:'test-bank-1'};
const credit={id:'credit-1',businessProfileId:'primary',supplierId:'sup-1',
 purchaseId:'pur-1',kind:'credit',amountMinor:300,
 currency:'GHS',submissionKey:'supplier-credit-0001',createdAt:d2};
const expense={id:'exp-1',businessProfileId:'primary',category:'rent',
 amountMinor:500,currency:'GHS',expenseDate:'2026-10-02',createdAt:d1};
const period={start:new Date('2026-10-02T00:00:00Z'),end:new Date('2026-10-04T00:00:00Z')};
const data=(override={})=>({company:'primary',companyCurrency:'GHS',
 suppliers:[supplier],purchases:[purchase],
 entries:[recognition,payment,credit],expenses:[expense],range:period,
 ...override});
const audit=o=>auditRun12SupplierFinance(data(o));
test('recognized supplier liability is distinct from manual cash payment and noncash credit',()=>{
 const r=audit();
 assert.equal(r.unknownPurchases,0);assert.equal(r.recognizedPurchases,1);
 assert.equal(r.manuallyAttestedPayments,1);
 assert.equal(r.periodSupplierPaymentsInCompanyCurrencyMinor,1100);
 assert.deepEqual(r.periodSupplierPaymentsByCurrency,[{currency:'GHS',amountMinor:1100}]);
 assert.equal(r.supplierCreditsWithoutReferences,1);
 assert.equal(r.providerSettlementVerified,false);
 assert.equal(r.potentialExpensePaymentOverlapUnresolved,true);
});
test('unrecognized supplier receipt is unknown debt, NOT silently fully paid',()=>{
 const r=audit({entries:[]});
 assert.equal(r.unknownPurchases,1);assert.equal(r.recognizedPurchases,0);
 assert.equal(r.periodSupplierPaymentsInCompanyCurrencyMinor,0);
});
test('saved supplier credit does NOT become cash outflow',()=>{
 const r=audit({entries:[recognition,credit]});
 assert.equal(r.manuallyAttestedPayments,0);
 assert.equal(r.periodSupplierPaymentsInCompanyCurrencyMinor,0);
});
test('partial settlement of recognition retains remaining supplier exposure',()=>{
 const r=audit({entries:[recognition,payment]});
 assert.equal(r.periodSupplierPaymentsInCompanyCurrencyMinor,1100);
 assert.equal(r.unknownPurchases,0);
});
test('supplier payment cannot predate original purchase',()=>{
 assert.throws(()=>audit({entries:[recognition,{...payment,createdAt:
  '2026-09-30T12:00:00.000Z'}]}),/early|lacks an explicit/);
});
test('even recognition cannot be retroactively placed before receipt',()=>{
 assert.throws(()=>audit({entries:[{...recognition,createdAt:
 '2026-09-30T10:00:00.000Z'}]}),/early/);
});
test('supplier purchase referencing deleted or foreign supplier is rejected',()=>{
 assert.throws(()=>audit({suppliers:[]}),/orphan/);
 assert.throws(()=>audit({suppliers:[{...supplier,businessProfileId:'other'}]}),/foreign/);
});
test('supplier payment claiming a different supplier cannot settle original invoice',()=>{
 assert.throws(()=>audit({entries:[recognition,{...payment,supplierId:'sup-foreign'}]}),
  /foreign, early/);
});
test('supplier payment with wrong saved currency is refused, no implicit conversion',()=>{
 assert.throws(()=>audit({entries:[recognition,{...payment,currency:'USD'}]}),
 /foreign, early/);
});
test('foreign company purchase or expense is excluded only through company-scoped input',()=>{
 assert.throws(()=>audit({purchases:[{...purchase,businessProfileId:'other'}]}),/cross-company/);
 assert.throws(()=>audit({expenses:[{...expense,businessProfileId:'other'}]}),/foreign operating/);
});
test('replayed supplier payment submission key cannot be counted twice',()=>{
 const duplicate={...payment,id:'pay-2'};
 assert.throws(()=>audit({entries:[recognition,payment,duplicate]}),/duplicate/);
});
test('overpayment is rejected even when a different supplier is owed',()=>{
 assert.throws(()=>audit({entries:[recognition,{...payment,amountMinor:3001}]}),
 /exceeds/);
});
test('unsupported payment method or a disguised cash credit is refused',()=>{
 assert.throws(()=>audit({entries:[recognition,{...payment,method:'wallet'}]}),/method/);
 assert.throws(()=>audit({entries:[recognition,{...credit,method:'bank'}]}),/must not claim/);
});
test('external payment references are counted as evidence gaps, not automatically verified',()=>{
 const r=audit({entries:[recognition,{...payment,reference:undefined}]});
 assert.equal(r.paymentsWithoutReferences,1);
 assert.equal(r.providerSettlementVerified,false);
});
test('older expense without currency is preserved as historically unverified',()=>{
 const r=audit({expenses:[{...expense,currency:undefined}]});
 assert.equal(r.expensesWithUnknownCurrency,1);
 assert.equal(r.providerSettlementVerified,false);
});
test('expense in another original currency is not converted to company denomination',()=>{
 const r=audit({expenses:[{...expense,currency:'USD'}]});
 assert.equal(r.expensesInOtherCurrency,1);
});
test('supplier payment in another purchase currency is shown separately, not added as GHS',()=>{
 const other={...purchase,currency:'USD'};
 const r=audit({purchases:[other],entries:[
  {...recognition,currency:'USD'},{...payment,currency:'USD'}]});
 assert.equal(r.periodSupplierPaymentsInCompanyCurrencyMinor,0);
 assert.deepEqual(r.otherCurrencyPayments,[{currency:'USD',amountMinor:1100}]);
});
test('malformed calendar date, duplicate expenses and unsafe amount fail before finance',()=>{
 assert.throws(()=>audit({expenses:[{...expense,expenseDate:'2026-02-30'}]}),
 /calendar date/);
 assert.throws(()=>audit({expenses:[expense,{...expense}]}),
 /invalid or foreign operating expense/);
 assert.throws(()=>audit({entries:[recognition,{...payment,amountMinor:
 Number.MAX_SAFE_INTEGER+1}]}),/unsafe/);
});
test('missing proof of original payable recognition cannot justify a supplier payment',()=>{
 assert.throws(()=>audit({entries:[payment]}),/lacks an explicit liability recognition/);
});
test('company with no supplier activity has zero recorded, not verified external cash',()=>{
 const r=audit({suppliers:[],purchases:[],entries:[],expenses:[]});
 assert.equal(r.unknownPurchases,0);
 assert.equal(r.recognizedPurchases,0);
 assert.equal(r.manuallyAttestedPayments,0);
 assert.equal(r.providerSettlementVerified,false);
});
