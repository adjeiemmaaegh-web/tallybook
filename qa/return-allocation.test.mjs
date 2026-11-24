import test from "node:test";
import assert from "node:assert/strict";
import {allocateReturnToTenders as alloc,pointsToReverse as pts,returnPolicyChoices} from "../client/src/features/sales/returnAllocation.mjs";

const legs=(...a)=>a.map(([method,capacityMinor])=>({method,capacityMinor}));
const sum=r=>r.reduce((n,l)=>n+l.amountMinor,0);

test("defaults are original tenders, proportional, and loyalty reversed; older policy revisions without the fields get the defaults",()=>{
 assert.deepEqual(returnPolicyChoices(undefined),{refundAllocation:"proportional",loyaltyOnReturn:"reverse",redeemedPointsOnReturn:"restore"});
 assert.deepEqual(returnPolicyChoices({}),{refundAllocation:"proportional",loyaltyOnReturn:"reverse",redeemedPointsOnReturn:"restore"});
 assert.deepEqual(returnPolicyChoices({refundAllocation:"reverse-order",loyaltyOnReturn:"keep"}),{refundAllocation:"reverse-order",loyaltyOnReturn:"keep",redeemedPointsOnReturn:"restore"});
 assert.throws(()=>returnPolicyChoices({refundAllocation:"anything"}),/unsupported/);
 assert.throws(()=>returnPolicyChoices({loyaltyOnReturn:"maybe"}),/unsupported/);
});

test("proportional: shares follow the original tenders, exactly, largest remainder with stable ties",()=>{
 assert.deepEqual(alloc({valueMinor:1000,legs:legs(["cash",6000],["mobile",4000])}),[{method:"cash",amountMinor:600},{method:"mobile",amountMinor:400}]);
 // 100 across three equal legs: 34/33/33, remainder to the earliest leg
 assert.deepEqual(alloc({valueMinor:100,legs:legs(["cash",1000],["mobile",1000],["card",1000])}),[{method:"cash",amountMinor:34},{method:"mobile",amountMinor:33},{method:"card",amountMinor:33}]);
 assert.deepEqual(alloc({valueMinor:1,legs:legs(["cash",5],["card",5])}),[{method:"cash",amountMinor:1}]); // zero legs omitted
});

test("reverse-order: the last tender used is refunded first, then the one before",()=>{
 const l=legs(["cash",3000],["mobile",2000]);
 assert.deepEqual(alloc({valueMinor:1500,legs:l,policy:"reverse-order"}),[{method:"mobile",amountMinor:1500}]);
 assert.deepEqual(alloc({valueMinor:2500,legs:l,policy:"reverse-order"}),[{method:"cash",amountMinor:500},{method:"mobile",amountMinor:2000}]);
});

test("refuses over-allocation, bad legs and unknown policy; never returns more than a leg's remaining capacity",()=>{
 assert.throws(()=>alloc({valueMinor:101,legs:legs(["cash",100])}),/larger than what is left/);
 assert.throws(()=>alloc({valueMinor:0,legs:legs(["cash",100])}),/Invalid/);
 assert.throws(()=>alloc({valueMinor:1,legs:legs(["cash",100],["cash",100])}),/distinct/);
 assert.throws(()=>alloc({valueMinor:1,legs:[]}),/one to three/);
 assert.throws(()=>alloc({valueMinor:1,legs:legs(["a",1],["b",1],["c",1],["d",1])}),/one to three/);
 assert.throws(()=>alloc({valueMinor:1,legs:legs(["cash",-1])}),/Invalid/);
 assert.throws(()=>alloc({valueMinor:1,legs:legs(["cash",1.5])}),/Invalid/);
 assert.throws(()=>alloc({valueMinor:1,legs:legs(["cash",100]),policy:"cash-first"}),/Unsupported/);
 assert.throws(()=>alloc({valueMinor:Number.MAX_SAFE_INTEGER+1,legs:legs(["cash",1])}),/Invalid/);
});

test("randomized: sums exactly, respects capacities, is order-independent of rounding luck, and repeated returns drain tenders exactly",()=>{
 let seed=20261123;const rnd=()=>(seed=(seed*1664525+1013904223)>>>0)/2**32;
 for(const policy of ["proportional","reverse-order"]){
  for(let round=0;round<2000;round++){
   const n=1+Math.floor(rnd()*3),methods=["cash","mobile","card"].slice(0,n);
   const caps=methods.map(()=>Math.floor(rnd()*100000));
   const total=caps.reduce((a,b)=>a+b,0);if(total===0)continue;
   const value=1+Math.floor(rnd()*total);
   const r=alloc({valueMinor:value,legs:legs(...methods.map((m,i)=>[m,caps[i]])),policy});
   assert.equal(sum(r),value,`${policy} round ${round}`);
   for(const l of r)assert.ok(l.amountMinor<=caps[methods.indexOf(l.method)]);
  }
  // drain: many small returns until nothing is left; total refunded per tender equals what was paid, never more
  for(let round=0;round<300;round++){
   const methods=["cash","mobile","card"].slice(0,1+Math.floor(rnd()*3)),paid=methods.map(()=>1+Math.floor(rnd()*5000));
   const left=[...paid];let remaining=left.reduce((a,b)=>a+b,0);
   while(remaining>0){
    const v=Math.min(remaining,1+Math.floor(rnd()*400));
    const r=alloc({valueMinor:v,legs:legs(...methods.map((m,i)=>[m,left[i]])),policy});
    for(const l of r){const i=methods.indexOf(l.method);assert.ok(l.amountMinor<=left[i]);left[i]-=l.amountMinor;}
    remaining-=v;
   }
   assert.deepEqual(left,methods.map(()=>0));
  }
 }
});

test("points: reversal is proportional to the paid money refunded, cumulative and exact",()=>{
 const base={earnedPoints:10,paidMinor:10000,balancePoints:100};
 assert.deepEqual(pts({...base,refundedBeforeMinor:0,refundedAfterMinor:5000}),{reverse:5,shortfall:0,due:5});
 assert.deepEqual(pts({...base,refundedBeforeMinor:5000,refundedAfterMinor:10000}),{reverse:5,shortfall:0,due:5});
 // rounding never loses or invents points: tiny returns add up to the full amount
 let before=0,total=0;for(const step of [1,999,3000,2500,3500]){const after=before+step;total+=pts({...base,refundedBeforeMinor:before,refundedAfterMinor:after}).reverse;before=after;}
 assert.equal(before,10000);assert.equal(total,10);
 assert.equal(pts({...base,refundedBeforeMinor:0,refundedAfterMinor:999}).reverse,0); // floor: no premature deduction
});

test("points: never negative, shortfall recorded, 'keep' policy and no-points sales do nothing",()=>{
 assert.deepEqual(pts({earnedPoints:10,paidMinor:100,refundedBeforeMinor:0,refundedAfterMinor:100,balancePoints:3}),{reverse:3,shortfall:7,due:10});
 assert.deepEqual(pts({earnedPoints:10,paidMinor:100,refundedBeforeMinor:0,refundedAfterMinor:100,balancePoints:0}),{reverse:0,shortfall:10,due:10});
 assert.deepEqual(pts({earnedPoints:10,paidMinor:100,refundedBeforeMinor:0,refundedAfterMinor:100,balancePoints:99,policy:"keep"}),{reverse:0,shortfall:0,due:0});
 assert.deepEqual(pts({earnedPoints:0,paidMinor:100,refundedBeforeMinor:0,refundedAfterMinor:50,balancePoints:9}),{reverse:0,shortfall:0,due:0});
 assert.deepEqual(pts({earnedPoints:5,paidMinor:0,refundedBeforeMinor:0,refundedAfterMinor:0,balancePoints:9}),{reverse:0,shortfall:0,due:0});
 for(const bad of [{refundedAfterMinor:101},{refundedBeforeMinor:60,refundedAfterMinor:50},{earnedPoints:-1},{balancePoints:1.5},{policy:"x"}])
  assert.throws(()=>pts({earnedPoints:10,paidMinor:100,refundedBeforeMinor:0,refundedAfterMinor:50,balancePoints:9,...bad}));
});

test("randomized points: total reversed never exceeds earned, equals earned when everything is refunded and balance allows",()=>{
 let seed=7;const rnd=()=>(seed=(seed*1664525+1013904223)>>>0)/2**32;
 for(let round=0;round<2000;round++){
  const earned=Math.floor(rnd()*500),paid=1+Math.floor(rnd()*100000);let before=0,total=0;
  while(before<paid){const after=Math.min(paid,before+1+Math.floor(rnd()*paid/3+1));
   const r=pts({earnedPoints:earned,paidMinor:paid,refundedBeforeMinor:before,refundedAfterMinor:after,balancePoints:10**9});total+=r.reverse;before=after;}
  assert.equal(total,earned,`round ${round}`);
 }
});

test("spent points given back: cumulative ceiling (customer-favourable), exact at full return, monotone, never above what was spent; forfeit gives none", async () => {
  const {redeemedPointsToRestore, returnPolicyChoices} = await import("../client/src/features/sales/returnAllocation.mjs");
  const r = (before, after, policy) => redeemedPointsToRestore({redeemedPoints: 3, discountMinor: 200, returnedDiscountBeforeMinor: before, returnedDiscountAfterMinor: after, policy}).restore;
  assert.equal(r(0, 100), 2);            // half the discount returned: 1.5 points rounds UP for the customer
  assert.equal(r(100, 200), 1);          // the rest: total exactly 3
  assert.equal(r(0, 1), 1);              // a sliver returns a whole point (customer-favourable)
  let total = 0, prev = 0; for (const step of [1, 7, 50, 120, 199, 200]) { total += r(prev, step); prev = step; }
  assert.equal(total, 3);                // any sequence of returns sums to exactly what was spent
  assert.equal(r(0, 200, "forfeit"), 0);
  assert.throws(() => r(100, 50));       // cumulative must not go backwards
  assert.throws(() => r(0, 201));        // cannot return more discount than the sale had
  assert.throws(() => r(0, 100, "bogus"));
  assert.equal(returnPolicyChoices({}).redeemedPointsOnReturn, "restore");
  assert.throws(() => returnPolicyChoices({redeemedPointsOnReturn: "bogus"}));
});
