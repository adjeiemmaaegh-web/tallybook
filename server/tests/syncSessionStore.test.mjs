import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createReadOnlyFileSessionStore, createReadOnlySessionSnapshot, validateSyncSessionSnapshot } from '../syncSessionStore.mjs';
import { authorizeActiveSyncSession } from '../syncSession.mjs';
const record = {id:'session-1', actorId:'person-1', status:'active'};
const snapshot = (sessions = [record]) => JSON.stringify({version:1,sessions});
test('snapshot authorization is scoped by exact session and actor', async () => {
  const store = createReadOnlySessionSnapshot(JSON.parse(snapshot()));
  assert.equal(await authorizeActiveSyncSession({sessionId:record.id,actorId:record.actorId},store),'person-1');
  await assert.rejects(authorizeActiveSyncSession({sessionId:record.id,actorId:'other'},store));
  assert.equal(await store.getSession('missing'),null);
});
test('reject duplicate session IDs', () => assert.throws(() => validateSyncSessionSnapshot(JSON.parse(snapshot([record,record])))));
test('reject malformed snapshot and invalid status', () => {
  assert.throws(() => validateSyncSessionSnapshot({version:2,sessions:[]}));
  assert.throws(() => validateSyncSessionSnapshot({version:1,sessions:[{...record,status:'unknown'}]}));
});
test('file session revocation is effective immediately', async () => {
  const dir = await mkdtemp(join(tmpdir(),'tb-session-'));
  const file = join(dir,'sessions.json');
  try {
    await writeFile(file,snapshot(),{mode:0o600});
    const store = createReadOnlyFileSessionStore(file);
    assert.equal(await authorizeActiveSyncSession({sessionId:record.id,actorId:record.actorId},store),'person-1');
    await writeFile(file,snapshot([{...record,status:'revoked'}]));
    await assert.rejects(authorizeActiveSyncSession({sessionId:record.id,actorId:record.actorId},store));
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('reject world-writable session file', async () => {
  const dir = await mkdtemp(join(tmpdir(),'tb-session-')); const file = join(dir,'sessions.json');
  try {await writeFile(file,snapshot());await chmod(file,0o666);await assert.rejects(createReadOnlyFileSessionStore(file).getSession(record.id));}
  finally {await rm(dir,{recursive:true,force:true});}
});
test('reject symlink session file', async () => {
  const dir = await mkdtemp(join(tmpdir(),'tb-session-')); const file = join(dir,'sessions.json'); const link = join(dir,'link.json');
  try {await writeFile(file,snapshot());await symlink(file,link);await assert.rejects(createReadOnlyFileSessionStore(link).getSession(record.id));}
  finally {await rm(dir,{recursive:true,force:true});}
});
test('reject missing file and relative path', async () => {
  assert.throws(() => createReadOnlyFileSessionStore('./sessions.json'));
  await assert.rejects(createReadOnlyFileSessionStore('/this/path/does/not/exist.json').getSession(record.id));
});

test('reject world-readable session records and unrecognized snapshot fields',async()=>{
  assert.throws(()=>validateSyncSessionSnapshot({version:1,sessions:[{...record,privilege:'admin'}]}),/Invalid session record/);
  assert.throws(()=>validateSyncSessionSnapshot({version:1,sessions:[],unexpected:true}),/Invalid session snapshot/);
  const dir=await mkdtemp(join(tmpdir(),'tb-session-'));
  const file=join(dir,'sessions.json');
  try {
    await writeFile(file,snapshot(),{mode:0o600});
    await chmod(file,0o644);
    await assert.rejects(createReadOnlyFileSessionStore(file).getSession(record.id),/Unsafe session file/);
  } finally {await rm(dir,{recursive:true,force:true});}
});
