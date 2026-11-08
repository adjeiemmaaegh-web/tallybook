import test from "node:test";
import assert from "node:assert/strict";
import {calculateGhanaVat, validateGhanaVatEvidence} from "../client/src/features/sales/ghanaVat.mjs";
const policy={enabled:true,registrationStatus:"registered",registrationNumber:"TEST-GRA-TIN",scheme:"ghana-vat-2026",rateBasisPoints:2000,priceMode:"exclusive"};
const evidence=(base,detail,mode="exclusive")=>({
  subtotalMinor:base, discountMinor:0, totalMinor:detail.totalMinor,
  tax:{policy:{...policy,priceMode:mode},ghana:detail,taxMinor:detail.taxMinor,totalMinor:detail.totalMinor,taxableMinor:detail.taxableMinor}
});
test("Act 1151 applies 15%, 2.5%, 2.5% to the SAME exclusive base",()=>{
 const g=calculateGhanaVat([{amountMinor:100000,treatment:"standard"}],0,"exclusive");
 assert.deepEqual([g.vatMinor,g.nhilMinor,g.getFundMinor,g.taxMinor,g.totalMinor],[15000,2500,2500,20000,120000]);
 assert.equal(g.eVatStatus,"not-certified");
 assert.equal(validateGhanaVatEvidence(evidence(100000,g)),true);
});
test("inclusive price extracts exactly the same Ghana VAT components",()=>{
 const g=calculateGhanaVat([{amountMinor:120000,treatment:"standard"}],0,"inclusive");
 assert.deepEqual([g.taxableBaseMinor,g.vatMinor,g.nhilMinor,g.getFundMinor,g.totalMinor],[100000,15000,2500,2500,120000]);
 assert.equal(validateGhanaVatEvidence(evidence(120000,g,"inclusive")),true);
});
test("discounts are allocated across standard, zero-rated and exempt supplies",()=>{
 const g=calculateGhanaVat([
  {amountMinor:10000,treatment:"standard"},
  {amountMinor:10000,treatment:"exempt"},
  {amountMinor:10000,treatment:"zero-rated"}
 ],3000,"exclusive");
 assert.deepEqual([g.standardMinor,g.exemptMinor,g.zeroRatedMinor],[9000,9000,9000]);
 assert.deepEqual([g.vatMinor,g.nhilMinor,g.getFundMinor,g.totalMinor],[1350,225,225,28800]);
 const sale=evidence(30000,g);sale.discountMinor=3000;
 assert.equal(validateGhanaVatEvidence(sale),true);
});
test("inclusive rounding preserves the sum of all components and invoice total",()=>{
 for(let minor=1;minor<180;minor++){
  const g=calculateGhanaVat([{amountMinor:minor,treatment:"standard"}],0,"inclusive");
  assert.equal(g.taxableMinor+g.taxMinor,g.totalMinor);
  assert.equal(g.vatMinor+g.nhilMinor+g.getFundMinor,g.taxMinor);
  assert.equal(g.taxableBaseMinor+g.taxMinor,g.standardMinor);
 }
});
test("rejects unclassified items, malformed money and altered tax",()=>{
 assert.throws(()=>calculateGhanaVat([{amountMinor:1000}],0,"exclusive"),/Classify every product/);
 assert.throws(()=>calculateGhanaVat([{amountMinor:1000,treatment:"standard"}],1001,"exclusive"),/discount/);
 assert.throws(()=>calculateGhanaVat([{amountMinor:Number.MAX_SAFE_INTEGER,treatment:"standard"}],0,"exclusive"),/safe currency/);
 const g=calculateGhanaVat([{amountMinor:10000,treatment:"standard"}],0,"exclusive");
 const tampered=evidence(10000,{...g,nhilMinor:g.nhilMinor+1});
 assert.throws(()=>validateGhanaVatEvidence(tampered),/component/);
 assert.throws(()=>validateGhanaVatEvidence({...evidence(10000,g),tax:{...evidence(10000,g).tax,policy:{...policy,registrationStatus:"unknown"}}}),/policy/);
});
