/** Pure, disposable, offline preflight regression tests.
 * These exercise the actual Stage 21 script in temporary Git repositories.
 * They do not modify the user's checkout, trigger CI, or change customer data.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,writeFileSync,copyFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,dirname,resolve} from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const here=dirname(fileURLToPath(import.meta.url));
const script=resolve(here,"../scripts/stage21-baseline-audit.mjs");
function invoke(cwd,command,args){
 const result=spawnSync(command,args,{cwd,encoding:"utf8",timeout:60000});
 if(result.error)throw result.error;
 return result;
}
function write(root,path,body){
 const where=join(root,path);
 mkdirSync(dirname(where),{recursive:true});
 writeFileSync(where,body);
}
function fixture(){
 const root=mkdtempSync(join(tmpdir(),"tallybook-stage21-preflight-"));
 const ids=(prefix,count)=>Array.from({length:count},(_,i)=>prefix+"-"+String(i+1).padStart(3,"0"));
 const acceptance=ids("A",82),blockers=ids("B",47);
 write(root,"package.json",JSON.stringify({packageManager:"pnpm@10.34.0"}));
 write(root,".node-version","24.19.0\n");
 write(root,"pnpm-lock.yaml","lockfileVersion: '9.0'\n");
 write(root,"docs/release/traceability.json",JSON.stringify({
  release:"V19",decision:"NO-GO",
  units:acceptance.map(id=>({id,status:"implemented-unverified"}))
 }));
 write(root,"docs/release/blockers.json",JSON.stringify({
  release:"V19",decision:"NO-GO / INCOMPLETE",
  blockers:blockers.map(id=>({id,status:"implemented-unverified"}))
 }));
 write(root,"docs/release/stage21-original-id-manifest.json",JSON.stringify({
  kind:"tallybook-v19-stage21-original-ledger-ids",
  originalAcceptanceCount:82,originalBlockerCount:47,
  acceptanceIds:acceptance,blockerIds:blockers
 }));
 mkdirSync(join(root,"scripts"),{recursive:true});
 copyFileSync(script,join(root,"scripts","stage21-baseline-audit.mjs"));
 assert.equal(invoke(root,"git",["init","-q"]).status,0);
 assert.equal(invoke(root,"git",["config","user.email","test@example.invalid"]).status,0);
 assert.equal(invoke(root,"git",["config","user.name","Offline Stage21 QA"]).status,0);
 const commit=()=>{
  assert.equal(invoke(root,"git",["add","."]).status,0);
  const result=invoke(root,"git",["commit","-qm","Synthetic fixture"]);
  assert.equal(result.status,0,result.stderr);
  return invoke(root,"git",["rev-parse","HEAD"]).stdout.trim();
 };
 const audit=sha=>invoke(root,process.execPath,["scripts/stage21-baseline-audit.mjs","--sha",sha]);
 return {root,commit,audit,acceptance,blockers};
}
test("exact-SHA and 82/47 immutable record identities pass on disposable clean fixture",t=>{
 const x=fixture();
 t.after(()=>rmSync(x.root,{recursive:true,force:true}));
 const result=x.audit(x.commit());
 assert.equal(result.status,0,result.stdout+"\n"+result.stderr);
 const report=JSON.parse(result.stdout);
 assert.equal(report.registries.acceptance.originalMissing.length,0);
 assert.equal(report.registries.blockers.originalMissing.length,0);
 assert.equal(report.importScan.unresolved,0);
 assert.equal(report.decision,"NO-GO");
});
test("new discovered issue is allowed while the original 47 IDs must remain",t=>{
 const x=fixture();t.after(()=>rmSync(x.root,{recursive:true,force:true}));
 const p=join(x.root,"docs/release/blockers.json");
 const next={release:"V19",decision:"NO-GO / INCOMPLETE",
  blockers:[...x.blockers.map(id=>({id,status:"implemented-unverified"})),
    {id:"B-048",status:"missing"}]};
 writeFileSync(p,JSON.stringify(next));
 const result=x.audit(x.commit());
 assert.equal(result.status,0,result.stdout+"\n"+result.stderr);
 assert.deepEqual(JSON.parse(result.stdout).registries.blockers.addedIds,["B-048"]);
});
test("deletion of original issue, duplicate ID and dirty worktree all fail closed",t=>{
 const x=fixture();t.after(()=>rmSync(x.root,{recursive:true,force:true}));
 let sha=x.commit();
 write(x.root,"docs/release/blockers.json",JSON.stringify({
  release:"V19",decision:"NO-GO / INCOMPLETE",
  blockers:x.blockers.slice(1).map(id=>({id,status:"implemented-unverified"}))
 }));
 sha=x.commit();
 const missing=x.audit(sha);
 assert.notEqual(missing.status,0);
 assert.match(missing.stdout,/Missing frozen blockers ID/);
 write(x.root,"docs/release/blockers.json",JSON.stringify({
  release:"V19",decision:"NO-GO / INCOMPLETE",
  blockers:[...x.blockers.map(id=>({id,status:"implemented-unverified"})),
    {id:x.blockers[0],status:"implemented-unverified"}]
 }));
 sha=x.commit();
 const repeated=x.audit(sha);
 assert.notEqual(repeated.status,0);
 assert.match(repeated.stdout,/Duplicate\\/malformed blockers entry/);
 write(x.root,"uncommitted.txt","untracked unsanitized fixture");
 assert.match(x.audit(sha).stdout,/Worktree contains uncommitted changes/);
});
test("ambiguous sibling .ts and .mjs and missing imports are detected",t=>{
 const x=fixture();t.after(()=>rmSync(x.root,{recursive:true,force:true}));
 // Construct synthetic import statements without putting their complete
 // text in this test source: a dependency-free preflight scanner must not
 // misread quoted fixture examples as imports from the QA directory.
 write(x.root,"client/src/example.ts",'im'+'port {value} from "./ambiguous";\n'+'im'+'port "./missing";\n');
 write(x.root,"client/src/ambiguous.ts","export const value=1;\n");
 write(x.root,"client/src/ambiguous.mjs","export const value=2;\n");
 const out=x.audit(x.commit());
 assert.notEqual(out.status,0);
 assert.match(out.stdout,/Ambiguous \.ts\/\.mjs import/);
 assert.match(out.stdout,/Missing local import/);
});
