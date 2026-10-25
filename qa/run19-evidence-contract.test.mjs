/** Authored for later QA ONLY — DO NOT EXECUTE during Run 19 source development.
 * These test fixtures prove no physical hardware and cannot sign a release.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
 RUN19_CASES,run19DefaultResults,run19Summary,validateRun19Result,
 createRun19EvidencePayload,verifyRun19EvidencePayload,run19CrossDeviceCoverage
} from "../client/src/features/qa/run19Acceptance.mjs";
import {
 exportRun19Envelope,importRun19Envelope
} from "../client/src/features/qa/run19EvidenceEnvelope.mjs";
const SHA="a".repeat(40);
const base=()=>({
 sourceSha:SHA,createdAt:"2026-10-17T12:00:00.000Z",
 devicePlatform:"Windows",deviceClass:"Disposable Windows 11 8GB",
 browser:"Edge 135",os:"Windows 11",operatorLabel:"Owner QA role",
 sampleDataOnly:true,noLivePayments:true,noExternalDeployment:true,
 results:run19DefaultResults()
});
test("full matrix is not accepted by default",()=>{
 const result=run19Summary(run19DefaultResults(),"Windows");
 assert.equal(result.productionAuthorized,false);
 assert.equal(result.ownerAcceptanceRecorded,false);
 assert.equal(result.releaseDecision,"NO-GO");
 assert.equal(result.criticalUnverified,RUN19_CASES.filter(c=>c.platform==="Windows"||c.platform==="Both").length);
 assert.equal(result.counts.pass,0);
});
test("missing, repeated, fabricated or removed device cases are rejected",()=>{
 const rows=run19DefaultResults();
 assert.throws(()=>run19Summary(rows.slice(1),"Windows"),/complete|mandatory/i);
 assert.throws(()=>run19Summary([...rows.slice(0,-1),rows[0]],"Windows"),/duplicate/i);
 const fake={...rows[0],status:"pass",observedAt:"2026-10-17T13:00:00.000Z",
   note:"Pressed browser button but retained no independent physical proof.",evidenceFile:""};
 assert.throws(()=>validateRun19Result(fake,"Windows"),/evidence file/i);
});
test("a manual pass with retained filename is still NO-GO",()=>{
 const rows=run19DefaultResults();
 rows[0]=validateRun19Result({caseId:rows[0].caseId,status:"pass",
  observedAt:"2026-10-17T13:00:00.000Z",
  note:"Owner observed local desktop launch without any attached GPU device.",
  evidenceFile:"R19-W01-physical-screen.png"},"Windows");
 const summary=run19Summary(rows,"Windows");
 assert.equal(summary.counts.pass,1);
 assert.equal(summary.releaseDecision,"NO-GO");
 assert.equal(summary.criticalUnverified,RUN19_CASES.filter(c=>c.platform==="Windows"||c.platform==="Both").length-1);
});
test("owner cannot waive mandatory checks; unsigned payload cannot authorize release",()=>{
 const rows=run19DefaultResults();
 assert.throws(()=>validateRun19Result({...rows[0],status:"not-applicable",
   note:"Device is unavailable to the owner for physical verification",
   observedAt:"2026-10-17T13:00:00.000Z"},"Windows"),/device-relevant/i);
 const report=createRun19EvidencePayload(base());
 assert.equal(report.sourceSha,SHA);
 assert.equal(verifyRun19EvidencePayload(report).summary.releaseDecision,"NO-GO");
 const changed=verifyRun19EvidencePayload({...report,sourceSha:"b".repeat(40)});
 assert.equal(changed.summary.releaseDecision,"NO-GO");
 assert.equal(changed.summary.productionAuthorized,false);
});
test("portable checksum detects accidental edits and does not sign UAT",async()=>{
 const report=createRun19EvidencePayload(base());
 const envelope=await exportRun19Envelope(report);
 const imported=await importRun19Envelope(envelope);
 assert.equal(imported.sha256.length,64);
 assert.equal(imported.integrity,"hash-match");
 assert.equal(imported.independentReview,false);
 assert.equal(imported.releaseAuthorized,false);
 const corrupt=JSON.parse(envelope);
 corrupt.payload.deviceClass="Unreviewed replacement hardware";
 await assert.rejects(()=>importRun19Envelope(JSON.stringify(corrupt)),/mismatch/i);
});
test("unknown external source fields cannot silently enter protected evidence",()=>{
 const rows=run19DefaultResults();
 assert.throws(()=>validateRun19Result({...rows[0],customerPIN:"999999"},"Windows"),/invalid/i);
 const report=createRun19EvidencePayload(base());
 assert.throws(()=>verifyRun19EvidencePayload({...report,productionApproved:true}),/Unsupported/i);
});

test("Windows cannot claim Android-only PASS or waive a Windows case",()=>{
 const android=RUN19_CASES.find(c=>c.platform==="Android");
 const windows=RUN19_CASES.find(c=>c.platform==="Windows");
 assert.ok(android&&windows);
 assert.throws(()=>validateRun19Result({
  caseId:android.id,status:"pass",note:"Pretended Android install worked on Windows desktop.",
  observedAt:"2026-10-17T11:00:00.000Z",evidenceFile:"android-absent.png"
 },"Windows"),/another operating system/i);
 assert.throws(()=>validateRun19Result({
  caseId:windows.id,status:"not-applicable",
  note:"This check is mandatory on the selected Windows device.",
  observedAt:"2026-10-17T11:00:00.000Z",evidenceFile:""
 },"Windows"),/device-relevant/i);
});
test("platform-combined coverage never approves release from manually claimed observations",()=>{
 const win=createRun19EvidencePayload(base());
 const android=createRun19EvidencePayload({...base(),devicePlatform:"Android",
  deviceClass:"Disposable Android phone"});
 const combined=run19CrossDeviceCoverage([win,android]);
 assert.equal(combined.campaigns,2);
 assert.ok(combined.coverageGaps.length>0);
 assert.equal(combined.independentReviewerSigned,false);
 assert.equal(combined.releaseDecision,"NO-GO");
 assert.throws(()=>run19CrossDeviceCoverage([win,{...android,sourceSha:"b".repeat(40)}]),/source|tampered/i);
});
