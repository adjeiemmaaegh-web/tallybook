/** Server-controlled, single-process enrollment registry. Never call from untrusted routes.
 * One atomic file contains directory and invitations so redemption cannot partially commit.
 * A deployment with multiple workers requires a transactional shared database instead.
 */
import { open, rename, unlink, lstat, constants } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { validateDirectorySnapshot } from './syncDirectory.mjs';
const ID = /^[A-Za-z0-9:_-]{1,128}$/;
const id = x => typeof x === 'string' && ID.test(x);
const path = x => { if (typeof x !== 'string' || !x.startsWith('/') || x.includes('\0')) throw Error('Absolute registry path required'); return resolve(x); };
async function privateParent(filename) {
  const folder = await lstat(dirname(filename));
  if (!folder.isDirectory() || (folder.mode & 0o077) !== 0) throw Error('Unsafe enrollment directory');
}
// Enrollment and revocation are security-critical read/modify/write operations.
// An in-process promise queue cannot prevent two independent server workers
// from overwriting each other's records. Fail closed for stale lock files.
async function serialized(filename, operation) {
  await privateParent(filename);
  const lock = filename + '.lock';
  let handle;
  for (let attempt=0; attempt<100; attempt++) {
    try { handle = await open(lock, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); break; }
    catch(error) {
      if (error.code !== 'EEXIST' || attempt === 99) throw error;
      await new Promise(resolve => setTimeout(resolve,25));
    }
  }
  const original = await handle.stat();
  if (!original.isFile() || original.nlink !== 1 || (original.mode & 0o077) !== 0) {
    await handle.close(); throw Error('Unsafe enrollment lock');
  }
  try { return await operation(); }
  finally {
    const current=await lstat(lock).catch(()=>null);
    await handle.close();
    if (!current || !current.isFile() || current.dev !== original.dev || current.ino !== original.ino ||
        current.nlink !== 1 || (current.mode & 0o077) !== 0) throw Error('Enrollment lock changed; refusing to remove it');
    await unlink(lock);
  }
}
async function readRegistry(filename) {
  await privateParent(filename);
  const handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size < 1 || stat.size > 2_000_000 || (stat.mode & 0o077)) throw Error('Unsafe enrollment registry');
    const data = JSON.parse(await handle.readFile('utf8'));
    validateDirectorySnapshot(data);
    if (!Array.isArray(data.invites) || data.invites.length > 10000) throw Error('Invalid enrollment invitations');
    const used = new Set();
    for (const invite of data.invites) {
      if (!id(invite.orgId) || !id(invite.actorId) || !/^[a-f0-9]{64}$/.test(invite.hash) ||
          !Number.isSafeInteger(invite.expiresAt) || !['pending','consumed','revoked'].includes(invite.status) || used.has(invite.hash)) throw Error('Invalid enrollment invitation');
      used.add(invite.hash);
    }
    return data;
  } finally { await handle.close(); }
}
async function saveRegistry(filename, data) {
  validateDirectorySnapshot(data);
  const serializedData = JSON.stringify(data);
  if (Buffer.byteLength(serializedData) > 2_000_000) throw Error('Enrollment registry full');
  await privateParent(filename);
  const stat = await lstat(filename);
  if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o077) !== 0) throw Error('Unsafe enrollment target');
  const temp = join(dirname(filename), `.${randomBytes(16).toString('hex')}.tmp`);
  let handle, replaced = false;
  try {
    handle = await open(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    await handle.writeFile(serializedData);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temp, filename);
    replaced = true;
    const folder = await open(dirname(filename), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try { await folder.sync(); } finally { await folder.close(); }
  } finally {
    if (handle) await handle.close();
    if (!replaced) await unlink(temp).catch(()=>{});
  }
}
const hashToken = token => createHash('sha256').update(token).digest('hex');
function member(data, orgId, actorId) { return data.memberships.find(m => m.orgId===orgId && m.actorId===actorId && m.status==='active'); }
function activeOrg(data, orgId) { return data.organizations.some(o => o.id===orgId && o.status==='active'); }
export function createServerEnrollmentRegistry(filename, clock=()=>Date.now()) {
  const target=path(filename);
  const now=()=>{const n=clock();if(!Number.isSafeInteger(n)||n<0)throw Error('Invalid clock');return n;};
  return Object.freeze({
    async issueInvite({orgId, administratorId, targetActorId}) {
      if (![orgId,administratorId,targetActorId].every(id)) throw Error('Enrollment denied');
      return serialized(target, async()=>{
        const data=await readRegistry(target);
        const admin=member(data,orgId,administratorId);
        if (!activeOrg(data,orgId) || !admin || !['owner','admin'].includes(admin.role) || !member(data,orgId,targetActorId)) throw Error('Enrollment denied');
        const token=randomBytes(32).toString('base64url');
        data.invites.push({orgId,actorId:targetActorId,hash:hashToken(token),status:'pending',expiresAt:now()+10*60*1000});
        await saveRegistry(target,data);
        return Object.freeze({token,expiresAt:data.invites.at(-1).expiresAt});
      });
    },
    async enroll({orgId,actorId,deviceId,token}) {
      if (![orgId,actorId,deviceId].every(id) || typeof token!=='string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw Error('Enrollment denied');
      return serialized(target,async()=>{
        const data=await readRegistry(target);
        if (!activeOrg(data,orgId)||!member(data,orgId,actorId)) throw Error('Enrollment denied');
        const hash=hashToken(token);
        const invite=data.invites.find(i => i.orgId===orgId && i.actorId===actorId && timingSafeEqual(Buffer.from(i.hash,'hex'),Buffer.from(hash,'hex')));
        if (!invite || invite.status!=='pending' || invite.expiresAt <= now() || data.devices.some(d=>d.orgId===orgId && d.id===deviceId)) throw Error('Enrollment denied');
        data.devices.push({orgId,id:deviceId,actorId,status:'active'});
        invite.status='consumed';
        await saveRegistry(target,data);
        return Object.freeze({orgId,actorId,deviceId,status:'active'});
      });
    },
    async revoke({orgId,administratorId,deviceId}) {
      if (![orgId,administratorId,deviceId].every(id)) throw Error('Revocation denied');
      return serialized(target,async()=>{
        const data=await readRegistry(target);
        const admin=member(data,orgId,administratorId);
        if (!activeOrg(data,orgId)||!admin||!['owner','admin'].includes(admin.role)) throw Error('Revocation denied');
        const device=data.devices.find(d=>d.orgId===orgId && d.id===deviceId);
        if (!device || device.status!=='active') throw Error('Revocation denied');
        device.status='revoked';
        await saveRegistry(target,data);
        return Object.freeze({orgId,deviceId,status:'revoked'});
      });
    },
  });
}
