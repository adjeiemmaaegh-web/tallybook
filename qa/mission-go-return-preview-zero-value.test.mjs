import assert from 'node:assert/strict';
import test from 'node:test';
import { quoteReviewedCashReturn } from '../client/src/features/sales/cashReturnReview.mjs';

const sale = {
  id:'sale-rounding', businessProfileId:'company-1',
  subtotalMinor:100, discountMinor:99, totalMinor:1,
  amountPaidMinor:1, outstandingMinor:0,
};
const saleLines = [
  { id:'a', saleId:sale.id, businessProfileId:sale.businessProfileId, productId:'product-a', quantity:1, unitPriceMinor:50, lineTotalMinor:50 },
  { id:'b', saleId:sale.id, businessProfileId:sale.businessProfileId, productId:'product-b', quantity:1, unitPriceMinor:50, lineTotalMinor:50 },
];
const review = {
  sale, saleLines, prior:[], options:[
    {saleLineId:'a', remainingQuantity:1,productName:'A'},
    {saleLineId:'b', remainingQuantity:1,productName:'B'},
  ],
};
test('preview refuses a zero-cash quote from invoice discount rounding',()=>{
  assert.throws(()=>quoteReviewedCashReturn(review,'b',1),/no refundable cash amount/);
});
test('preview preserves a positive one-minor-unit quote',()=>{
  const quoted=quoteReviewedCashReturn(review,'a',1);
  assert.equal(quoted.amountMinor,1);
  assert.equal(quoted.discountMinor,49);
});
test('preview rejects quantity above original remaining units',()=>{
  assert.throws(()=>quoteReviewedCashReturn(review,'a',2),/valid remaining quantity/);
});
