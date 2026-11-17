import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,readFileSync,symlinkSync,mkdirSync,truncateSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {writeCheckpoint,verifyCheckpoint,inspectDependencyPackage} from '../scripts/freeze-development-checkpoint.mjs';
function setup(t){
 const root=mkdtempSync(join(tmpdir(),'tallybook-checkpoint-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 return {root,output:join(root,'checkpoint'),source:{sha:'a'.repeat(40),tree:'b'.repeat(40),committedAt:'2026-11-17T00:00:00Z'},
 files:[{path:'web/index.html',bytes:Buffer.from('<main>offline</main>')},{path:'web/sw.js',bytes:Buffer.from('self.addEventListener("fetch",()=>{});')}],
 dispositions:{partial:119}};
}
test('same source and build bytes produce identical manifests without release approval',t=>{
 const options=setup(t);const first=writeCheckpoint(options);
 const other=join(options.root,'second');writeCheckpoint({...options,output:other});
 assert.deepEqual(readFileSync(join(options.output,'manifest.json')),readFileSync(join(other,'manifest.json')));
 assert.equal(first.decision,'NO-GO');assert.equal(first.productionAuthorized,false);
 assert.equal(verifyCheckpoint(options.output).files.length,2);
});
test('changed build payloads fail byte integrity verification',t=>{
 const options=setup(t);writeCheckpoint(options);
 writeFileSync(join(options.output,'web/index.html'),'<main>changed</main>');
 assert.throws(()=>verifyCheckpoint(options.output),/checksum/);
});
test('unlisted files cannot silently enter a checkpoint',t=>{
 const options=setup(t);writeCheckpoint(options);
 writeFileSync(join(options.output,'private-record.json'),'{}');
 assert.throws(()=>verifyCheckpoint(options.output),/Unlisted/);
});
test('traversal and duplicate paths reject before creating an output',t=>{
 const options=setup(t);
 for(const path of ['../escape','web/../escape','web//escape','/absolute']){
  assert.throws(()=>writeCheckpoint({...options,files:[...options.files,{path,bytes:Buffer.from('x')}]}),/Unsafe/);
 }
 assert.throws(()=>writeCheckpoint({...options,files:[...options.files,options.files[0]]}),/duplicate/);
 assert.throws(()=>writeCheckpoint({...options,files:[options.files[0]]}),/service worker/);
});
test('forged approval metadata is rejected even when payload hashes match',t=>{
 const options=setup(t);writeCheckpoint(options);
 const path=join(options.output,'manifest.json'),manifest=JSON.parse(readFileSync(path,'utf8'));
 manifest.decision='GO';manifest.productionAuthorized=true;writeFileSync(path,JSON.stringify(manifest));
 assert.throws(()=>verifyCheckpoint(options.output),/approval/);
});
test('existing output is preserved and exact source identity is mandatory',t=>{
 const options=setup(t);writeCheckpoint(options);
 assert.throws(()=>writeCheckpoint(options),/already exist/);
 assert.throws(()=>writeCheckpoint({...options,output:join(options.root,'bad'),source:{sha:'main',tree:'b'.repeat(40)}}),/Exact/);
});
test('directory links cannot add external content to a verified package',t=>{
 const options=setup(t);writeCheckpoint(options);
 symlinkSync(options.root,join(options.output,'linked'),'junction');
 assert.throws(()=>verifyCheckpoint(options.output),/symlinks/);
});

test('dependency notices preserve exact source bytes and declared license metadata',t=>{
 const options=setup(t),dir=join(options.root,'package');mkdirSync(dir);
 writeFileSync(join(dir,'package.json'),JSON.stringify({name:'example',version:'1.0.0',license:'MIT'}));
 const original='Synthetic example copyright notice\n';writeFileSync(join(dir,'LICENSE.txt'),original);
 const inspected=inspectDependencyPackage(dir);
 assert.equal(inspected.license,'MIT');assert.equal(inspected.notices[0].bytes.toString(),original);
 const path='notices/example/LICENSE.txt';
 const dependencies=[{name:'example',version:'1.0.0',license:inspected.license,noticeFiles:[path]}];
 writeCheckpoint({...options,files:[...options.files,{path,bytes:inspected.notices[0].bytes}],dependencies});
 const verified=verifyCheckpoint(options.output);
 assert.deepEqual(verified.dependencies,dependencies);
 assert.match(verified.licenseReview,/no legal approval/);
});
test('unknown declared license is explicit and nonexistent notices reject packaging',t=>{
 const options=setup(t),dir=join(options.root,'unknown-package');mkdirSync(dir);writeFileSync(join(dir,'package.json'),'{}');
 assert.deepEqual(inspectDependencyPackage(dir),{license:'UNKNOWN',notices:[]});
 assert.throws(()=>writeCheckpoint({...options,dependencies:[{name:'example',version:'1.0.0',license:'UNKNOWN',noticeFiles:['notices/missing/LICENSE']}]}),/Missing/);
});
test('dependency notice size and symlink boundaries fail closed',t=>{
 const options=setup(t),dir=join(options.root,'large-package');mkdirSync(dir);writeFileSync(join(dir,'package.json'),'{"license":"MIT"}');
 const notice=join(dir,'LICENSE');writeFileSync(notice,'');truncateSync(notice,1024*1024+1);
 assert.throws(()=>inspectDependencyPackage(dir),/oversized/);
 rmSync(notice);symlinkSync(options.root,notice,'junction');
 assert.throws(()=>inspectDependencyPackage(dir),/regular file/);
});

test('malformed long notice names reject without ambiguous repeated matching',t=>{
 const options=setup(t),dir=join(options.root,'odd-package');mkdirSync(dir);
 writeFileSync(join(dir,'package.json'),'{"license":"MIT"}');
 writeFileSync(join(dir,'LICENSE-'+ '_'.repeat(180)+'!'),'unrecognized filename');
 assert.deepEqual(inspectDependencyPackage(dir),{license:'MIT',notices:[]});
});
