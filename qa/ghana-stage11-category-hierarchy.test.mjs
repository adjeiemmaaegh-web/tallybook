import test from "node:test";
import assert from "node:assert/strict";
import {validateCategoryHierarchy} from "../client/src/features/inventory/categoryHierarchy.mjs";
const rows=[
 {id:"food",businessProfileId:"gh",name:"Food"},
 {id:"grain",businessProfileId:"gh",name:"Grains",parentCategoryId:"food"},
 {id:"rice",businessProfileId:"gh",name:"Rice",parentCategoryId:"grain"}
];
test("parent/category paths and allowed three-level nested groups are deterministic",()=>{
 const result=validateCategoryHierarchy(rows,"gh");
 assert.equal(result.depths.get("rice"),3);assert.equal(result.labels.get("rice"),"Food / Grains / Rice");
});
test("missing, foreign, duplicate, over-depth and cyclic parent structures fail closed",()=>{
 assert.throws(()=>validateCategoryHierarchy([{...rows[0],parentCategoryId:"unknown"}],"gh"),/parent missing/);
 assert.throws(()=>validateCategoryHierarchy([...rows,{...rows[0]}],"gh"),/Duplicate/);
 assert.throws(()=>validateCategoryHierarchy([...rows,{...rows[0],id:"bad",businessProfileId:"other"}],"gh"),/foreign/);
 assert.throws(()=>validateCategoryHierarchy([...rows,{id:"deep",businessProfileId:"gh",name:"A",parentCategoryId:"rice"}],"gh"),/depth/);
 assert.throws(()=>validateCategoryHierarchy(rows.map(x=>x.id==="food"?{...x,parentCategoryId:"rice"}:x),"gh"),/cycle/);
});
