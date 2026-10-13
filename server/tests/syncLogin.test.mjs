import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, chmod, rm, symlink, link } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashLoginPassword, authenticateLocalUser, createSessionIssuer, validateLoginDirectory } from '../syncLogin.mjs';
import { verifySyncSession, authorizeActiveSyncSession } from '../syncSession.mjs';
import { createReadOnlyFileSessionStore } from '../syncSessionStore.mjs';
const secret = 'very-long-session-server-owned-signing-secret-123456';
async function fixture(fn) {
  const dir = await mkdtemp(join(tmpdir(),'tb-login-'));
  const users = join(dir,'users.json'), sessions=join(dir,'sessions.json');
  const hash = await hashLoginPassword('strong passphrase 2026');
  await writeFile(users, JSON.stringify({version:1,users:[{id:'operator',status:'active',...hash}]}),{mode:0o600});
  await writeFile(sessions,JSON.stringify({version:1,sessions:[]}),{mode:0o600});
  try { await fn({users,sessions}); } finally { await rm(dir,{recursive:true,force:true}); }
}
test('scrypt login issues a verifiable short session after durable persistence',async()=>fixture(async({users,sessions})=>{
  const result=await createSessionIssuer({directoryFile:users,sessionFile:sessions,secret}).issue('operator','strong passphrase 2026');
  const verified=verifySyncSession(`Bearer ${result.token}`,secret);
  assert.equal(verified.actorId,'operator');
  assert.equal(await authorizeActiveSyncSession(verified,createReadOnlyFileSessionStore(sessions)),'operator');
  assert.equal(JSON.parse(await readFile(sessions,'utf8')).sessions.length,1);
}));
test('incorrect password rejected without minting a session',async()=>fixture(async({users,sessions})=>{
  await assert.rejects(createSessionIssuer({directoryFile:users,sessionFile:sessions,secret}).issue('operator','wrong'),/Authentication denied/);
  assert.equal(JSON.parse(await readFile(sessions,'utf8')).sessions.length,0);
}));
test('unknown users rejected',async()=>fixture(async({users})=>{await assert.rejects(authenticateLocalUser('unknown','strong passphrase 2026',users));}));
test('disabled account rejected',async()=>fixture(async({users})=>{
 const data=JSON.parse(await readFile(users,'utf8'));data.users[0].status='disabled'; await writeFile(users,JSON.stringify(data));
 await assert.rejects(authenticateLocalUser('operator','strong passphrase 2026',users));
}));
test('world-readable credential file fails closed',async()=>fixture(async({users})=>{
 await chmod(users,0o644);await assert.rejects(authenticateLocalUser('operator','strong passphrase 2026',users),/Unsafe/);
}));
test('concurrent sessions preserve both records',async()=>fixture(async({users,sessions})=>{
 const issuer=createSessionIssuer({directoryFile:users,sessionFile:sessions,secret});
 await Promise.all([issuer.issue('operator','strong passphrase 2026'),issuer.issue('operator','strong passphrase 2026')]);
 assert.equal(JSON.parse(await readFile(sessions,'utf8')).sessions.length,2);
}));
test('duplicate and malformed login directory fails closed',()=>{
 assert.throws(()=>validateLoginDirectory({version:1,users:[{id:'x',status:'active',salt:'a'.repeat(32),passwordHash:'a'.repeat(128)},{id:'x',status:'active',salt:'b'.repeat(32),passwordHash:'b'.repeat(128)}]}));
});
test('session signing secret required',()=>fixture(async({users,sessions})=>{assert.throws(()=>createSessionIssuer({directoryFile:users,sessionFile:sessions,secret:'short'}));}));

test('concurrent independent Node issuers do not lose committed sessions', async () => fixture(async ({users,sessions}) => {
  const moduleURL = new URL('../syncLogin.mjs', import.meta.url).href;
  const source = `import {createSessionIssuer} from ${JSON.stringify(moduleURL)};
    await createSessionIssuer({directoryFile:process.env.TB_TEST_USERS,sessionFile:process.env.TB_TEST_SESSIONS,secret:${JSON.stringify(secret)}})
    .issue('operator','strong passphrase 2026');`;
  const runChild = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', source], {
      env: {...process.env, TB_TEST_USERS:users, TB_TEST_SESSIONS:sessions}, stdio:['ignore','pipe','pipe']
    });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Issuer exited ${code}: ${stderr}`)));
  });
  await Promise.all(Array.from({length:5},runChild));
  const records = JSON.parse(await readFile(sessions,'utf8')).sessions;
  assert.equal(records.length,5);
  assert.equal(new Set(records.map(row => row.id)).size,5);
  for (const row of records) assert.equal(row.status,'active');
}));

test('pre-existing lock fails closed without issuing or deleting other files', async () => fixture(async ({users,sessions}) => {
  const marker = 'operator-maintenance';
  await writeFile(sessions + '.lock',marker,{mode:0o600});
  await assert.rejects(createSessionIssuer({directoryFile:users,sessionFile:sessions,secret}).issue('operator','strong passphrase 2026'),/EEXIST/);
  assert.equal(await readFile(sessions+'.lock','utf8'),marker);
  assert.deepEqual(JSON.parse(await readFile(sessions,'utf8')).sessions,[]);
}));

test('reject insecure session directory and hard-linked identity/session files',async()=>fixture(async({users,sessions})=>{
  const {dirname} = await import('node:path');
  const directory=dirname(users);
  await chmod(directory,0o755);
  await assert.rejects(authenticateLocalUser('operator','strong passphrase 2026',users),/Unsafe session directory/);
  await assert.rejects(createReadOnlyFileSessionStore(sessions).getSession('anything'),/Unsafe session directory/);
  await chmod(directory,0o700);
  await link(users,users+'.hardlink');
  await assert.rejects(authenticateLocalUser('operator','strong passphrase 2026',users),/Unsafe identity file/);
  await rm(users+'.hardlink');
  await link(sessions,sessions+'.hardlink');
  await assert.rejects(createReadOnlyFileSessionStore(sessions).getSession('anything'),/Unsafe session file/);
  await assert.rejects(createSessionIssuer({directoryFile:users,sessionFile:sessions,secret}).issue('operator','strong passphrase 2026'),/Unsafe identity file|Unsafe session target/);
  await rm(sessions+'.hardlink');
}));

test('reject symlink session store without changing its target',async()=>fixture(async({users,sessions})=>{
  const target=sessions+'.real';
  const initial=await readFile(sessions,'utf8');
  await writeFile(target,initial,{mode:0o600});
  await rm(sessions);
  await symlink(target,sessions);
  await assert.rejects(createSessionIssuer({directoryFile:users,sessionFile:sessions,secret}).issue('operator','strong passphrase 2026'), {code:'ELOOP'});
  assert.equal(await readFile(target,'utf8'),initial);
}));

test('account disabled during lock wait cannot mint a session',async()=>fixture(async({users,sessions})=>{
  await writeFile(sessions+'.lock','holding',{mode:0o600});
  const pending=createSessionIssuer({directoryFile:users,sessionFile:sessions,secret}).issue('operator','strong passphrase 2026');
  // Authentication completes while the session lock is held by another worker.
  await new Promise(resolve=>setTimeout(resolve,200));
  const data=JSON.parse(await readFile(users,'utf8'));
  data.users[0].status='disabled';
  await writeFile(users,JSON.stringify(data));
  await rm(sessions+'.lock');
  await assert.rejects(pending,/Authentication denied/);
  assert.deepEqual(JSON.parse(await readFile(sessions,'utf8')).sessions,[]);
}));

test('near-capacity session file rejects new issuance without damaging prior sessions', async()=>fixture(async({users,sessions})=>{
  const prior=Array.from({length:7352},(_,i)=>({id:'s'+String(i).padStart(6,'0')+'x'.repeat(80),actorId:'operator',status:'active'}));
  prior[0].id += 'x'.repeat(24); // leave fewer bytes than a new issued session
  const original=JSON.stringify({version:1,sessions:prior});
  assert.ok(Buffer.byteLength(original)<1_000_000);
  await writeFile(sessions,original);
  await assert.rejects(createSessionIssuer({directoryFile:users,sessionFile:sessions,secret}).issue('operator','strong passphrase 2026'),/Session capacity exhausted/);
  assert.equal(await readFile(sessions,'utf8'),original);
  assert.equal((await createReadOnlyFileSessionStore(sessions).getSession(prior[0].id))?.actorId,'operator');
}));
