import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readBoundedEvidence} from '../scripts/read-bounded-evidence.mjs';
test('evidence reads the opened regular file and rejects invalid size and UTF-8',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'tallybook-evidence-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const path=join(dir,'record.json');await writeFile(path,'{"ok":true}');
 assert.equal(await readBoundedEvidence(path,{minBytes:2,maxBytes:11}),'{"ok":true}');
 await assert.rejects(readBoundedEvidence(path,{minBytes:0,maxBytes:10}),/oversized/);
 await assert.rejects(readBoundedEvidence(path,{minBytes:12,maxBytes:20}),/oversized/);
 await writeFile(path,Buffer.from([0xc3,0x28]));
 await assert.rejects(readBoundedEvidence(path,{maxBytes:20}),/encoded data|encoding/i);
 await mkdir(join(dir,'folder'));await assert.rejects(readBoundedEvidence(join(dir,'folder'),{maxBytes:20}));
 await assert.rejects(readBoundedEvidence(path,{maxBytes:NaN}),/Invalid/);
});
test('available no-follow enforcement refuses evidence symlinks',async t=>{
 if(process.platform==='win32'){assert.equal(typeof readBoundedEvidence,'function');return;}
 const dir=await mkdtemp(join(tmpdir(),'tallybook-evidence-link-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const target=join(dir,'target');const link=join(dir,'link');await writeFile(target,'ok');await symlink(target,link);
 await assert.rejects(readBoundedEvidence(link,{maxBytes:20}),/ELOOP/);
});
