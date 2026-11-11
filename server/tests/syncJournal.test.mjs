import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,chmod,symlink,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createFileSyncJournal,validateJournalEvent,evaluateJournalEvent} from '../syncJournal.mjs';
const sample=(overrides={})=>({organizationId:'business-a',deviceId:'device-a',eventId:'event-a',operationId:'order-a',payloadDigest:'a'.repeat(64),...overrides});
const sandbox=async fn=>{
  const dir=await mkdtemp(join(tmpdir(),'tb-journal-'));
  try { await fn(join(dir,'events.jsonl')); }
  finally {
    // CI filesystems can briefly report ENOTEMPTY while journal lock files are released.
    // Retry transient cleanup errors only; other errors and exhausted retries still fail.
    await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:75});
  }
};
test('reject malformed IDs, hashes, or extra fields',()=>{assert.throws(()=>validateJournalEvent(sample({payloadDigest:'zz'})));assert.throws(()=>validateJournalEvent(sample({extra:'secret'})));});
test('evaluate company isolation and event idempotency',()=>{const a=sample();assert.equal(evaluateJournalEvent([a],a).status,'duplicate');assert.equal(evaluateJournalEvent([a],sample({payloadDigest:'b'.repeat(64)})).reason,'event-id-reuse');assert.equal(evaluateJournalEvent([a],sample({eventId:'event-b'})).reason,'operation-id-reuse');assert.equal(evaluateJournalEvent([a],sample({organizationId:'business-b'})).status,'new');});
test('durably stage and reload, reject exact replays',()=>sandbox(async file=>{const j=createFileSyncJournal(file);assert.equal((await j.stageEvent(sample())).status,'stored');assert.equal((await j.stageEvent(sample())).status,'duplicate');assert.equal((await createFileSyncJournal(file).inspect('business-a')).length,1);}));
test('reject mutated event and reused operation',()=>sandbox(async file=>{const j=createFileSyncJournal(file);await j.stageEvent(sample());assert.equal((await j.stageEvent(sample({payloadDigest:'c'.repeat(64)}))).status,'conflict');assert.equal((await j.stageEvent(sample({eventId:'second'}))).status,'conflict');assert.equal((await j.inspect('business-a')).length,1);}));
test('separate businesses and concurrent writers',()=>sandbox(async file=>{const j=createFileSyncJournal(file);const results=await Promise.all(Array.from({length:8},(_,i)=>j.stageEvent(sample({eventId:'event-'+i,operationId:'op-'+i,organizationId:i%2?'business-b':'business-a'}))));assert.ok(results.every(r=>r.status==='stored'));assert.equal((await j.inspect('business-a')).length,4);assert.equal((await j.inspect('business-b')).length,4);}));
test('reject truncated journal rather than treating it as empty',()=>sandbox(async file=>{await writeFile(file,'{"version":1}',{mode:0o600});await assert.rejects(createFileSyncJournal(file).stageEvent(sample()));}));
test('reject writable journal files',()=>sandbox(async file=>{await writeFile(file,'',{mode:0o600});await chmod(file,0o666);await assert.rejects(createFileSyncJournal(file).stageEvent(sample()));}));
test('never expose a remote HTTP write route',async()=>{const {readFile}=await import('node:fs/promises');const gateway=await readFile(new URL('../index.ts',import.meta.url),'utf8');assert.ok(gateway.includes('Remote synchronization is not enabled.'));assert.equal(gateway.includes('stageEvent('),false);});

test('reject a journal symlink even when its target has safe permissions',()=>sandbox(async file=>{
  const target=file+'.target';
  await writeFile(target,'',{mode:0o600});
  await symlink(target,file);
  const journal=createFileSyncJournal(file);
  await assert.rejects(journal.inspect('business-a'),{code:'ELOOP'});
  await assert.rejects(journal.stageEvent(sample()),{code:'ELOOP'});
  assert.equal(await readFile(target,'utf8'),'');
}));
test('reject a symlink journal parent directory',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'tb-journal-parent-'));
  try {
    const actual=join(dir,'real');
    const link=join(dir,'linked');
    const {mkdir}=await import('node:fs/promises');
    await mkdir(actual,{mode:0o700});
    await symlink(actual,link,'dir');
    await assert.rejects(createFileSyncJournal(join(link,'events.jsonl')).stageEvent(sample()),/Unsafe journal directory/);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
