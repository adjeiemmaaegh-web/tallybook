import test from "node:test";
import assert from "node:assert/strict";
import {evaluateLicences,PERMISSIVE,FORBIDDEN} from "../scripts/licence-policy.mjs";

const pkg=(name,...versions)=>({name,versions});
const set=(o)=>o;
test("permissive licences pass; nothing to report",()=>{
 const all=set({MIT:[pkg("a","1.0.0")],"Apache-2.0":[pkg("b","2.0.0")],ISC:[pkg("c","1.0.0")]});
 const r=evaluateLicences({prod:all,all});
 assert.equal(r.ok,true);assert.deepEqual(r.problems,[]);assert.deepEqual(r.obligations,[]);assert.equal(r.packageCount,3);
});
test("conditional licences are allowed but recorded, and marked shipped vs dev-only",()=>{
 const all=set({"OFL-1.1":[pkg("font","5.0.0")],"MPL-2.0":[pkg("axe","4.10.2")],"CC-BY-4.0":[pkg("caniuse","1.0.1","1.0.2")]});
 const prod=set({"OFL-1.1":[pkg("font","5.0.0")]});
 const r=evaluateLicences({prod,all});
 assert.equal(r.ok,true);
 assert.deepEqual(r.obligations.map(o=>[o.package,o.shipped]),[["axe@4.10.2",false],["caniuse@1.0.1",false],["caniuse@1.0.2",false],["font@5.0.0",true]]);
 assert.ok(r.obligations.every(o=>o.obligation.length>20));
});
test("strong/network copyleft, source-available, unlicensed and unknown licences are refused, and a shipped one is called out",()=>{
 for(const bad of ["GPL-3.0","GPL-2.0-only","AGPL-3.0-or-later","LGPL-2.1","SSPL-1.0","BUSL-1.1","UNLICENSED","UNKNOWN","SEE LICENSE IN LICENSE.txt","Commons-Clause","EUPL-1.2",""]){
  const all=set({[bad]:[pkg("x","1.0.0")]});
  const r=evaluateLicences({prod:all,all});
  assert.equal(r.ok,false,bad||"empty");assert.match(r.problems[0],/x@1\.0\.0/);
  assert.match(r.problems[0],/SHIPPED/);
  assert.doesNotMatch(evaluateLicences({prod:{},all}).problems[0],/SHIPPED/);
 }
});
test("a licence nobody has reviewed is not silently accepted",()=>{
 const all=set({"Fancy-1.0":[pkg("y","1.0.0")]});
 const r=evaluateLicences({prod:{},all});
 assert.equal(r.ok,false);assert.match(r.problems[0],/not on the reviewed list/);
});
test("policy sets are consistent: nothing is both permissive and forbidden",()=>{
 for(const l of PERMISSIVE)assert.equal(FORBIDDEN.test(l),false,l);
});
