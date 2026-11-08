import test from "node:test";
import assert from "node:assert/strict";
import {validatePromotionHistory,effectivePromotionPrice,promotionPriceReviewKey,validateSavedPromotionPricing} from "../client/src/features/inventory/promotionRules.mjs";
const t="2026-11-09T00:00:00.000Z";
const row={version:1,productId:"p",companyId:"c",revision:1,ownerStaffId:"owner",reason:"Opening week",
 enabled:true,discountBps:1250,changedAt:t,startsAt:t,endsAt:"2026-11-20T23:59:59.999Z"};
test("active 12.5% reduction rounds per unit and expires without changing old receipts",()=>{
 const product={id:"p",businessProfileId:"c",promotionHistory:[row]};
 assert.deepEqual(effectivePromotionPrice(product,999,"2026-11-10T12:00:00.000Z"),
   {unitPriceMinor:874,originalUnitPriceMinor:999,savingsMinor:125,revision:1});
 assert.equal(effectivePromotionPrice(product,999,"2026-11-21T00:00:00.000Z").unitPriceMinor,999);
 assert.equal(effectivePromotionPrice(product,999,"2026-11-08T23:59:59.999Z").unitPriceMinor,999);
});
test("revision history rejects foreign scope, cycles in revision numbers, and damage",()=>{
 assert.throws(()=>validatePromotionHistory([{...row,companyId:"other"}],"p","c"),/invalid/);
 assert.throws(()=>validatePromotionHistory([row,{...row,revision:3}],"p","c"),/invalid/);
 assert.throws(()=>validatePromotionHistory([{...row,discountBps:10000}],"p","c"),/invalid/);
 assert.throws(()=>validatePromotionHistory([{...row,endsAt:"bad"}],"p","c"),/invalid/);
});
test("promotion preview key binds amount, quantity and revision in canonical order",()=>{
 const data=[{productId:"z",quantity:2,unitPriceMinor:200,revision:0},{productId:"a",quantity:1,unitPriceMinor:900,revision:2}];
 assert.equal(promotionPriceReviewKey(data),promotionPriceReviewKey([...data].reverse()));
 assert.notEqual(promotionPriceReviewKey(data),promotionPriceReviewKey(data.map(x=>({...x,revision:x.revision+1}))));
});

/** Independently compare original sale-line promo evidence with the saved
 * preview; later product changes must not rewrite this original unit price. */
export function validateSavedPromotionPricing(sale,lines){
 if(!sale||!Array.isArray(lines))throw Error("Sale promotion evidence is unavailable.");
 for(const line of lines){
  const fields=[line.regularUnitPriceMinorAtSale,line.promotionSavingsPerUnitMinor,line.promotionRevisionAtSale];
  const discounted=fields[0]!==undefined||fields[1]!==undefined;
  if(discounted&&(fields[0]===undefined||fields[1]===undefined||fields[2]===undefined))
    throw Error("Sale promotion unit-price provenance is incomplete.");
  if(fields[2]!==undefined&&(!Number.isSafeInteger(fields[2])||fields[2]<1))
    throw Error("Sale promotion revision is invalid.");
  if(discounted&&(!validMinor(fields[0])||!validMinor(fields[1])||
      fields[1]<=0||fields[0]-fields[1]!==line.unitPriceMinor))
    throw Error("Saved promotion savings no longer match the original receipt.");
 }
 if(sale.priceReviewKeyAtSale!==undefined){
  const key=promotionPriceReviewKey(lines.map(line=>({
    productId:line.productId,quantity:line.quantity,
    unitPriceMinor:line.unitPriceMinor,revision:line.promotionRevisionAtSale??0
  })));
  if(key!==sale.priceReviewKeyAtSale)
    throw Error("Original sale pricing preview was altered after checkout.");
 }
 return true;
}

test("immutable sale pricing evidence detects altered promo savings and preview substitution",()=>{
 const lines=[{productId:"p",quantity:2,unitPriceMinor:874,regularUnitPriceMinorAtSale:999,promotionSavingsPerUnitMinor:125,promotionRevisionAtSale:1}];
 const key=promotionPriceReviewKey([{productId:"p",quantity:2,unitPriceMinor:874,revision:1}]);
 assert.equal(validateSavedPromotionPricing({priceReviewKeyAtSale:key},lines),true);
 assert.throws(()=>validateSavedPromotionPricing({priceReviewKeyAtSale:key},[{...lines[0],promotionSavingsPerUnitMinor:124}]),/savings/);
});

test("expired or explicitly disabled promotions retain original revision without inventing a discount",()=>{
 const snapshot=[{productId:"p",quantity:1,unitPriceMinor:999,promotionRevisionAtSale:2}];
 const key=promotionPriceReviewKey([{productId:"p",quantity:1,unitPriceMinor:999,revision:2}]);
 assert.equal(validateSavedPromotionPricing({priceReviewKeyAtSale:key},snapshot),true);
 assert.throws(()=>validateSavedPromotionPricing({priceReviewKeyAtSale:key},[
   {...snapshot[0],promotionSavingsPerUnitMinor:10}
 ]),/incomplete/);
});
