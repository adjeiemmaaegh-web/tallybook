/** Authored for later QA ONLY — DO NOT EXECUTE during Run 19 source development.
 * These test fixtures prove no physical hardware and cannot sign a release.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
 RUN19_CASES,run19DefaultResults,run19Summary,validateRun19Result,
 createRun19EvidencePayload,verifyRun19EvidencePayload
} from "../client/src/features/qa/run19Acceptance.mjs";
import {
 exportRun19Envelope,importRun19Envelope
} from "../client/src/features/qa/run19EvidenceEnvelope.mjs";
const SHA="a".repeat(40);
const base=()=>({
 sourceSha:SHA,createdAt:"2026-10-17T12:00:00.000Z",
 deviceClass:"Disposable Windows 11 8GB",
 browser:"Edge 135",os:"Windows 11",operatorLabel:"Owner QA role",
 sampleDataOnly:true,noLivePayments:true,noExternalDeployment:true,
 results:run19DefaultResults()
});
test("full matrix is not accepted by default",()=>{
 const result=run19Summary(run19DefaultResults());
 assert.equal(result.productionAuthorized,false);
 assert.equal(result.ownerAcceptanceRecorded,false);
 assert.equal(result.releaseDecision,"NO-GO");
 assert.equal(result.criticalUnverified,RUN19_CASES.length);
 assert.equal(result.counts.pass,0);
});
test("missing, repeated, fabricated or removed device cases are rejected",()=>{
 const rows=run19DefaultResults();
 assert.throws(()=>run19Summary(rows.slice(1)),/complete|mandatory/i);
 assert.throws(()=>run19Summary([...rows.slice(0,-1),rows[0]]),/duplicate/i);
 const fake={...rows[0],status:"pass",observedAt:"2026-10-17T13:00:00.000Z",
   note:"Pressed browser button but retained no independent physical proof.",evidenceFile:""};
 assert.throws(()=>validateRun19Result(fake),/evidence file/i);
});
test("a manual pass with retained filename is still NO-GO",()=>{
 const rows=run19DefaultResults();
 rows[0]=validateRun19Result({caseId:rows[0].caseId,status:"pass",
  observedAt:"2026-10-17T13:00:00.000Z",
  note:"Owner observed local desktop launch without any attached GPU device.",
  evidenceFile:"R19-W01-physical-screen.png"});
 const summary=run19Summary(rows);
 assert.equal(summary.counts.pass,1);
 assert.equal(summary.releaseDecision,"NO-GO");
 assert.equal(summary.criticalUnverified,RUN19_CASES.length-1);
});
test("owner cannot silently exempt mandatory checks or import changed SHA",()=>{
 const rows=run19DefaultResults();
 assert.throws(()=>validateRun19Result({...rows[0],status:"not-applicable",
   note:"Device is unavailable to the owner for physical verification",
   observedAt:"2026-10-17T13:00:00.000Z"}),/Critical/i);
 const report=createRun19EvidencePayload(base());
 assert.equal(report.sourceSha,SHA);
 assert.equal(verifyRun19EvidencePayload(report).summary.releaseDecision,"NO-GO");
 assert.throws(()=>verifyRun19EvidencePayload({...report,sourceSha:"b".repeat(40)}),/tampered/i);
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
 assert.throws(()=>validateRun19Result({...rows[0],customerPIN:"999999"}),/invalid/i);
 const report=createRun19EvidencePayload(base());
 assert.throws(()=>verifyRun19EvidencePayload({...report,productionApproved:true}),/Unsupported/i);
});
