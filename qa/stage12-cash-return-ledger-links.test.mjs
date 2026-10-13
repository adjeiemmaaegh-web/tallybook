import test from 'node:test';
import assert from 'node:assert/strict';
import {assertCashReturnLedgerLinks} from '../client/src/features/sales/cashReturnStockLinks.mjs';

function fixture() {
  const sales=[], saleLines=[], cashReturns=[], movements=[], costEvents=[];
  for (let n=1; n<=2; n++) {
    const company=`company-${n}`, saleId=`sale-${n}`, lineId=`line-${n}`;
    const product=`product-${n}`, issueId=`issue-${n}`, movementId=`move-${n}`, reversalId=`restore-${n}`;
    const time=`2026-10-11T12:00:0${n}Z`;
    sales.push({id:saleId,businessProfileId:company});
    saleLines.push({id:lineId,businessProfileId:company,saleId,productId:product,quantity:2,costEventId:issueId});
    costEvents.push({id:issueId,kind:'issue',businessProfileId:company,productId:product,saleId,saleLineId:lineId,
      quantityDelta:-2,allocations:[{receiptId:`receipt-${n}`,quantity:2,unitCostMinor:100+n}]});
    cashReturns.push({id:`return-${n}`,businessProfileId:company,originalSaleId:saleId,returnSequence:1,createdAt:time,
      lines:[{saleLineId:lineId,productId:product,quantity:1,movementId,costEventId:reversalId}]});
    movements.push({id:movementId,businessProfileId:company,productId:product,movementType:'reversal',quantityDelta:1,
      previousQuantity:0,resultingQuantity:1,createdAt:time});
    costEvents.push({id:reversalId,kind:'reversal',businessProfileId:company,productId:product,saleId,saleLineId:lineId,
      reversesEventId:issueId,sourceId:movementId,quantityDelta:1,createdAt:time,
      allocations:[{receiptId:`receipt-${n}`,quantity:1,unitCostMinor:100+n}]});
  }
  return {sales,saleLines,cashReturns,movements,costEvents};
}
const verify = records => assertCashReturnLedgerLinks(records.sales,records.saleLines,records.cashReturns,records.movements,records.costEvents);
test('full snapshot verifies two independent companies without mutating inputs',()=>{
  const records=fixture(); const before=structuredClone(records);
  assert.deepEqual(verify(records),{checkedReturns:2,checkedLines:2,checkedSales:2});
  assert.deepEqual(records,before);
  assert.deepEqual(verify({...records,cashReturns:[]}),{checkedReturns:0,checkedLines:0,checkedSales:0});
});
test('a missing previous physical movement is detected outside the refund screen',()=>{
  const data=fixture();data.movements.splice(1,1);
  assert.throws(()=>verify(data),/stock movement|FIFO/i);
});
test('a tampered original FIFO layer is detected even when refund quantity and amount still match',()=>{
  const data=fixture();data.costEvents.find(e=>e.id==='restore-2').allocations[0].unitCostMinor=999;
  assert.throws(()=>verify(data),/cost|allocation/i);
});
test('rejects return identity linking to absent or different-company sale',()=>{
  const data=fixture();data.cashReturns[0].originalSaleId='missing';
  assert.throws(()=>verify(data),/absent original sale/i);
  const another=fixture();another.cashReturns[0].businessProfileId='company-2';
  assert.throws(()=>verify(another),/another sale|order/i);
});
test('rejects wrong-company stock and cost restoration evidence',()=>{
  for (const kind of ['movements','costEvents']) {
    const data=fixture();const item=data[kind].find(i=>i.id===(kind==='movements'?'move-1':'restore-1'));
    item.businessProfileId='company-2';
    assert.throws(()=>verify(data),/stock movement|FIFO/i);
  }
});
test('refuses reused movement and cost identities across distinct refunds',()=>{
  const data=fixture();data.cashReturns[1].lines[0].movementId='move-1';
  assert.throws(()=>verify(data),/duplicated|reference/i);
  const other=fixture();other.cashReturns[1].lines[0].costEventId='restore-1';
  assert.throws(()=>verify(other),/duplicated|reference/i);
});
test('rejects duplicate historical snapshot IDs rather than selecting one arbitrarily',()=>{
  const data=fixture();data.costEvents.push({...data.costEvents[0]});
  assert.throws(()=>verify(data),/duplicate identities/i);
});
test('fails closed on malformed input arrays and missing source sale lines',()=>{
  const data=fixture();
  assert.throws(()=>assertCashReturnLedgerLinks(data.sales,data.saleLines,null,data.movements,data.costEvents),/unavailable/i);
  data.saleLines.splice(0,1);
  assert.throws(()=>verify(data),/stock movement|FIFO/i);
});
