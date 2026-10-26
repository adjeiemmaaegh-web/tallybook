#!/usr/bin/env node
/**
 * Stage 21 exact-source developer QA harness. Run only on a disposable,
 * developer-controlled checkout with pinned Node/pnpm and test dependencies.
 * No customer dataset, real payment, cloud service or deployment operation.
 *
 * node scripts/stage21-run-developer-qa.mjs --sha EXACT_40_CHAR_COMMIT
 *
 * Set TALLYBOOK_STAGE21_ALLOW_INSTALL=1 to include frozen dependency install.
 * Without this opt-in, existing dependencies must already be installed.
 * Set TALLYBOOK_STAGE21_NPM_FALLBACK=1 to run against existing node_modules
 * when pinned pnpm is unavailable. This is labeled non-CI-equivalent.
 * All test categories are attempted; process exits nonzero if any fails.
 */
import {execFileSync,spawnSync} from "node:child_process";
import {mkdirSync,writeFileSync,appendFileSync,openSync,closeSync,existsSync,readdirSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const expected=process.argv[2]==="--sha"?process.argv[3]:"";
if(process.argv.includes("--help")){
 process.stdout.write("Usage: node scripts/stage21-run-developer-qa.mjs --sha EXACT_40_CHAR_COMMIT\n"+
  "Run on disposable developer data. With existing dependencies; to reinstall the frozen lockfile set TALLYBOOK_STAGE21_ALLOW_INSTALL=1.\n"+
  "For an existing-dependency npm fallback set TALLYBOOK_STAGE21_NPM_FALLBACK=1; that result is not pinned-pnpm CI evidence.\n"+
  "Captures native, client, TypeScript, production build, browser/auth/offline and dependency audit logs. NO deploy or payments.\n");
 process.exit(0);
}
if(process.argv.length!==4||!/^[0-9a-f]{40}$/i.test(expected)){
 process.stderr.write("Exact Git SHA required. No test or financial activity performed.\n");
 process.exit(2);
}
const invoke=(cmd,args,timeout=300000)=>spawnSync(cmd,args,{
 cwd:root,encoding:"utf8",timeout,maxBuffer:64*1024*1024,
 shell:process.platform==="win32"
});
let head="";
try{head=execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8",timeout:10000}).trim();}
catch(e){process.stderr.write("Git checkout not accessible: "+e.message+"\n");process.exit(2);}
if(head.toLowerCase()!==expected.toLowerCase()){
 process.stderr.write("Exact source SHA mismatch; refusing to produce mismatched QA evidence.\n");process.exit(2);
}
const dirty=invoke("git",["status","--porcelain"]);
if(dirty.status!==0||dirty.stdout.trim()){
 process.stderr.write("Working source has uncommitted changes. Commit or discard before developer QA.\n");process.exit(2);
}
if(process.version!=="v24.19.0"){
 process.stderr.write("Pinned Node v24.19.0 required, found "+process.version+".\n");process.exit(2);
}
const pnpm=process.platform==="win32"?"pnpm.cmd":"pnpm";
const version=invoke(pnpm,["--version"]);
const pinnedPnpm=version.status===0&&version.stdout.trim()==="10.34.0";
const npmFallback=!pinnedPnpm&&process.env.TALLYBOOK_STAGE21_NPM_FALLBACK==="1";
if(!pinnedPnpm&&!npmFallback){
 process.stderr.write("Pinned pnpm 10.34.0 missing or different. Set TALLYBOOK_STAGE21_NPM_FALLBACK=1 for labeled existing-dependency checks.\n");process.exit(2);
}
if(npmFallback&&process.env.TALLYBOOK_STAGE21_ALLOW_INSTALL==="1"){
 process.stderr.write("npm fallback cannot install from the pnpm lockfile. Use existing dependencies only.\n");process.exit(2);
}
const manager=pinnedPnpm?"pnpm 10.34.0":"npm fallback (existing dependencies; not CI equivalent)";
const npm=process.platform==="win32"?"npm.cmd":"npm";
const runPackage=(id,pnpmArgs,npmArgs,timeout)=>one(id,pinnedPnpm?pnpm:npm,pinnedPnpm?pnpmArgs:npmArgs,timeout);
const stamp=new Date().toISOString().replaceAll(":","-");
const folder=resolve(root,"artifacts","stage21-local-qa",stamp+"-"+head.slice(0,12));
mkdirSync(folder,{recursive:true});
const results=[];
function one(id,cmd,args,timeout=900000){
 // Stream output directly to a private file: large native/browser suites
 // must not buffer tens of megabytes into Node RAM on low-spec Windows.
 const out=resolve(folder,id+".log");
 writeFileSync(out,[
  "STAGE21 DEVELOPER VERIFICATION",id,
  "sha: "+head,"node: "+process.version,"package manager: "+manager,
  "command: "+cmd+" "+args.join(" "),"-- combined stdout and stderr --",""
 ].join("\n"),{encoding:"utf8",mode:0o600});
 const fd=openSync(out,"a",0o600);
 let result;
 try{
   result=spawnSync(cmd,args,{cwd:root,stdio:["ignore",fd,fd],timeout,
     shell:process.platform==="win32"});
 }finally{closeSync(fd);}
 appendFileSync(out,[
  "","-- process result --",
  "exit status: "+String(result.status),
  "signal: "+String(result.signal??"none"),
  "error: "+String(result.error?.message??"none"),""
 ].join("\n"),{encoding:"utf8"});
 const success=result.status===0&&!result.error;
 results.push({id,success,exitCode:result.status,error:result.error?.message??null,
   timeout:result.error?.code==="ETIMEDOUT"});
 process.stdout.write(id+": "+(success?"PASS":"FAIL/BLOCKED")+"\n");
}
const native=[
 "scripts/historical-costing-check.mjs",
 ...["qa","server/tests"].flatMap(dir=>
  existsSync(resolve(root,dir))?
   readdirSync(resolve(root,dir)).filter(name=>
    dir==="qa"?/\.test\.(?:mjs|cjs)$/.test(name):/\.test\.mjs$/.test(name)
   ).map(name=>dir+"/"+name).sort():[])
];
one("baseline",process.execPath,["scripts/stage21-baseline-audit.mjs","--sha",head],60000);
if(process.env.TALLYBOOK_STAGE21_ALLOW_INSTALL==="1")
 one("install",pnpm,["install","--frozen-lockfile"],900000);
else{
 const present=existsSync(resolve(root,"node_modules"));
 results.push({id:"install",success:present,exitCode:null,skipped:!present,
  note:"Existing dependencies; no network install was authorized."});
 process.stdout.write("install: "+(present?"existing dependencies":"BLOCKED, node_modules missing")+"\n");
}
const dependencies=results.find(x=>x.id==="install")?.success;
if(dependencies){
 one("native",process.execPath,["--experimental-strip-types","--test",...native],900000);
 // One worker is slower but avoids the IndexedDB/Vitest contention observed
 // in long Windows runs. Per-test limits surface hangs in the saved log.
 runPackage("client",["test","--maxWorkers=1","--testTimeout=60000","--hookTimeout=60000"],
   ["test","--","--maxWorkers=1","--testTimeout=60000","--hookTimeout=60000"],900000);
 runPackage("types",["check"],["run","check"],600000);
 runPackage("build",["build"],["run","build"],900000);
 runPackage("browser",["exec","playwright","test"],["exec","--","playwright","test"],900000);
 runPackage("auth-browser",["exec","playwright","test","--config","playwright.auth.config.mjs"],
   ["exec","--","playwright","test","--config","playwright.auth.config.mjs"],900000);
 runPackage("offline-browser",["exec","playwright","test","--config","playwright.offline.config.mjs"],
   ["exec","--","playwright","test","--config","playwright.offline.config.mjs"],900000);
 if(pinnedPnpm)one("dependencies",pnpm,["audit","--audit-level","moderate"],600000);
 else {
  results.push({id:"dependencies",success:false,skipped:true,reason:"npm fallback has no npm lockfile; pnpm lockfile audit not verified"});
  process.stdout.write("dependencies: BLOCKED, pinned pnpm required for lockfile audit\n");
 }
}else{
 for(const id of ["native","client","types","build","browser","auth-browser","offline-browser","dependencies"])
  results.push({id,success:false,skipped:true,reason:"Frozen dependencies not available"});
}
const pass=results.every(x=>x.success);
const summary={
 kind:"stage21-developer-qa-only",
 exactSourceSha:head,
 date:new Date().toISOString(),node:process.version,packageManager:manager,ciEquivalent:pinnedPnpm,
 outcomes:results,allChecksPassed:pass,
 ownerUatPerformed:false,independentSecurityAccepted:false,productionAuthorized:false,
 releaseDecision:"NO-GO",
 note:"Source tests never substitute for owner physical hardware UAT or explicit launch authorization."
};
writeFileSync(resolve(folder,"summary.json"),JSON.stringify(summary,null,2)+"\n",{encoding:"utf8",mode:0o600});
process.stdout.write("Evidence directory: "+folder+"\n");
process.stdout.write("Development QA: "+(pass?"SUITES PASSED (NOT RELEASE APPROVAL)":"INCOMPLETE / FAILURES")+"\n");
if(!pass)process.exitCode=2;
