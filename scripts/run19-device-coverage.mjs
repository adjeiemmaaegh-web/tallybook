#!/usr/bin/env node
/** Run 19 — offline multi-device evidence coverage summary.
 * This checks report file shapes and hashes only. No physical-device
 * interaction, human signatures or external service is performed.
 *
 * Example:
 *  node scripts/run19-device-coverage.mjs --sha EXACT40 --files win.json android.json
 */
import {readBoundedEvidence} from "./read-bounded-evidence.mjs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {verifyRun19EvidencePayload,run19CrossDeviceCoverage}
 from "../client/src/features/qa/run19Acceptance.mjs";
function fail(text){throw Error("Run 19 coverage: "+text);}
async function checkedPayload(file,expectedSha){
 const path=resolve(file);
 let envelope;try{envelope=JSON.parse(await readBoundedEvidence(path,{minBytes:50,maxBytes:768*1024}));}
 catch{fail("Invalid JSON in one device file.");}
 if(!envelope||typeof envelope!=="object"||Array.isArray(envelope)||
    Object.keys(envelope).sort().join(",")!=="kind,payload,sha256,version"||
    envelope.kind!=="tallybook-run19-evidence-envelope"||envelope.version!==1||
    !/^[0-9a-f]{64}$/.test(envelope.sha256??""))
   fail("Unknown evidence envelope.");
 const p=verifyRun19EvidencePayload(envelope.payload);
 const calculated=createHash("sha256").update(JSON.stringify(p),"utf8").digest("hex");
 if(calculated!==envelope.sha256)fail("Device report hash mismatch.");
 if(p.sourceSha!==expectedSha)fail("A device report uses the wrong Git source SHA.");
 return p;
}
async function main(){
 const args=process.argv.slice(2);
 if(args[0]!=="--sha"||!/^[0-9a-f]{40}$/i.test(args[1]??"")||
    args[2]!=="--files"||args.length<5||args.length>53)
   fail("Usage: --sha EXACT40 --files windows.json android.json [other devices...]");
 const expectedSha=args[1].toLowerCase();
 const payloads=[];
 for(const name of args.slice(3))payloads.push(await checkedPayload(name,expectedSha));
 const summary=run19CrossDeviceCoverage(payloads);
 process.stdout.write("RUN 19 MULTI-DEVICE EVIDENCE HASH CHECK: VALID FILE FORMATS\n");
 process.stdout.write("Source SHA: "+summary.sourceSha+"\n");
 process.stdout.write("Device evidence archives: "+summary.campaigns+"\n");
 process.stdout.write("Windows/Android platform gaps: "+summary.coverageGaps.length+"\n");
 for(const gap of summary.coverageGaps)
   process.stdout.write("  NOT COVERED: "+gap.caseId+" / "+gap.platforms.join(" + ")+"\n");
 process.stdout.write("Cases with reported FAIL: "+summary.reportedFailures.length+"\n");
 for(const item of summary.reportedFailures)
   process.stdout.write("  REPORTED FAIL: "+item+"\n");
 process.stdout.write(
   "Integrity hashes do not authenticate observations, prove hardware, inspect screenshots or constitute UAT.\n"+
   "INDEPENDENT DEVICE REVIEW / OWNER SIGNOFF: OPEN.\n"+
   "COMMERCIAL RELEASE: NO-GO. No cloud or live payment authorization.\n"
 );
}
main().catch(e=>{process.stderr.write((e instanceof Error?e.message:"Evidence summary failed")+"\n");process.exitCode=2;});
