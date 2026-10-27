import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileCashPartialReturns } from '../client/src/features/sales/cashPartialReturn.mjs';
import { planPartialSaleReturn } from '../client/src/features/sales/partialReturnPlan.mjs';

const sale = {id:'sale-1',businessProfileId:'shop-1',receiptNumber:'TB-001',currency:'GHS',createdAt:'2026-10-10T10:00:00Z',paymentMethod:'cash',subtotalMinor:900,discountMinor:0,totalMinor:900,amountPaidMinor:900,outstandingMinor:0};
const lines = [{id:'line-1',businessProfileId:'shop-1',saleId:'sale-1',productId:'sku-1',quantity:3,unitPriceMinor:300,lineTotalMinor:900,costEventId:'issue-1',stockTracked:true}];
const payments = [{id:'p-1',businessProfileId:'shop-1',saleId:'sale-1',method:'cash',amountMinor:900}];
function record(sequence,quantity=1,prev=[]) {
  const plan=planPartialSaleReturn(sale,lines,prev.flatMap(r=>r.lines.map(l=>({saleLineId:l.saleLineId,quantity:l.quantity}))),[{saleLineId:'line-1',quantity}]);
  return {id:`return-${sequence}`,businessProfileId:'shop-1',submissionKey:`key-0000${sequence}`,originalSaleId:'sale-1',originalReceiptNumber:'TB-001',
    returnSequence:sequence,currency:'GHS',createdAt:`2026-10-11T10:00:0${sequence}Z`,refundMethod:'cash',disposition:'restockable',
    refundedMinor:plan.draftAmountMinor,returnedTaxMinor:plan.draftTaxMinor,returnedTaxableMinor:plan.draftTaxableMinor,
    returnedDiscountMinor:plan.draftDiscountMinor,lines:[{saleLineId:'line-1',productId:'sku-1',quantity,movementId:`move-${sequence}`,costEventId:`restore-${sequence}`}]};
}
const first=record(1),second=record(2,2,[first]);
const verify=rs=>reconcileCashPartialReturns([sale],lines,payments,rs,[]);

test('repeated partial cash returns consume exactly original paid value and quantities',()=>{
  assert.equal(first.refundedMinor+second.refundedMinor,900);
  assert.equal(verify([first,second]).verifiedReturns,2);
  assert.equal(verify([second,first]).verifiedReturns,2);
});
test('over-restoration is rejected',()=>assert.throws(()=>verify([first,second,{...first,id:"third",submissionKey:"third-key-unique",returnSequence:3,createdAt:"2026-10-11T10:00:04Z",lines:[{...first.lines[0],movementId:"third-m",costEventId:"third-c"}]}]),/quantity|exceed/i));
test('duplicate key and immutable event identity are rejected',()=>{
  assert.throws(()=>verify([first,{...first,id:'other-id',returnSequence:2,movementId:'other',lines:[{...first.lines[0],movementId:'other-move',costEventId:'other-cost'}]}]),/duplicat/i);
  assert.throws(()=>verify([first,first]),/duplicat/i);
});
test('duplicated stock movement or FIFO event is rejected',()=>{
  assert.throws(()=>verify([first,{...second,lines:[{...second.lines[0],movementId:first.lines[0].movementId}]}]),/duplicat/i);
  assert.throws(()=>verify([first,{...second,lines:[{...second.lines[0],costEventId:first.lines[0].costEventId}]}]),/duplicat/i);
});
test('tampering refunded, tax, or discount minor units is rejected',()=>{
  for (const key of ['refundedMinor','returnedTaxMinor','returnedTaxableMinor','returnedDiscountMinor'])
    assert.throws(()=>verify([{...first,[key]:first[key]+1}]),/reconcile/i);
});
test('foreign company, changed currency, unmatched tender and full reversal fail closed',()=>{
  assert.throws(()=>verify([{...first,businessProfileId:'other'}]),/supported|linked/i);
  assert.throws(()=>verify([{...first,currency:'USD'}]),/supported/i);
  assert.throws(()=>reconcileCashPartialReturns([sale],lines,[],[first]),/tender/i);
  assert.throws(()=>reconcileCashPartialReturns([sale],lines,payments,[first],[{originalSaleId:'sale-1'}]),/supported|orphaned/i);
});
test('customer/credit/wallet sale cannot use cash-only lane',()=>{
  for (const patch of [{customerId:'c1'},{paymentMethod:'credit'},{walletAppliedMinor:1},{currency:undefined}])
    assert.throws(()=>reconcileCashPartialReturns([{...sale,...patch}],lines,payments,[first]),/supported/i);
});
test('missing sequence and altered return disposition are rejected',()=>{
  assert.throws(()=>verify([{...first,returnSequence:3}]),/sequence/i);
  assert.throws(()=>verify([{...first,disposition:'damaged'}]),/malformed/i);
  assert.throws(()=>verify([{...first,refundMethod:'mobile'}]),/malformed/i);
});
test('line attribution to different product and duplicate sale line are rejected',()=>{
  assert.throws(()=>verify([{...first,lines:[{...first.lines[0],productId:'other'}]}]),/unsupported/i);
  assert.throws(()=>verify([{...first,lines:[first.lines[0],{...first.lines[0],movementId:'new-m',costEventId:'new-e'}]}]),/duplicate/i);
});
test('unsafe integers and malformed date are rejected',()=>{
  assert.throws(()=>verify([{...first,refundedMinor:Number.MAX_SAFE_INTEGER+1}]),/malformed/i);
  assert.throws(()=>verify([{...first,createdAt:'never'}]),/malformed/i);
});
