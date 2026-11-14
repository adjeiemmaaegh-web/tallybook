import test from "node:test";
import assert from "node:assert/strict";
import {CLEMENTIA_CASES,clementiaVariants,clementiaMatrix} from "./clementia-sole-interface-cases.mjs";

test("Clementia sole-interface catalog has 100 distinct goals and twenty unique requests per goal",()=>{
  assert.equal(CLEMENTIA_CASES.length,100);
  assert.equal(new Set(CLEMENTIA_CASES.map(g=>g.title)).size,100);
  assert.deepEqual(
    Object.fromEntries(["NAV","FAQ","READ","ACTION","BOUNDARY"].map(f=>[f,CLEMENTIA_CASES.filter(g=>g.family===f).length])),
    {NAV:12,FAQ:12,READ:26,ACTION:26,BOUNDARY:24});
  const all=clementiaMatrix();
  assert.equal(all.length,2000);
  assert.equal(new Set(all.map(x=>x.id+":"+x.variant)).size,2000);
  for(const goal of CLEMENTIA_CASES){
    assert.equal(clementiaVariants(goal).length,20);
    assert.equal(goal.id.length,4);
    assert.ok(goal.title.trim());
  }
});
