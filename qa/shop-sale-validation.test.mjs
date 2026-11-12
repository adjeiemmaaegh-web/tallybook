import test from 'node:test';
import assert from 'node:assert/strict';
import {validShopSaleRequest,validShopReceiptForSale} from '../client/src/cloud/shopSaleValidation.ts';
const scope={userId:'cashier-a',companyId:'company-a'};
const base={
 submissionKey:'sale-unique-key-123',storeId:'store-a',
 lines:[{productId:'eggs',quantity:2},{productId:'milk',quantity:1}],
 paymentMethod:'cash',amountTenderedMinor:1000,
};
function receipt(){
 return {submissionKey:base.submissionKey,companyId:scope.companyId,cashierId:scope.userId,
  storeId:base.storeId,saleId:'sale-recorded',receiptNumber:13,currency:'GHS',
  recordedAt:'2026-11-12T14:00:00Z',replayed:false,totalMinor:900,refundedMinor:0,
  payment:{method:'cash',amountDueMinor:900,amountTenderedMinor:1000,changeMinor:100,reference:null},
  lines:[{lineNo:1,productId:'milk',quantity:1,lineTotalMinor:300},
    {lineNo:2,productId:'eggs',quantity:2,lineTotalMinor:600}]};
}
test('valid legacy cash and split tender sales preserve both payload shapes',()=>{
 assert.equal(validShopSaleRequest(base),true);
 assert.equal(validShopSaleRequest({...base,paymentMethod:undefined,amountTenderedMinor:undefined,
  tenders:[{method:'cash',amountMinor:500,tenderedMinor:500},
    {method:'credit',amountMinor:400,customerId:'customer-a'}],discountMinor:0}),true);
});
test('bad quantities, tender amounts, malformed submission key and unsupported payment fail',()=>{
 const wrong=[
  {...base,lines:[]},
  {...base,lines:[{productId:'eggs',quantity:0}]},
  {...base,lines:[{productId:'eggs',quantity:1.5}]},
  {...base,lines:[{productId:'eggs',quantity:Number.MAX_SAFE_INTEGER}]},
  {...base,amountTenderedMinor:-20},
  {...base,amountTenderedMinor:Number.NaN},
  {...base,paymentMethod:'cryptocoin'},
  {...base,submissionKey:'short'},
  {...base,tenders:[{method:'credit',amountMinor:5}],amountTenderedMinor:100},
  {...base,paymentMethod:undefined,amountTenderedMinor:undefined,tenders:[{method:'cash',amountMinor:Infinity}]},
 ];
 for(const bad of wrong)assert.equal(validShopSaleRequest(bad),false,JSON.stringify(bad));
});
test('matching receipt validates financial proof and aggregate line quantities',()=>{
 assert.equal(validShopReceiptForSale(receipt(),scope,base),true);
 const normalized=receipt();
 normalized.lines=[
  {lineNo:1,productId:'eggs',quantity:1,lineTotalMinor:300},
  {lineNo:2,productId:'eggs',quantity:1,lineTotalMinor:300},
  {lineNo:3,productId:'milk',quantity:1,lineTotalMinor:300}];
 assert.equal(validShopReceiptForSale(normalized,scope,base),true);
});
test('foreign or incomplete receipts cannot consume encrypted pending sale',()=>{
 const r=receipt();
 const mutated=[
  {...r,companyId:'company-b'},
  {...r,cashierId:'other-user'},
  {...r,storeId:'different-store'},
  {...r,submissionKey:'other-key'},
  {...r,saleId:''},
  {...r,receiptNumber:0},
  {...r,currency:'INVALID'},
  {...r,recordedAt:'not-a-date'},
  {...r,totalMinor:NaN},
  {...r,refundedMinor:901},
  {...r,payment:{...r.payment,amountDueMinor:899}},
  {...r,payment:{...r.payment,amountTenderedMinor:-1}},
  {...r,lines:[{lineNo:1,productId:'eggs',quantity:3,lineTotalMinor:900}]},
  {...r,lines:[{lineNo:1,productId:'eggs',quantity:2,lineTotalMinor:-9}]},
  {...r,replayed:'yes'},
 ];
 for(const bad of mutated)assert.equal(validShopReceiptForSale(bad,scope,base),false,JSON.stringify(bad));
});
