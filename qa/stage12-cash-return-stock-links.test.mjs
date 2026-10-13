import test from 'node:test';
import assert from 'node:assert/strict';
import { assertCashReturnStockLinks } from '../client/src/features/sales/cashReturnStockLinks.mjs';

const sale = { id:'sale-a', businessProfileId:'shop-a' };
const lines = [{ id:'line-a', saleId:'sale-a', businessProfileId:'shop-a', productId:'rice', quantity:3, costEventId:'issue-a' }];
const issue = { id:'issue-a', kind:'issue', businessProfileId:'shop-a', productId:'rice', saleId:'sale-a', saleLineId:'line-a', quantityDelta:-3,
  allocations:[{receiptId:'receipt-1',quantity:2,unitCostMinor:150},{receiptId:'receipt-2',quantity:1,unitCostMinor:160}] };
function returnRecord(sequence, quantity, movementId, eventId) {
  return {id:`return-${sequence}`,businessProfileId:'shop-a',originalSaleId:'sale-a',returnSequence:sequence,
    createdAt:`2026-10-11T12:00:0${sequence}Z`,lines:[{saleLineId:'line-a',productId:'rice',quantity,movementId,costEventId:eventId}]};
}
const first = returnRecord(1,1,'movement-1','reversal-1');
const second = returnRecord(2,2,'movement-2','reversal-2');
const movement = (ret, previous) => ({id:ret.lines[0].movementId,businessProfileId:'shop-a',productId:'rice',
  movementType:'reversal',quantityDelta:ret.lines[0].quantity,previousQuantity:previous,
  resultingQuantity:previous+ret.lines[0].quantity,createdAt:ret.createdAt});
const reversal = (ret, allocations) => ({id:ret.lines[0].costEventId,kind:'reversal',businessProfileId:'shop-a',
  productId:'rice',saleId:'sale-a',saleLineId:'line-a',reversesEventId:'issue-a',
  sourceId:ret.lines[0].movementId,quantityDelta:ret.lines[0].quantity,createdAt:ret.createdAt,allocations});
const movement1 = movement(first,3), movement2=movement(second,4);
const cost1 = reversal(first,[{receiptId:'receipt-1',quantity:1,unitCostMinor:150}]);
const cost2 = reversal(second,[{receiptId:'receipt-1',quantity:1,unitCostMinor:150},{receiptId:'receipt-2',quantity:1,unitCostMinor:160}]);
const valid = (r=[first,second],m=[movement1,movement2],c=[issue,cost1,cost2]) => assertCashReturnStockLinks(sale,lines,r,m,c);

test('cross-checks each partial refund with saved stock movement and exact original FIFO units',()=>{
  assert.deepEqual(valid(),{checkedReturns:2,checkedLines:2});
  assert.deepEqual(valid([second,first]),{checkedReturns:2,checkedLines:2});
  assert.deepEqual(valid([],[],[issue]),{checkedReturns:0,checkedLines:0});
});
test('rejects journal rows whose stock movement is missing or belongs to another company',()=>{
  assert.throws(()=>valid([first],[ ],[issue,cost1]),/stock movement|FIFO/i);
  assert.throws(()=>valid([first],[{...movement1,businessProfileId:'other'}],[issue,cost1]),/stock movement|FIFO/i);
});
test('rejects tampered physical quantities, type and time even if refund amounts reconcile',()=>{
  for (const patch of [{quantityDelta:2},{resultingQuantity:5},{movementType:'receipt'},{createdAt:'2026-10-11T01:00:00Z'}])
    assert.throws(()=>valid([first],[{...movement1,...patch}],[issue,cost1]),/stock movement|FIFO/i);
});
test('rejects missing, duplicate, changed-source or wrong-sale cost events',()=>{
  assert.throws(()=>valid([first],[movement1],[issue]),/stock movement|FIFO/i);
  assert.throws(()=>valid([first],[movement1],[issue,cost1,cost1]),/duplicate/i);
  assert.throws(()=>valid([first],[movement1],[issue,{...cost1,sourceId:'different'}]),/stock movement|FIFO/i);
  assert.throws(()=>valid([first],[movement1],[issue,{...cost1,saleLineId:'other'}]),/stock movement|FIFO/i);
});
test('rejects forged receipt allocation cost, receipt identity and cumulative wrong FIFO slicing',()=>{
  assert.throws(()=>valid([first],[movement1],[issue,{...cost1,allocations:[{receiptId:'receipt-1',quantity:1,unitCostMinor:100}]}]),/cost|allocation/i);
  assert.throws(()=>valid([first],[movement1],[issue,{...cost1,allocations:[{receiptId:'receipt-2',quantity:1,unitCostMinor:160}]}]),/cost|allocation/i);
  assert.throws(()=>valid([first,second],[movement1,movement2],[issue,cost1,{...cost2,allocations:[{receiptId:'receipt-1',quantity:2,unitCostMinor:150}]}]),/cost|allocation/i);
});
test('rejects tampered original issue and cross-sale return identities',()=>{
  assert.throws(()=>valid([first],[movement1],[{...issue,quantityDelta:-4},cost1]),/FIFO|issue|quantity/i);
  assert.throws(()=>valid([{...first,originalSaleId:'other'}],[movement1],[issue,cost1]),/another sale/i);
  assert.throws(()=>valid([first],[movement1],[{...issue,saleLineId:'other'},cost1]),/stock movement|FIFO/i);
});
test('rejects duplicate saved original sale lines and replayed stock movement identifiers',()=>{
  assert.throws(()=>assertCashReturnStockLinks(sale,[lines[0],lines[0]],[first],[movement1],[issue,cost1]),/duplicat/i);
  assert.throws(()=>valid([first,{...second,lines:[{...second.lines[0],movementId:'movement-1'}]}],[movement1,movement2],[issue,cost1,cost2]),/stock movement|FIFO/i);
});
