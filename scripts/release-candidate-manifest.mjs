#!/usr/bin/env node
// Exact-commit release-candidate manifest (ST32-01/ST32-11 tooling). Deterministic: no timestamps, no absolute paths, content read from git
// objects (not the working tree), so the same commit always yields the same manifestSha256. It records; it never deploys or applies anything.
// Usage: node scripts/release-candidate-manifest.mjs [--ref HEAD] [--dist dist] [--out file] [--allow-dirty]
//        node scripts/release-candidate-manifest.mjs --verify file [--dist dist]
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {readFileSync,writeFileSync,readdirSync,lstatSync,existsSync} from "node:fs";
import {join,resolve} from "node:path";
import {pathToFileURL} from "node:url";

const sha=b=>createHash("sha256").update(b).digest("hex");
const git=(cwd,args,opts={})=>execFileSync("git",args,{cwd,maxBuffer:512*1024*1024,...opts});
const canon=v=>JSON.stringify(v,(k,x)=>x&&typeof x==="object"&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(key=>[key,x[key]])):x);

function walkDist(dir,prefix=""){
  const out=[];
  for(const name of readdirSync(join(dir,prefix)).sort()){
    const rel=prefix?`${prefix}/${name}`:name, st=lstatSync(join(dir,rel));
    if(st.isSymbolicLink())throw new Error(`Build output contains a symlink: ${rel}`);
    if(st.isDirectory())out.push(...walkDist(dir,rel));
    else if(st.isFile())out.push({path:rel,sha256:sha(readFileSync(join(dir,rel))),bytes:st.size});
    else throw new Error(`Build output contains a non-regular entry: ${rel}`);
  }
  return out;
}

export function buildManifest({repoDir=".",ref="HEAD",distDir,allowDirty=false}={}){
  const cwd=resolve(repoDir);
  const dirty=git(cwd,["status","--porcelain"]).toString().trim().length>0;
  if(dirty&&!allowDirty)throw new Error("Working tree is not clean: freeze a committed state (or pass --allow-dirty for a non-candidate preview).");
  const commit=git(cwd,["rev-parse","--verify",`${ref}^{commit}`]).toString().trim();
  const tree=git(cwd,["rev-parse",`${commit}^{tree}`]).toString().trim();
  const listing=git(cwd,["ls-tree","-r","-z","--full-tree",commit]).toString("utf8").split("\0").filter(Boolean);
  const files=[];
  for(const line of listing){
    const m=/^(\d{6}) (blob|commit) ([0-9a-f]{40})\t(.+)$/s.exec(line); // git ls-tree -z: "<mode> <type> <sha>\t<path>"
    if(!m)throw new Error("Unrecognised tree entry");
    const [,mode,type,,path]=m;
    if(type==="commit")throw new Error(`Submodule entries are not allowed in a release candidate: ${path}`);
    if(mode==="120000")throw new Error(`Symlinks are not allowed in a release candidate: ${path}`);
    const bytes=git(cwd,["cat-file","blob",`${commit}:${path}`]);
    files.push({path,sha256:sha(bytes),bytes:bytes.length,mode});
  }
  files.sort((a,b)=>a.path<b.path?-1:1);
  const find=p=>files.find(f=>f.path===p)?.sha256??null;
  const body={
    schema:1,commit,tree,dirty,fileCount:files.length,
    toolchain:{nodeVersionFile:find(".node-version"),packageJson:find("package.json"),lockfile:find("pnpm-lock.yaml")},
    migrations:files.filter(f=>/^supabase\/migrations\/[^/]+\.sql$/.test(f.path)).map(f=>({name:f.path.split("/").pop(),sha256:f.sha256})),
    rollbacks:files.filter(f=>/^supabase\/rollback\/[^/]+\.sql$/.test(f.path)).map(f=>({name:f.path.split("/").pop(),sha256:f.sha256})),
    files,
  };
  if(distDir){
    if(!existsSync(distDir))throw new Error(`Build output not found: ${distDir}`);
    const dist=walkDist(resolve(distDir));
    body.build={fileCount:dist.length,files:dist,treeSha256:sha(canon(dist))};
  }
  return {...body,manifestSha256:sha(canon(body))};
}

/** Recompute and report every difference; empty array means the candidate is exactly what the manifest says. */
export function verifyManifest(manifest,{repoDir=".",distDir}={}){
  const problems=[];
  const {manifestSha256,...body}=manifest;
  if(sha(canon(body))!==manifestSha256)problems.push("manifest hash does not match its own content (the manifest was edited)");
  let now;
  try{now=buildManifest({repoDir,ref:manifest.commit,distDir:manifest.build?distDir:undefined,allowDirty:true});}
  catch(e){return [...problems,`cannot rebuild: ${e.message}`];}
  if(manifest.build&&!distDir)problems.push("manifest includes a build but no --dist was given to verify it");
  const before=new Map(manifest.files.map(f=>[f.path,f.sha256])),after=new Map(now.files.map(f=>[f.path,f.sha256]));
  for(const [p,h] of before){if(!after.has(p))problems.push(`missing: ${p}`);else if(after.get(p)!==h)problems.push(`changed: ${p}`);}
  for(const p of after.keys())if(!before.has(p))problems.push(`unexpected: ${p}`);
  if(manifest.build&&now.build){
    const b=new Map(manifest.build.files.map(f=>[f.path,f.sha256])),a=new Map(now.build.files.map(f=>[f.path,f.sha256]));
    for(const [p,h] of b){if(!a.has(p))problems.push(`build missing: ${p}`);else if(a.get(p)!==h)problems.push(`build changed: ${p}`);}
    for(const p of a.keys())if(!b.has(p))problems.push(`build unexpected: ${p}`);
  }
  return problems;
}

if(import.meta.url===pathToFileURL(process.argv[1]??"").href){
  const arg=n=>{const i=process.argv.indexOf(n);return i>=0?process.argv[i+1]:undefined;};
  try{
    if(arg("--verify")){
      const problems=verifyManifest(JSON.parse(readFileSync(arg("--verify"),"utf8")),{distDir:arg("--dist")});
      if(problems.length){console.error(problems.join("\n"));process.exit(1);}
      console.log("Release candidate matches the manifest.");
    }else{
      const m=buildManifest({ref:arg("--ref")??"HEAD",distDir:arg("--dist"),allowDirty:process.argv.includes("--allow-dirty")});
      const text=JSON.stringify(m,null,1)+"\n";
      if(arg("--out"))writeFileSync(arg("--out"),text);else process.stdout.write(text);
      console.error(`commit ${m.commit.slice(0,12)}  files ${m.fileCount}  migrations ${m.migrations.length}  manifest ${m.manifestSha256.slice(0,16)}${m.dirty?"  (DIRTY: not a candidate)":""}`);
    }
  }catch(e){console.error(e.message);process.exit(1);}
}
