import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtempSync,writeFileSync,mkdirSync,symlinkSync,rmSync,readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {buildManifest,verifyManifest} from "../scripts/release-candidate-manifest.mjs";

const run=(cwd,...a)=>execFileSync("git",a,{cwd,stdio:"pipe"}).toString();
function repo(){
  const d=mkdtempSync(join(tmpdir(),"rcm-"));
  run(d,"init","-q");run(d,"config","user.email","t@example.invalid");run(d,"config","user.name","t");run(d,"config","commit.gpgsign","false");
  mkdirSync(join(d,"supabase/migrations"),{recursive:true});mkdirSync(join(d,"supabase/rollback"),{recursive:true});
  writeFileSync(join(d,"package.json"),'{"name":"x"}');writeFileSync(join(d,"pnpm-lock.yaml"),"lock: 1\n");writeFileSync(join(d,".node-version"),"24\n");
  writeFileSync(join(d,"supabase/migrations/20260101_a.sql"),"select 1;");writeFileSync(join(d,"supabase/rollback/20260101_a_down.sql"),"select 0;");
  writeFileSync(join(d,"app.js"),"console.log(1)");
  run(d,"add","-A");run(d,"commit","-qm","c1");
  return d;
}

test("same commit gives byte-identical manifests; records commit, tree, migrations, rollbacks and toolchain hashes",()=>{
  const d=repo();
  try{
    const a=buildManifest({repoDir:d}),b=buildManifest({repoDir:d});
    assert.equal(a.manifestSha256,b.manifestSha256);
    assert.equal(a.commit,run(d,"rev-parse","HEAD").trim());assert.equal(a.dirty,false);
    assert.deepEqual(a.migrations.map(m=>m.name),["20260101_a.sql"]);assert.deepEqual(a.rollbacks.map(m=>m.name),["20260101_a_down.sql"]);
    assert.ok(a.toolchain.lockfile&&a.toolchain.nodeVersionFile&&a.toolchain.packageJson);
    assert.equal(a.files.length,a.fileCount);
    assert.ok(!JSON.stringify(a).includes(d),"no absolute path may leak into the manifest");
    assert.deepEqual(verifyManifest(a,{repoDir:d}),[]);
  }finally{rmSync(d,{recursive:true,force:true});}
});

test("refuses a dirty tree for a candidate; --allow-dirty marks it as not a candidate",()=>{
  const d=repo();
  try{
    writeFileSync(join(d,"app.js"),"console.log(2)");
    assert.throws(()=>buildManifest({repoDir:d}),/not clean/);
    assert.equal(buildManifest({repoDir:d,allowDirty:true}).dirty,true);
    writeFileSync(join(d,"untracked.txt"),"x");run(d,"checkout","--","app.js");
    assert.throws(()=>buildManifest({repoDir:d}),/not clean/); // untracked files also block a candidate
  }finally{rmSync(d,{recursive:true,force:true});}
});

test("content comes from the commit: later commits change the new manifest, and the old manifest still verifies against its own commit",()=>{
  const d=repo();
  try{
    const first=buildManifest({repoDir:d});
    writeFileSync(join(d,"app.js"),"console.log(2)");run(d,"commit","-qam","c2");
    const second=buildManifest({repoDir:d});
    assert.notEqual(first.manifestSha256,second.manifestSha256);assert.notEqual(first.commit,second.commit);
    assert.deepEqual(verifyManifest(first,{repoDir:d}),[]);
  }finally{rmSync(d,{recursive:true,force:true});}
});

test("verify detects an edited manifest, a rewritten file list and a wrong commit",()=>{
  const d=repo();
  try{
    const m=buildManifest({repoDir:d});
    const forged=structuredClone(m);forged.files[0].sha256="0".repeat(64);
    const p=verifyManifest(forged,{repoDir:d});
    assert.ok(p.some(x=>/edited/.test(x)),"self-hash mismatch");assert.ok(p.some(x=>/changed:/.test(x)));
    const fewer=structuredClone(m);fewer.files.pop();
    assert.ok(verifyManifest(fewer,{repoDir:d}).some(x=>/unexpected:|edited/.test(x)));
    const wrong=structuredClone(m);wrong.commit="0".repeat(40);
    assert.ok(verifyManifest(wrong,{repoDir:d}).some(x=>/cannot rebuild|edited/.test(x)));
  }finally{rmSync(d,{recursive:true,force:true});}
});

test("file names containing tabs, spaces and unicode are recorded exactly",()=>{
  const d=repo();
  try{
    writeFileSync(join(d,"a b.txt"),"1");writeFileSync(join(d,"tab\there.txt"),"2");writeFileSync(join(d,"ünï.txt"),"3");
    run(d,"add","-A");run(d,"commit","-qm","odd names");
    const m=buildManifest({repoDir:d});
    for(const name of ["a b.txt","tab\there.txt","ünï.txt"])assert.ok(m.files.some(f=>f.path===name),JSON.stringify(name));
    assert.deepEqual(verifyManifest(m,{repoDir:d}),[]);
  }finally{rmSync(d,{recursive:true,force:true});}
});

test("symlinks and submodules cannot be part of a candidate",()=>{
  const d=repo();
  try{
    symlinkSync("app.js",join(d,"link.js"));run(d,"add","-A");run(d,"commit","-qm","link");
    assert.throws(()=>buildManifest({repoDir:d}),/Symlinks are not allowed/);
  }finally{rmSync(d,{recursive:true,force:true});}
});

test("build output is part of the manifest: any changed, added or removed built file fails verification; symlinks refused",()=>{
  const d=repo(),dist=join(d,"..",`dist-${Date.now()}`);
  try{
    mkdirSync(join(dist,"assets"),{recursive:true});writeFileSync(join(dist,"index.html"),"<html>");writeFileSync(join(dist,"assets/a.js"),"a");
    const m=buildManifest({repoDir:d,distDir:dist});
    assert.equal(m.build.fileCount,2);assert.deepEqual(verifyManifest(m,{repoDir:d,distDir:dist}),[]);
    assert.ok(verifyManifest(m,{repoDir:d}).some(x=>/no --dist/.test(x)));
    writeFileSync(join(dist,"assets/a.js"),"tampered");
    assert.ok(verifyManifest(m,{repoDir:d,distDir:dist}).some(x=>x==="build changed: assets/a.js"));
    writeFileSync(join(dist,"assets/a.js"),"a");writeFileSync(join(dist,"extra.js"),"e");
    assert.ok(verifyManifest(m,{repoDir:d,distDir:dist}).some(x=>x==="build unexpected: extra.js"));
    rmSync(join(dist,"extra.js"));rmSync(join(dist,"index.html"));
    assert.ok(verifyManifest(m,{repoDir:d,distDir:dist}).some(x=>x==="build missing: index.html"));
    writeFileSync(join(dist,"index.html"),"<html>");symlinkSync("index.html",join(dist,"s.html"));
    assert.throws(()=>buildManifest({repoDir:d,distDir:dist}),/symlink/);
  }finally{rmSync(d,{recursive:true,force:true});rmSync(dist,{recursive:true,force:true});}
});

test("the CLI writes a manifest for this repository's HEAD without modifying anything",()=>{
  const out=join(mkdtempSync(join(tmpdir(),"rcm-out-")),"m.json");
  execFileSync("node",["scripts/release-candidate-manifest.mjs","--allow-dirty","--out",out],{cwd:new URL("..",import.meta.url).pathname,stdio:"pipe"});
  const m=JSON.parse(readFileSync(out,"utf8"));
  assert.match(m.commit,/^[0-9a-f]{40}$/);assert.ok(m.migrations.length>10);assert.ok(m.fileCount>100);
});
