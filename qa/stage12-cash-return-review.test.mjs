import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareCashReturnReview,quoteReviewedCashReturn} from '../client/src/features/sales/cashReturnReview.mjs';
import {planPartialSaleReturn} from '../client/src/features/sales/partialReturnPlan.mjs';
const sale={id:'sale-1',businessProfileId:'shop-1',receiptNumber:'TB-0001',currency:'GHS',createdAt:'2026-10-10T10:00:00Z',paymentMethod:'cash',subtotalMinor:900,discountMinor:0,totalMinor:900,amountPaidMinor:900,outstandingMinor:0};
const line={id:'line-1',businessProfileId:'shop-1',saleId:'sale-1',productId:'sku-1',quantity:3,unitPriceMinor:300,lineTotalMinor:900,costEventId:'issue-1',stockTracked:true};
const payment={id:'pay-1',businessProfileId:'shop-1',saleId:'sale-1',method:'cash',amountMinor:900};
const receipt={id:'receipt-1',businessProfileId:'shop-1',saleId:'sale-1',receiptNumber:'TB-0001'};
const product={id:'sku-1',businessProfileId:'shop-1',name:'Rice',stockQuantity:3,itemKind:'product'};
const issue={id:'issue-1',businessProfileId:'shop-1',productId:'sku-1',kind:'issue',saleId:'sale-1',saleLineId:'line-1',quantityDelta:-3};
const input=()=>({company:'shop-1',sale,saleLines:[line],payments:[payment],receipts:[receipt],priorReturns:[],fullReversals:[],products:[product],costEvents:[issue],batches:[]});
const valid=()=>prepareCashReturnReview(input());
const historicalReturn={id:'ret-1',businessProfileId:'shop-1',submissionKey:'unique-key-1',originalSaleId:'sale-1',originalReceiptNumber:'TB-0001',returnSequence:1,currency:'GHS',createdAt:'2026-10-11T10:00:00Z',refundMethod:'cash',disposition:'restockable',refundedMinor:300,returnedTaxMinor:0,returnedTaxableMinor:300,returnedDiscountMinor:0,lines:[{saleLineId:'line-1',productId:'sku-1',quantity:1,movementId:'move-1',costEventId:'rev-1'}]};
test('read-only review returns precise original remaining units and a proportional minor-unit quote',()=>{
  const review=valid();
  assert.equal(review.options[0].remainingQuantity,3);
  assert.deepEqual(quoteReviewedCashReturn(review,'line-1',2),{amountMinor:600,taxMinor:0,discountMinor:0,taxableMinor:600});
  assert.equal(review.priorReturnCount,0);
});
test('review accounts for immutable previous returns and prevents excess units',()=>{
  const review=prepareCashReturnReview({...input(),priorReturns:[historicalReturn]});
  assert.equal(review.priorReturnCount,1);
  assert.equal(review.options[0].remainingQuantity,2);
  assert.equal(quoteReviewedCashReturn(review,'line-1',2).amountMinor,600);
  assert.throws(()=>quoteReviewedCashReturn(review,'line-1',3),/valid remaining/i);
});
test('review rejects full reversal, foreign company and mismatched sale links',()=>{
  assert.throws(()=>prepareCashReturnReview({...input(),fullReversals:[{originalSaleId:'sale-1',businessProfileId:'shop-1'}]}),/fully reversed/i);
  assert.throws(()=>prepareCashReturnReview({...input(),company:'another'}),/active company/i);
  assert.throws(()=>prepareCashReturnReview({...input(),payments:[{...payment,businessProfileId:'another'}]}),/different sale or company/i);
});
test('review requires exactly the saved original receipt and tender',()=>{
  assert.throws(()=>prepareCashReturnReview({...input(),receipts:[]}),/receipt/i);
  assert.throws(()=>prepareCashReturnReview({...input(),receipts:[{...receipt,receiptNumber:'other'}]}),/receipt/i);
  assert.throws(()=>prepareCashReturnReview({...input(),payments:[{...payment,method:'mobile'}]}),/cash/i);
});
test('review excludes customer, credit, wallet and unknown currency histories',()=>{
  for (const patch of [{customerId:'c-1'},{paymentMethod:'credit'},{currency:undefined},{walletAppliedMinor:5},{outstandingMinor:1}])
    assert.throws(()=>prepareCashReturnReview({...input(),sale:{...sale,...patch}}),/cash|fully paid|review/i);
});
test('review excludes service, batch and missing original FIFO cost links',()=>{
  assert.throws(()=>prepareCashReturnReview({...input(),products:[{...product,itemKind:'service'}]}),/stock|batch|FIFO/i);
  assert.throws(()=>prepareCashReturnReview({...input(),batches:[{id:'batch-1',productId:'sku-1'}]}),/stock|batch|FIFO/i);
  assert.throws(()=>prepareCashReturnReview({...input(),costEvents:[]}),/stock|batch|FIFO/i);
  assert.throws(()=>prepareCashReturnReview({...input(),saleLines:[{...line,costEventId:undefined}]}),/stock/i);
});
test('review does not silently quote invalid quantities or other sale lines',()=>{
  const review=valid();
  for (const quantity of [0,1.5,-1,4,Infinity,Number.MAX_SAFE_INTEGER+1]) assert.throws(()=>quoteReviewedCashReturn(review,'line-1',quantity),/valid remaining/i);
  assert.throws(()=>quoteReviewedCashReturn(review,'made-up-line',1),/valid remaining/i);
});
test('review rejects tampered previous financial events before preparing any quote',()=>{
  assert.throws(()=>prepareCashReturnReview({...input(),priorReturns:[{...historicalReturn,refundedMinor:301}]}),/reconcile/i);
});
