/** Offline, non-mutating Stage 1 gate runner; never installs or contacts services. */
import {spawnSync} from 'node:child_process';
import {existsSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {classifyGate,summarizeStage1} from './stage1-gate-policy.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const steps=[];
const has=(path)=>existsSync(resolve(root,path));
function run(name,command,args,ready=true,reason='required dependency unavailable'){
 if(!ready){steps.push({name,status:'BLOCKED',reason});return;}
 const p=spawnSync(command,args,{cwd:root,encoding:'utf8',timeout:180000,maxBuffer:12*1024*1024});
 steps.push({name,status:classifyGate({error:p.error,status:p.status,signal:p.signal}),exitCode:p.status,error:p.error?.message,stdoutTail:(p.stdout||'').slice(-4000),stderrTail:(p.stderr||'').slice(-2000)});
}
const pnpm=spawnSync('pnpm',['--version'],{encoding:'utf8'});
const deps=has('node_modules/.bin/vite');
run('Stage 1 targeted native tests','node',['--test','qa/stage1-schema-contract.test.mjs','qa/stage1-company-isolation.test.mjs','qa/stage1-gate-policy.test.mjs']);
run('Integrity standalone tests','node',['--test','stage1-audit-candidate/tallybook-integrity/tests/integrity.test.cjs']);
run('Security standalone tests','node',['--test','stage1-audit-candidate/tallybook-security/tests/security.test.cjs']);
run('Application TypeScript check','node',['node_modules/typescript/bin/tsc','--noEmit'],has('node_modules/typescript/bin/tsc'));
run('Full Vitest','node',['node_modules/vitest/vitest.mjs','run'],has('node_modules/vitest/vitest.mjs'));
run('Actual TallybookDB Dexie audit integration','node',['node_modules/vitest/vitest.mjs','run','src/features/reliability/stage1Dexie.integration.test.ts'],has('node_modules/vitest/vitest.mjs')&&has('client/src/features/reliability/stage1Dexie.integration.test.ts'));
run('Transaction-level company isolation integration','node',['node_modules/vitest/vitest.mjs','run','src/features/business/companyIsolation.integration.test.ts'],has('node_modules/vitest/vitest.mjs')&&has('client/src/features/business/companyIsolation.integration.test.ts'));
run('Vite frontend build','node',['node_modules/vite/bin/vite.js','build'],deps);
run('Server esbuild bundle','node',['node_modules/esbuild/bin/esbuild','server/index.ts','--platform=node','--packages=external','--bundle','--format=esm','--outdir=dist'],has('node_modules/esbuild/bin/esbuild'));
const stepPassed=(name)=>steps.some(step=>step.name===name&&step.status==='PASS');
const result={at:new Date().toISOString(),node:process.versions.node,expectedNode:'24.19.0',pnpm:pnpm.status===0?pnpm.stdout.trim():null,expectedPnpm:'10.34.0',dependenciesInstalled:deps,platform:process.platform,steps,stageAccepted:false,evidence:{'dexie-app-schema-integration':stepPassed('Actual TallybookDB Dexie audit integration'),'transaction-company-isolation':stepPassed('Transaction-level company isolation integration'),'windows-browser-recovery':false},notes:['Build gates are separated so a Vite success cannot conceal a server-bundle failure.','Dexie integration uses the actual TallybookDB schema and Dexie transactions with the configured IndexedDB test adapter; it is not real-browser or Windows persistence evidence.','Windows 11 browser recovery remains unverified and is required for Stage 1 acceptance.']};
result.summary=summarizeStage1(steps,result);
result.stageAccepted=result.summary.stageAccepted;
if(process.argv[2])writeFileSync(resolve(root,process.argv[2]),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
if(steps.some(s=>s.status==='FAIL'))process.exitCode=1;
