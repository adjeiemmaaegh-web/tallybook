import test from "node:test";
import assert from "node:assert/strict";
import {validatePromotionHistory,effectivePromotionPrice,promotionPriceReviewKey} from "../client/src/features/inventory/promotionRules.mjs";
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
