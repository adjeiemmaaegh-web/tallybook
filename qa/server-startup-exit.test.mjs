import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve,join} from 'node:path';
test('misconfigured production transport exits nonzero without listening or enabling any service',t=>{
 const root=resolve('.'),base=join(root,'artifacts/release-v19');mkdirSync(base,{recursive:true});
 const folder=mkdtempSync(join(base,'startup-guard-'));t.after(()=>rmSync(folder,{recursive:true,force:true}));
 const outfile=join(folder,'index.mjs');
 buildSync({entryPoints:[join(root,'server/index.ts')],bundle:true,platform:'node',packages:'external',format:'esm',outfile,logLevel:'silent'});
 for(const transport of [undefined,'http','https']){
  const env={PATH:process.env.PATH,NODE_ENV:'production',PORT:'0',...(transport?{TALLYBOOK_SERVER_TRANSPORT:transport}:{})};
  const result=spawnSync(process.execPath,[outfile],{cwd:root,env,timeout:10000,encoding:'utf8'});
  assert.equal(result.error,undefined);assert.equal(result.signal,null);assert.equal(result.status,1,`transport ${transport??'default'} must fail closed with nonzero status`);
  assert.match(result.stderr,/Server startup failed/);assert.doesNotMatch(result.stdout,/Server running/);
 }
});
