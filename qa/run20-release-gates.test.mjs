/** Run 20 authored negative-path QA — intentionally NOT RUN during source development.
 * These verify source invariants only; physical release acceptance is separate.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
 RUN20_GATES,defaultRun20Evidence,evaluateRun20Release,
 validateRun20Evidence,assertRun20ExternalActionAllowed
} from "../client/src/features/release/run20ReleaseGates.mjs";
import {exportRun20Worksheet,importRun20Worksheet}
 from "../client/src/features/release/run20WorksheetEnvelope.mjs";
const sha="a".repeat(40);
const data=()=>({sourceSha:sha,asOf:"2026-10-17T12:00:00.000Z",
 evidence:defaultRun20Evidence()});
test("all 20 mandatory gates start NOT RUN and remain NO-GO",()=>{
 const decision=evaluateRun20Release(data());
 assert.equal(RUN20_GATES.length,20);
 assert.equal(decision.decision,"NO-GO");
 assert.equal(decision.pending.length,20);
 assert.equal(decision.acceptedByOwner,false);
 assert.equal(decision.externalDeploymentPermitted,false);
 assert.equal(decision.paymentsPermitted,false);
 assert.equal(decision.policyLocks.staging,true);
});
test("report omitting or repeating an acceptance gate is rejected",()=>{
 const input=data();
 assert.throws(()=>evaluateRun20Release({...input,evidence:input.evidence.slice(1)}),/complete/i);
 const duplicates=[...input.evidence];duplicates[1]=duplicates[0];
 assert.throws(()=>evaluateRun20Release({...input,evidence:duplicates}),/Repeated/i);
});
test("manual GO is impossible despite every gate self-reporting PASS",()=>{
 const input=data();
 const evidence=input.evidence.map(row=>validateRun20Evidence({
  gateId:row.gateId,status:"pass",sourceSha:sha,
  observedAt:"2026-10-17T11:00:00.000Z",reviewerRole:"owner",
  evidenceFile:row.gateId+"-placeholder-note.txt",
  note:"Operator claims a PASS; proof was not independently reviewed."
 },sha));
 const result=evaluateRun20Release({...input,evidence});
 assert.equal(result.pending.length,0);
 assert.equal(result.claimsOfManualPass.length,20);
 assert.equal(result.decision,"NO-GO");
 assert.equal(result.verifiedByIndependentReview,false);
 assert.equal(result.externalDeploymentPermitted,false);
});
test("hash proof, wrong source and forged release decision fail closed",async()=>{
 const original=data();
 const text=await exportRun20Worksheet(original);
 const reopened=await importRun20Worksheet(text);
 assert.equal(reopened.decision.decision,"NO-GO");
 assert.equal(reopened.independentReview,false);
 const swapped=JSON.parse(text);
 swapped.payload.sourceSha="b".repeat(40);
 await assert.rejects(()=>importRun20Worksheet(JSON.stringify(swapped)),/invalid|source|mismatch|differs/i);
 const fake=JSON.parse(text);
 fake.payload.decision.decision="GO";
 await assert.rejects(()=>importRun20Worksheet(JSON.stringify(fake)),/differs/i);
});
test("future evidence, missing filename, wrong roles and unknown keys rejected",()=>{
 const good=data().evidence[0];
 assert.throws(()=>validateRun20Evidence({...good,status:"pass",
  sourceSha:sha,observedAt:"2026-10-17T13:00:00.000Z",
  note:"I clicked an unverified source approval switch.",reviewerRole:"owner",evidenceFile:""},sha),/artifact/i);
 assert.throws(()=>validateRun20Evidence({...good,approvalSecret:"123"},sha),/Invalid/i);
 const future=defaultRun20Evidence();
 future[0]={...future[0],status:"blocked",sourceSha:sha,
  observedAt:"2026-10-18T13:00:00.000Z",reviewerRole:"owner",
  note:"Release is blocked pending independent real device testing.",
  evidenceFile:""};
 assert.throws(()=>evaluateRun20Release({...data(),evidence:future}),/later/i);
});
test("external staging, live payments, cloud and merge are explicitly denied",()=>{
 for(const operation of ["staging-deploy","production-deploy","enable-payments",
 "public-storefront","cloud-ledger-sync","promote-release","merge-to-main"]){
  assert.throws(()=>assertRun20ExternalActionAllowed(operation),/not authorized/i);
 }
});
