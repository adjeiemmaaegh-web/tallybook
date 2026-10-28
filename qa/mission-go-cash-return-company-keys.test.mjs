import assert from 'node:assert/strict';
import test from 'node:test';
import {reconcileCashPartialReturns} from '../client/src/features/sales/cashPartialReturn.mjs';

const at='2026-01-01T00:00:00.000Z';
const later='2026-01-02T00:00:00.000Z';
function fixture(company, suffix, key='same-operation') {
  const saleId='sale-'+suffix, lineId='line-'+suffix;
  const sale={id:saleId,businessProfileId:company,receiptNumber:'receipt-'+suffix,
    createdAt:at,customerId:undefined,paymentMethod:'cash',currency:'GHS',
    subtotalMinor:100,totalMinor:100,discountMinor:0,amountPaidMinor:100,outstandingMinor:0};
  const line={id:lineId,saleId,businessProfileId:company,productId:'product-'+suffix,
    quantity:1,unitPriceMinor:100,lineTotalMinor:100,stockTracked:true,costEventId:'issue-'+suffix};
  const payment={saleId,businessProfileId:company,method:'cash',amountMinor:100};
  const ret={id:'return-'+suffix,submissionKey:key,originalSaleId:saleId,businessProfileId:company,
    originalReceiptNumber:sale.receiptNumber,currency:'GHS',createdAt:later,returnSequence:1,
    refundMethod:'cash',disposition:'restockable',refundedMinor:100,
    returnedTaxMinor:0,returnedTaxableMinor:100,returnedDiscountMinor:0,
    lines:[{saleLineId:lineId,productId:line.productId,quantity:1,
      movementId:'movement-'+suffix,costEventId:'restore-'+suffix}]};
  return {sale,line,payment,ret};
}
function reconcile(...fixtures) {
  return reconcileCashPartialReturns(fixtures.map(x=>x.sale),fixtures.map(x=>x.line),
    fixtures.map(x=>x.payment),fixtures.map(x=>x.ret),[]);
}
test('the same idempotency key is permitted for separate companies',()=>{
  const a=fixture('company-A','a'),b=fixture('company-B','b');
  assert.equal(reconcile(a,b).verifiedReturns,2);
});
test('reusing a key inside the same company fails closed',()=>{
  const a=fixture('company-A','a'),b=fixture('company-A','b');
  assert.throws(()=>reconcile(a,b),/duplicated evidence/);
});
test('company/key tuples with colons cannot alias one another',()=>{
  const a=fixture('company:a','a','b'),b=fixture('company','b','a:b');
  assert.equal(reconcile(a,b).verifiedReturns,2);
});
test('foreign-company cash return is still rejected',()=>{
  const a=fixture('company-A','a');
  a.ret.businessProfileId='company-B';
  assert.throws(()=>reconcile(a),/supported, fully paid original sale/);
});
