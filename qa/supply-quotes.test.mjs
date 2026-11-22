import test from "node:test";
import assert from "node:assert/strict";
import {priceQuote,compareQuotes,savingsAgainst} from "../client/src/cloud/connectedCommerce/supplyQuotes.mjs";

const NOW=Date.parse("2026-11-22T12:00:00Z");
const request={item:"Rice 25kg",quantity:100,currency:"GHS"};
const quote=(over={})=>({supplierId:"s1",supplierName:"Alpha",currency:"GHS",packPriceMinor:1000,shippingMinor:500,taxIncluded:true,leadTimeDays:3,validUntil:"2026-12-01T00:00:00Z",...over});

test("exact landed total: goods + packaging - discount + shipping + stated tax, in integer minor units",()=>{
 const r=priceQuote(request,quote({packagingMinor:200,discountMinor:300,taxIncluded:false,taxMinor:1500}),NOW);
 assert.equal(r.status,"comparable");
 assert.equal(r.landedTotal,String(100*1000+200-300+500+1500)); // 101900
 assert.equal(r.perUnitMinor,"1019");assert.equal(r.perUnitMillis,"1019000");
 assert.equal(r.adjustedQuantity,false);
});

test("pack size and minimum order adjust the quantity visibly instead of silently",()=>{
 const packed=priceQuote({...request,quantity:100},quote({packSize:12,packPriceMinor:12000}),NOW);
 assert.equal(packed.unitsOrdered,108);assert.equal(packed.adjustedQuantity,true);assert.match(packed.adjustmentNote,/108 units/);
 assert.equal(packed.landedTotal,String(9*12000+500));
 const moq=priceQuote({...request,quantity:10},quote({minOrderUnits:50}),NOW);
 assert.equal(moq.unitsOrdered,50);assert.equal(moq.landedTotal,String(50*1000+500));
});

test("missing shipping, tax or lead time makes a quote INCOMPLETE: a lower bound that is never ranked against complete quotes",()=>{
 const r=priceQuote(request,quote({shippingMinor:undefined,taxIncluded:false}),NOW);
 assert.equal(r.status,"incomplete");assert.deepEqual(r.missing,["shipping not stated","tax not stated"]);assert.equal(r.isLowerBoundOnly,true);
 const cmp=compareQuotes({request,now:NOW,quotes:[quote({supplierName:"Complete",packPriceMinor:1200}),quote({supplierName:"Cheap but incomplete",packPriceMinor:100,shippingMinor:undefined})]});
 assert.deepEqual(cmp.comparable.map(q=>q.supplierName),["Complete"]);assert.deepEqual(cmp.incomplete.map(q=>q.supplierName),["Cheap but incomplete"]);
 assert.equal(cmp.cheapest,null,"a single complete quote is not 'the cheapest' of anything");
});

test("exclusions explain themselves: other currency (no conversion), expired, bad dates, contradictory tax, oversized discount, garbage numbers",()=>{
 const why=(q,re)=>{const r=priceQuote(request,q,NOW);assert.equal(r.status,"excluded");assert.match(r.reason,re);};
 why(quote({currency:"USD"}),/does not convert currencies/);
 why(quote({validUntil:"2026-11-21T23:59:59Z"}),/expired/);
 why(quote({validUntil:"soon"}),/expiry/);
 why(quote({taxIncluded:true,taxMinor:100}),/included and also lists/);
 why(quote({discountMinor:200000}),/discount is larger/);
 why(quote({packPriceMinor:10.5}),/whole number/);
 why(quote({packPriceMinor:-1}),/out of range/);
 why(quote({packSize:0}),/pack size/i);
 why(quote({packPriceMinor:Number.MAX_SAFE_INTEGER}),/out of range/);
 why(null,/missing/);
 assert.equal(priceQuote(request,quote({validUntil:"2026-11-22T12:00:00Z"}),NOW).status,"comparable"); // expiry boundary: valid exactly at the instant
});

test("ranking is neutral: total, then lead time, then name; promotion and input order never change it",()=>{
 const quotes=[quote({supplierId:"c",supplierName:"Charlie",packPriceMinor:1000,leadTimeDays:5,promoted:true}),quote({supplierId:"a",supplierName:"Alpha",packPriceMinor:1000,leadTimeDays:2}),
  quote({supplierId:"b",supplierName:"Bravo",packPriceMinor:900,leadTimeDays:9}),quote({supplierId:"d",supplierName:"Delta",packPriceMinor:1000,leadTimeDays:2,promoted:true})];
 const order=cmp=>cmp.comparable.map(q=>q.supplierName);
 const a=compareQuotes({request,quotes,now:NOW});
 assert.deepEqual(order(a),["Bravo","Alpha","Delta","Charlie"]);
 assert.deepEqual(order(compareQuotes({request,quotes:[...quotes].reverse(),now:NOW})),order(a));
 assert.deepEqual(order(compareQuotes({request,quotes:quotes.map(q=>({...q,promoted:!q.promoted})),now:NOW})),order(a));
 assert.equal(a.comparable.find(q=>q.supplierName==="Charlie").promoted,true); // labelled, not boosted
 assert.match(a.rankingNote,/Promotion never affects order/);
 assert.equal(a.cheapest,"Bravo");
});

test("savings are claimed only against a documented, comparable, recent, complete baseline",()=>{
 const best=priceQuote(request,quote({packPriceMinor:900}),NOW); // (900*100 + 500 shipping) / 100 = 905 per unit -> 905000 millis
 const req={item:"Rice 25kg",currency:"GHS"};
 const baseline=(o={})=>({item:"rice 25kg",currency:"GHS",complete:true,paidAt:"2026-10-01T00:00:00Z",landedPerUnitMillis:1_000_000,...o});
 const ok=savingsAgainst(best,baseline(),req,NOW);
 assert.deepEqual([ok.claimed,ok.savedPerUnitMillis,ok.savedBps],[true,"95000",950]);
 for(const [b,re] of [[undefined,/No baseline/],[baseline({currency:"USD"}),/different currency/],[baseline({item:"Oil"}),/different item/],[baseline({complete:false}),/not comparable/],
   [baseline({paidAt:"2025-01-01T00:00:00Z"}),/more than a year/],[baseline({paidAt:"2027-01-01T00:00:00Z"}),/invalid/],[baseline({landedPerUnitMillis:0}),/invalid/],[baseline({landedPerUnitMillis:500_000}),/not cheaper/]]){
  const s=savingsAgainst(best,b,req,NOW);assert.equal(s.claimed,false);assert.match(s.reason,re);
 }
});

test("randomized quotes: order-independent, totals always equal an independent recomputation, never negative, never throws on supplier data",()=>{
 let seed=20261122;const rnd=()=>(seed=(seed*1664525+1013904223)>>>0)/2**32;const pick=a=>a[Math.floor(rnd()*a.length)];
 for(let round=0;round<300;round++){
  const req={item:"x",quantity:1+Math.floor(rnd()*500),currency:"GHS"};
  const quotes=Array.from({length:1+Math.floor(rnd()*6)},(_,i)=>({supplierId:"s"+i,supplierName:"S"+i,currency:rnd()<0.1?"USD":"GHS",packPriceMinor:Math.floor(rnd()*5000),
   packSize:rnd()<0.5?undefined:1+Math.floor(rnd()*24),minOrderUnits:rnd()<0.5?undefined:1+Math.floor(rnd()*100),shippingMinor:rnd()<0.15?undefined:Math.floor(rnd()*3000),
   packagingMinor:rnd()<0.5?undefined:Math.floor(rnd()*500),discountMinor:rnd()<0.6?undefined:Math.floor(rnd()*300),taxIncluded:rnd()<0.5,taxMinor:undefined,
   leadTimeDays:rnd()<0.1?undefined:Math.floor(rnd()*30),validUntil:rnd()<0.1?"2026-01-01T00:00:00Z":"2026-12-31T00:00:00Z",promoted:rnd()<0.3}));
  quotes.forEach(q=>{if(!q.taxIncluded&&rnd()<0.7)q.taxMinor=Math.floor(rnd()*1000);});
  const a=compareQuotes({request:req,quotes,now:NOW}),b=compareQuotes({request:req,quotes:[...quotes].sort(()=>rnd()-0.5),now:NOW});
  assert.deepEqual(a.comparable.map(q=>q.supplierName),b.comparable.map(q=>q.supplierName));
  for(const r of [...a.comparable,...a.incomplete]){
   const q=quotes.find(x=>x.supplierId===r.supplierId);
   const pack=q.packSize??1,moq=q.minOrderUnits??1;let units=Math.max(req.quantity,moq);const packs=Math.ceil(units/pack);units=packs*pack;
   const expected=packs*q.packPriceMinor+(q.packagingMinor??0)-(q.discountMinor??0)+(q.shippingMinor??0)+(q.taxMinor??0);
   assert.equal(r.landedTotal,String(expected),`round ${round}`);assert.ok(expected>=0);assert.equal(r.unitsOrdered,units);
  }
  const totals=a.comparable.map(q=>q.landedTotalMinor);for(let i=1;i<totals.length;i++)assert.ok(totals[i-1]<=totals[i]);
 }
});

test("validates the request itself and bounds the number of quotes",()=>{
 for(const bad of [{...request,item:" "},{...request,quantity:0},{...request,quantity:1.5},{...request,currency:"gh"}])assert.throws(()=>compareQuotes({request:bad,quotes:[quote()],now:NOW}));
 assert.throws(()=>compareQuotes({request,quotes:Array(51).fill(quote()),now:NOW}),/1 to 50/);
 assert.throws(()=>compareQuotes({request,quotes:"x",now:NOW}));
});
