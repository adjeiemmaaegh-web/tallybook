/** Offline native QA convenience runner. Does NOT run Vitest, browser, or PostgreSQL. */
import {spawnSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const jsTests=dir=>readdirSync(resolve(root,dir)).filter(x=>x.endsWith('.test.mjs')).sort().map(x=>join(dir,x));
const groups=[
 {label:'Native Tallybook source and server QA',files:[...jsTests('qa'),...jsTests('server/tests')]},
 {label:'Standalone Batch 1–4 and cross-batch compatibility checks',files:[...['batch1','batch2','batch3','batch4'].flatMap(name=>jsTests(`candidate_modules/${name}`)),...jsTests('candidate_modules')]}
];
for(const group of groups){
 console.log(`\n=== ${group.label}: ${group.files.length} test files ===`);
 const result=spawnSync(process.execPath,['--experimental-strip-types','--test',...group.files],{
  cwd:root,encoding:'utf8',maxBuffer:16*1024*1024
 });
 if(result.stdout) process.stdout.write(result.stdout);
 if(result.stderr) process.stderr.write(result.stderr);
 if(result.error || result.status!==0){console.error(`FAILED: ${group.label}`,result.error?.message??result.status);process.exit(1);}
}
console.log('\nNative suites passed. Vitest, tsc, PostgreSQL, and browser acceptance are NOT included.');
