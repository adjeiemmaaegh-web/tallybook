#!/usr/bin/env node
/** Run 20 later-use LOCAL configuration inspection ONLY.
 * No builds, package installation, network calls, scripts, payment, deployment,
 * workflow dispatch, cloud connection or database access.
 */
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {
 RUN20_EXTERNAL_STAGING_APPROVED,RUN20_PRODUCTION_AUTHORIZED,
 RUN20_REAL_PAYMENTS_AUTHORIZED,RUN20_PUBLIC_COMMERCE_AUTHORIZED,
 RUN20_CLOUD_FINANCIAL_SYNC_AUTHORIZED,RUN20_AUTOMATIC_PROMOTION_ENABLED,
 RUN20_GATES
} from "../client/src/features/release/run20ReleaseGates.mjs";
const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
const problems=[];
const read=async path=>readFile(resolve(root,path),"utf8").catch(()=>{
 problems.push("Missing file: "+path);return "";
});
async function main(){
 const [vercelText,nodeText,pkgText,vite,server]=await Promise.all([
  read("vercel.json"),read(".node-version"),read("package.json"),
  read("vite.config.ts"),read("server/index.ts")
 ]);
 let vercel,pkg;
 try{vercel=JSON.parse(vercelText);}catch{problems.push("Malformed deployment configuration");}
 try{pkg=JSON.parse(pkgText);}catch{problems.push("Malformed package scripts");}
 if(vercel?.git?.deploymentEnabled!==false)
   problems.push("Git deployment flag is not explicitly OFF.");
 if(typeof nodeText!=="string"||!/^24\./.test(nodeText.trim()))
   problems.push("Node 24 source baseline is absent.");
 if(!pkg?.scripts?.check||!pkg?.scripts?.test||!pkg?.scripts?.build)
   problems.push("QA/type/build scripts are missing from source.");
 if(!vite.includes('registerType: "prompt"'))
   problems.push("Offline update source is not configured for manual approval.");
 if(!server.includes("X-Content-Type-Options"))
   problems.push("Server response header hardening source is missing.");
 if([
  RUN20_EXTERNAL_STAGING_APPROVED,RUN20_PRODUCTION_AUTHORIZED,
  RUN20_REAL_PAYMENTS_AUTHORIZED,RUN20_PUBLIC_COMMERCE_AUTHORIZED,
  RUN20_CLOUD_FINANCIAL_SYNC_AUTHORIZED,RUN20_AUTOMATIC_PROMOTION_ENABLED
 ].some(Boolean))problems.push("An external activation authorization flag is unexpectedly enabled.");
 if(RUN20_GATES.length!==20)problems.push("Mandatory release-gate register is incomplete.");
 process.stdout.write(
  "RUN 20 SOURCE CONFIGURATION INSPECTION — NOT A TEST OR RELEASE APPROVAL\n"+
  "Source configuration review findings: "+problems.length+"\n"+
  problems.map(x=>"  REVIEW REQUIRED: "+x+"\n").join("")+
  "No staging account was contacted, no payment was attempted, no build or test executed.\n"+
  "This script does not inspect live cloud secrets, providers, release artifacts, device QA or acceptance signatures.\n"+
  "RELEASE DECISION: NO-GO. EXTERNAL DEPLOYMENT: DISABLED.\n"
 );
 if(problems.length)process.exitCode=2;
}
main().catch(e=>{process.stderr.write((e instanceof Error?e.message:"Preflight error")+"\n");process.exitCode=2;});
