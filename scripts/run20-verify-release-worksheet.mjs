#!/usr/bin/env node
/** Run 20 — offline local worksheet shape/hash/decision verifier only.
 * Never executes QA, builds, deployment, provider payments or sign-off.
 * Usage: node scripts/run20-verify-release-worksheet.mjs --file evidence.json --sha <40-char commit>
 */
import {readFile,stat} from "node:fs/promises";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {evaluateRun20Release,RUN20_GATES} from "../client/src/features/release/run20ReleaseGates.mjs";
const reject=x=>{throw Error("Run 20 worksheet: "+x);};
function args(values){
 if(values.length!==4||values[0]!=="--file"||values[2]!=="--sha"||
   !/^[a-f0-9]{40}$/i.test(values[3]??""))
   reject("Usage: --file path/to/worksheet.json --sha exact40charcommit");
 return {file:resolve(values[1]),sha:values[3].toLowerCase()};
}
async function main(){
 const {file,sha}=args(process.argv.slice(2));
 const statValue=await stat(file);
 if(!statValue.isFile()||statValue.size<100||statValue.size>384000)
   reject("Missing or oversized worksheet.");
 let root;
 try{root=JSON.parse(await readFile(file,"utf8"));}
 catch{reject("Invalid worksheet JSON.");}
 if(!root||typeof root!=="object"||Array.isArray(root)||
   Object.keys(root).sort().join(",")!=="formatVersion,kind,payload,sha256"||
   root.kind!=="tallybook-v19-run20-evidence-envelope"||
   root.formatVersion!==1||!/^[a-f0-9]{64}$/.test(root.sha256??""))
   reject("Unsupported worksheet envelope.");
 const payload=root.payload;
 if(!payload||typeof payload!=="object"||Array.isArray(payload)||
   Object.keys(payload).sort().join(",")!=="asOf,decision,evidence,formatVersion,kind,sourceSha"||
   payload.kind!=="tallybook-v19-run20-release-readiness"||payload.formatVersion!==1||
   payload.sourceSha!==sha)reject("Wrong source or unsupported worksheet fields.");
 const outcome=evaluateRun20Release(payload);
 if(JSON.stringify(outcome)!==JSON.stringify(payload.decision))
   reject("Worksheet has a forged or inconsistent release decision.");
 const digest=createHash("sha256").update(JSON.stringify(payload),"utf8").digest("hex");
 if(digest!==root.sha256)reject("File checksum mismatch.");
 process.stdout.write(
   "Run 20 local worksheet HASH: MATCH (this is NOT a human signature)\n"+
   "Exact source candidate SHA: "+sha+"\n"+
   "Mandatory gate rows: "+RUN20_GATES.length+"\n"+
   "Self-reported PASS claims: "+outcome.claimsOfManualPass.length+" (not independently verified)\n"+
   "Open/unpassed gate rows: "+outcome.pending.length+"\n"+
   "Explicit failure claims: "+outcome.failed.join(", ")+"\n"+
   "Run 19 real physical evidence and separate owner/signoff documents were NOT verified by this script.\n"+
   "External staging: NOT AUTHORIZED. Live payments: NOT AUTHORIZED. Production: NOT AUTHORIZED.\n"+
   "FINAL RELEASE DECISION: NO-GO\n"
 );
}
main().catch(e=>{process.stderr.write((e instanceof Error?e.message:"Invalid worksheet")+"\n");process.exitCode=2;});
