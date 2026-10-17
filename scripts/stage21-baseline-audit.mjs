#!/usr/bin/env node
/**
 * Stage 21 developer baseline: local-only, read-only, zero dependencies.
 * Detects source layout and ledger-registry drift before installing packages.
 * No deployment, payment operation, network access, mutation or user data.
 *
 * Usage: node scripts/stage21-baseline-audit.mjs --sha GIT_COMMIT_SHA
 */
import {readFileSync,existsSync,readdirSync,statSync} from "node:fs";
import {resolve,dirname,relative,extname} from "node:path";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const fail=[];
const note=[];
function file(p){return resolve(root,p);}
function read(p){return readFileSync(file(p),"utf8");}
function json(p){try{return JSON.parse(read(p));}catch(e){fail.push("Invalid or unreadable "+p+": "+e.message);return null;}}
const expected=process.argv.length===4&&process.argv[2]==="--sha"?process.argv[3]:"";
if(!/^[a-f0-9]{40}$/i.test(expected)) {
 process.stderr.write("Usage: node scripts/stage21-baseline-audit.mjs --sha EXACT40GITCOMMIT\n");
 process.exit(2);
}
let actual="";
try{actual=execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8",timeout:10000}).trim();}
catch(e){fail.push("Git HEAD unavailable: "+e.message);}
if(actual.toLowerCase()!==expected.toLowerCase())fail.push("Working source SHA differs from requested release source");
let dirty="";
try{dirty=execFileSync("git",["status","--porcelain"],{cwd:root,encoding:"utf8",timeout:10000}).trim();}
catch(e){fail.push("Git worktree status unavailable: "+e.message);}
if(dirty)fail.push("Worktree contains uncommitted changes; source provenance is not immutable");

const pkg=json("package.json");
const trace=json("docs/release/traceability.json");
const issues=json("docs/release/blockers.json");
const lockExists=existsSync(file("pnpm-lock.yaml"));
if(!lockExists)fail.push("Missing pnpm lockfile");
if(pkg?.packageManager!=="pnpm@10.34.0")fail.push("Unsupported or unpinned pnpm toolchain");
if(read(".node-version").trim()!=="24.19.0")fail.push("Node 24.19.0 pin not preserved");
const statuses=new Set(["implemented-unverified","implemented-and-tested","missing","blocked"]);
function registry(rows,title,required){
 if(!Array.isArray(rows)||rows.length!==required){
  fail.push(title+" contains "+(rows?.length??"no")+" entries, expected "+required);
  return {count:rows?.length??0,byStatus:{}};
 }
 const ids=new Set(),byStatus={};
 for(const row of rows){
  if(!row||typeof row.id!=="string"||ids.has(row.id)||!statuses.has(row.status))
   fail.push("Duplicate/malformed "+title+" entry: "+String(row?.id));
  ids.add(row.id);
  byStatus[row.status]=(byStatus[row.status]??0)+1;
 }
 return {count:rows.length,byStatus};
}
const acceptance=registry(trace?.units,"acceptance",82);
const blockers=registry(issues?.blockers,"blockers",47);
if(trace?.decision!=="NO-GO")fail.push("Acceptance ledger unexpectedly leaves NO-GO");
if(!String(issues?.decision??"").includes("NO-GO"))fail.push("Issue ledger unexpectedly leaves NO-GO");

const skipDir=new Set(["node_modules",".git","dist","build",".pnpm-store","artifacts",".next","coverage"]);
const sourceExt=new Set([".ts",".tsx",".mjs",".js",".jsx",".cjs"]);
const all=new Set(),sources=[];
function visit(abs) {
 for(const item of readdirSync(abs,{withFileTypes:true})){
  if(item.isDirectory()){
   if(!skipDir.has(item.name))visit(resolve(abs,item.name));
  }else if(item.isFile()){
   const rel=relative(root,resolve(abs,item.name)).replaceAll("\\","/");
   all.add(rel);
   if(sourceExt.has(extname(item.name))&&
      (rel.startsWith("client/src/")||rel.startsWith("server/")||
       rel.startsWith("shared/")||rel.startsWith("scripts/")||rel.startsWith("qa/")))
     sources.push(rel);
  }
 }
}
visit(root);

const candidates=["",".ts",".tsx",".mts",".cts",".js",".jsx",".mjs",".cjs",".json",
 ".css",".scss",".svg",".png",".webp",".jpg",".jpeg","/index.ts","/index.tsx",
 "/index.js","/index.mjs","/index.jsx","/index.d.mts"];
const matches=[
 /\b(?:import|export)\s+(?:[^"'()]*?\s+from\s*)?["']([^"']+)["']/g,
 /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
 /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g
];
const unresolved=[],counted=new Set(),sameStemCollision=[];
for(const path of sources){
 const content=read(path);
 for(const pattern of matches){
  pattern.lastIndex=0;let match;
  while((match=pattern.exec(content))){
   const spec=match[1].split("?")[0];
   if(!(spec.startsWith(".")||spec.startsWith("@/")||spec.startsWith("@shared/")))continue;
   const base=spec.startsWith("@/")?"client/src/"+spec.slice(2):
     spec.startsWith("@shared/")?"shared/"+spec.slice(8):
     relative(root,resolve(dirname(file(path)),spec)).replaceAll("\\","/");
   const key=path+" -> "+spec;
   if(counted.has(key))continue;
   counted.add(key);
   if(!candidates.some(ext=>all.has(base+ext))){
    unresolved.push({file:path,spec});
   }
  }
 }
 // Extensionless import near a same-name .mjs and .ts can load the wrong
 // database module on Windows Node. Report in CI rather than auto-rewrite.
 for(const pattern of matches){
  pattern.lastIndex=0;let match;
  while((match=pattern.exec(content))){
   const spec=match[1];
   if(!spec.startsWith(".")||extname(spec)||spec.includes("?"))continue;
   const base=relative(root,resolve(dirname(file(path)),spec)).replaceAll("\\","/");
   if(all.has(base+".mjs")&&all.has(base+".ts"))
     sameStemCollision.push({file:path,spec});
  }
 }
}
for(const broken of unresolved.slice(0,60))fail.push("Missing local import: "+broken.file+" => "+broken.spec);
if(unresolved.length>60)fail.push("Additional unresolved local imports: "+(unresolved.length-60));
for(const collision of sameStemCollision.slice(0,30))fail.push("Ambiguous .ts/.mjs import: "+collision.file+" => "+collision.spec);
if(sameStemCollision.length>30)fail.push("Additional .ts/.mjs collisions: "+(sameStemCollision.length-30));
const output={
 stage:21,sourceSha:actual,decision:"NO-GO",registries:{acceptance,blockers},
 importScan:{sourceFiles:sources.length,localImports:counted.size,
  unresolved:unresolved.length,ambiguousTsMjs:sameStemCollision.length},
 lockfilePresent:lockExists,
 notes:note,
 problems:fail,
 internallyVerified:false,ownerUatAuthorized:false,externalReleaseAuthorized:false
};
process.stdout.write(JSON.stringify(output,null,2)+"\n");
if(fail.length)process.exitCode=2;
