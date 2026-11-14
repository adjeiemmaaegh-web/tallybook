#!/usr/bin/env node
/**
 * Repository-wide read-only QA inventory. Review indicators are NOT proven bugs.
 * Reports file paths/line numbers, never secrets or source excerpts.
 */
import { existsSync, readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const sourceRoots = ["client/src", "server", "shared", "supabase/functions"];
const skip = new Set(["node_modules", "dist", "build", ".git", "artifacts", "coverage", ".pnpm-store"]);
const sourceExt = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);
const testName = /(?:\.test\.|\.spec\.|\/tests\/|\/__tests__\/)/;
const rules = [
  ["dynamic_code_execution", /\beval\s*\(|\bnew\s+Function\s*\(|\bdangerouslySetInnerHTML\s*=|\.innerHTML\s*=/],
  ["test_suppression", /@ts-ignore|@ts-nocheck|eslint-disable/],
  ["direct_html_write", /document\.write\s*\(/],
  ["insecure_request_literal", /(?:["'`])http:\/\/[^/"'`]/],
  ["potential_secret_storage", /\blocalStorage\.(?:setItem|getItem)\s*\([^\n]{0,120}(?:token|secret|password|session)/i],
  ["weak_random_usage", /\bMath\.random\s*\(/],
];
export function inspectSourceLine(line) {
  return rules.filter(([,pattern]) => pattern.test(line)).map(([name]) => name);
}
export function auditRepository(base = root) {
  const all = [];
  const visit = path => {
    if (!existsSync(path)) return;
    for (const item of readdirSync(path, {withFileTypes:true})) {
      if (item.name.startsWith(".") && item.name !== ".github") continue;
      if (skip.has(item.name)) continue;
      const abs = join(path, item.name);
      if (item.isDirectory()) visit(abs);
      else if (item.isFile()) all.push(relative(base, abs).replaceAll("\\", "/"));
    }
  };
  for (const d of [...sourceRoots, "qa", "scripts", ".github/workflows"]) visit(join(base, d));
  const isSource = p => sourceRoots.some(d=>p.startsWith(d+"/")) && sourceExt.has(extname(p)) &&
     !testName.test(p) && !/\.d\.(?:ts|mts|cts)$/.test(p);
  const source = all.filter(isSource).sort();
  const tests = all.filter(p=>testName.test(p) && sourceExt.has(extname(p))).sort();
  const workflows = all.filter(p=>p.startsWith(".github/workflows/") && /\.(?:yml|yaml)$/.test(p)).sort();
  const directCompanions = [];
  const sizeRanking = [];
  const indicators = [];
  for (const p of source) {
    const abs = join(base,p);
    const content = readFileSync(abs,"utf8");
    const bytes = statSync(abs).size;
    sizeRanking.push({path:p,bytes});
    const stem=p.replace(/\.(?:tsx?|jsx?|mjs|cjs|mts|cts)$/,"");
    if (tests.some(t=>t.startsWith(stem+".test.")||t.startsWith(stem+".spec."))) directCompanions.push(p);
    content.split(/\r?\n/).forEach((line,i)=>{
      for (const type of inspectSourceLine(line)) {
        // Zero source excerpts to prevent accidental disclosure of secrets.
        indicators.push({type,path:p,line:i+1});
      }
    });
  }
  const manifest = {
    kind:"tallybook-full-repository-qa-inventory-v1",
    gitSha:process.env.GITHUB_SHA || null,
    reportDate:new Date().toISOString(),
    statistics:{
      trackedPathsExamined:all.length,
      sourceFiles:source.length,
      testFiles:tests.length,
      workflowFiles:workflows.length,
      testDirSplit:{
        browser:tests.filter(p=>/\.spec\./.test(p)).length,
        native:tests.filter(p=>/^(qa|server\/tests)\//.test(p) && /\.test\./.test(p)).length,
        colocated:tests.filter(p=>p.startsWith("client/src/")&&/\.test\./.test(p)).length,
      },
      sourceWithDirectCompanion:directCompanions.length,
      // This is a naming signal only, never claim this is actual test/line coverage.
      sourceWithoutDirectCompanion:source.length-directCompanions.length,
    },
    oversizedModules:sizeRanking.filter(x=>x.bytes>=60000).sort((a,b)=>b.bytes-a.bytes),
    largestModules:sizeRanking.sort((a,b)=>b.bytes-a.bytes).slice(0,25),
    indicatorCounts:Object.fromEntries(rules.map(([name])=>[name,indicators.filter(x=>x.type===name).length])),
    indicators:indicators.slice(0,350),
    indicatorsTruncated:indicators.length>350,
    workflows,
    deliberateLimitations:[
      "Indicators may match comments or benign calls; require manual validation.",
      "Direct test companions are a filename heuristic, not execution or line coverage.",
      "Unit tests and UI smoke cannot replace real user, live provider, device and production acceptance.",
      "This audit does not open or mutate production databases."
    ],
  };
  return manifest;
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const result=auditRepository();
  const file=join(root,"artifacts/release-v19/full-repository-qa-inventory.json");
  mkdirSync(dirname(file),{recursive:true});
  writeFileSync(file,JSON.stringify(result,null,2)+"\n");
  console.log(JSON.stringify({
    saved:file,statistics:result.statistics,
    oversizedModules:result.oversizedModules,
    indicatorCounts:result.indicatorCounts,
    workflowFiles:result.workflows,
    note:"Review indicators, not confirmed vulnerabilities; no numeric coverage assertion."
  },null,2));
}
