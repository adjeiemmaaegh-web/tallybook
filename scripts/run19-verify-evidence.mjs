#!/usr/bin/env node
/** Run 19 — OFFLINE evidence file integrity verifier only.
 * No test execution, no browser launch, no service connection, no changes to
 * customer ledgers, and NEVER a release approval. The originating screenshots
 * and device observations must be independently reviewed.
 *
 * Usage:
 *   node scripts/run19-verify-evidence.mjs --file path/to/evidence.json --sha EXACT_40_CHAR_COMMIT
 */
import {readFile,stat} from "node:fs/promises";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {verifyRun19EvidencePayload,RUN19_CASES} from "../client/src/features/qa/run19Acceptance.mjs";

function fail(message){
 throw Error("Run 19 offline evidence integrity: "+message);
}
function argumentsFrom(argv){
 if(argv.length!==4||argv[0]!=="--file"||argv[2]!=="--sha"||
    typeof argv[1]!=="string"||!/^[0-9a-f]{40}$/i.test(argv[3]??""))
   fail("Use --file <local Run19 exported JSON> --sha <exact Git commit SHA>.");
 return {file:resolve(argv[1]),sourceSha:argv[3].toLowerCase()};
}
async function main(){
 const {file,sourceSha}=argumentsFrom(process.argv.slice(2));
 const meta=await stat(file);
 if(!meta.isFile()||meta.size<50||meta.size>768*1024)
   fail("Evidence file is missing, is not a regular file or exceeds 768 KiB.");
 const text=await readFile(file,"utf8");
 let envelope;
 try{envelope=JSON.parse(text);}catch{fail("Malformed JSON envelope.");}
 if(!envelope||typeof envelope!=="object"||Array.isArray(envelope)||
   Object.keys(envelope).sort().join(",")!=="kind,payload,sha256,version"||
   envelope.kind!=="tallybook-run19-evidence-envelope"||
   envelope.version!==1||!/^[0-9a-f]{64}$/.test(envelope.sha256??""))
   fail("Unknown or tampered evidence envelope.");
 const payload=verifyRun19EvidencePayload(envelope.payload);
 if(payload.sourceSha!==sourceSha)fail("Installed source SHA does not equal the expected exact release SHA.");
 const digest=createHash("sha256").update(JSON.stringify(payload),"utf8").digest("hex");
 if(digest!==envelope.sha256)fail("Evidence payload SHA-256 mismatch.");
 const count=RUN19_CASES.length,summary=payload.summary;
 const unresolved=payload.results.filter(x=>x.status!=="pass");
 const bad=payload.results.filter(x=>x.status==="fail");
 process.stdout.write(
   "RUN 19 EVIDENCE FILE HASH: MATCH\n"+
   "Matched exact source SHA: "+sourceSha+"\n"+
   "Number of mandatory cases in complete matrix: "+count+"\n"+
   "Manually reported PASS observations: "+summary.counts.pass+" (NOT independently corroborated)\n"+
   "Manually reported FAIL: "+summary.counts.fail+"\n"+
   "Manual checks still unresolved: "+unresolved.length+"\n"+
   "Explicit failed case IDs: "+(bad.map(x=>x.caseId).join(", ")||"none recorded")+"\n"+
   "Source file is not a test result from this verifier. Screenshots/logs/witnesses were not inspected.\n"+
   "INDEPENDENT OWNER UAT / REAL DEVICE SIGNOFF: NOT PERFORMED\n"+
   "COMMERCIAL RELEASE: NO-GO. External deployment and real payments are not authorized.\n"
 );
}
main().catch(e=>{
 process.stderr.write((e instanceof Error?e.message:"Unrecognized evidence error")+"\n");
 process.exitCode=2;
});
