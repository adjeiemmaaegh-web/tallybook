/** Optional server-only login and session issuance. Not a cloud-sync enablement. */
import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { open, rename, unlink, lstat, constants } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
const scrypt = promisify(scryptCallback);
const ID = /^[A-Za-z0-9:_-]{1,128}$/;
const MAX = 1_000_000;
const isId = value => typeof value === 'string' && ID.test(value);
const isHash = value => typeof value === 'string' && /^[a-f0-9]{128}$/.test(value);
const isSalt = value => typeof value === 'string' && /^[a-f0-9]{32,128}$/.test(value);
const validPath = filename => { if (typeof filename !== 'string' || !filename.startsWith('/') || filename.includes('\0')) throw Error('Absolute path required'); return resolve(filename); };
async function requirePrivateDirectory(filename) {
  const stat = await lstat(dirname(validPath(filename)));
  if (!stat.isDirectory() || (stat.mode & 0o077) !== 0) throw Error('Unsafe session directory');
}
async function readSafeJSON(filename) {
  await requirePrivateDirectory(filename);
  const fh = await open(validPath(filename), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const st = await fh.stat();
    if (!st.isFile() || st.nlink !== 1 || st.size < 1 || st.size > MAX || (st.mode & 0o077) !== 0) throw Error('Unsafe identity file');
    const raw = await fh.readFile('utf8');
    if (Buffer.byteLength(raw) > MAX) throw Error('Oversized identity file');
    return JSON.parse(raw);
  } finally { await fh.close(); }
}
export function validateLoginDirectory(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.users) || data.users.length > 10000) throw Error('Invalid login directory');
  const ids = new Set();
  for (const u of data.users) {
    if (!u || !isId(u.id) || !isSalt(u.salt) || !isHash(u.passwordHash) || !['active','disabled'].includes(u.status) || ids.has(u.id)) throw Error('Invalid login user');
    ids.add(u.id);
  }
  return data.users;
}
export async function authenticateLocalUser(userId, password, directoryFile) {
  if (!isId(userId) || typeof password !== 'string' || password.length < 1 || password.length > 1024) throw Error('Authentication denied');
  const users = validateLoginDirectory(await readSafeJSON(directoryFile));
  const u = users.find(x => x.id === userId);
  // Derive against a fixed dummy to avoid a nonexistent-account shortcut.
  const salt = u?.salt ?? '00000000000000000000000000000000';
  const actual = await scrypt(password, Buffer.from(salt,'hex'), 64, { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 });
  const expected = Buffer.from(u?.passwordHash ?? '00'.repeat(64), 'hex');
  if (!timingSafeEqual(actual, expected) || u?.status !== 'active') throw Error('Authentication denied');
  return u.id;
}
export async function hashLoginPassword(password, salt = randomBytes(16).toString('hex')) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 1024 || !isSalt(salt)) throw Error('Invalid password');
  return { salt, passwordHash: (await scrypt(password, Buffer.from(salt,'hex'), 64, { N:16384, r:8, p:1, maxmem:32*1024*1024 })).toString('hex') };
}
// The lock file serializes issuers across independent Node processes, not just
// promises in one process. Leftover locks fail closed and require operator review.
// The parent must be private; never unlink a lock another process replaced.
async function withLock(filename, work) {
  const lockFile = validPath(filename) + '.lock';
  await requirePrivateDirectory(filename);
  let handle;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      handle = await open(lockFile, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
      break;
    } catch (error) {
      if (error.code !== 'EEXIST' || attempt === 99) throw error;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  const original = await handle.stat();
  if (!original.isFile() || original.nlink !== 1 || (original.mode & 0o077) !== 0) {
    await handle.close();
    throw Error('Unsafe session lock');
  }
  try { return await work(); }
  finally {
    const current = await lstat(lockFile).catch(() => null);
    await handle.close();
    if (!current || !current.isFile() || current.dev !== original.dev || current.ino !== original.ino ||
        current.nlink !== 1 || (current.mode & 0o077) !== 0) throw Error('Session lock changed; refusing to remove it');
    await unlink(lockFile);
  }
}
async function durableWrite(filename, contents) {
  const target = validPath(filename);
  await requirePrivateDirectory(target);
  const temp = join(dirname(target), `.${randomBytes(12).toString('hex')}.tmp`);
  let handle;
  let replaced = false;
  try {
    // Never atomically replace a symlink or hard-linked session store. Check
    // while holding the exclusive issuer lock in a private directory.
    const original = await lstat(target);
    if (!original.isFile() || original.nlink !== 1 || (original.mode & 0o077) !== 0) throw Error('Unsafe session target');
    handle = await open(temp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    await handle.writeFile(contents);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temp, target);
    replaced = true;
    const dh = await open(dirname(target), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try { await dh.sync(); } finally { await dh.close(); }
  } finally {
    if (handle) await handle.close();
    if (!replaced) await unlink(temp).catch(() => {});
  }
}
export function createSessionIssuer({ directoryFile, sessionFile, secret, clock = () => Date.now() }) {
  validPath(directoryFile); validPath(sessionFile);
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) throw Error('Login issuance not configured');
  async function issue(userId, password) {
    const actorId = await authenticateLocalUser(userId, password, directoryFile);
    return withLock(sessionFile, async () => {
      // Credentials may be revoked or rotated while waiting for another
      // process's issuance lock. Reauthenticate against the latest file.
      await authenticateLocalUser(userId, password, directoryFile);
      const data = await readSafeJSON(sessionFile);
      if (!data || data.version !== 1 || !Array.isArray(data.sessions)) throw Error('Invalid session store');
      const ids = new Set();
      for (const s of data.sessions) {
        if (!isId(s.id) || !isId(s.actorId) || !['active','revoked'].includes(s.status) || ids.has(s.id)) throw Error('Invalid session store');
        ids.add(s.id);
      }
      if (data.sessions.length >= 10000) throw Error('Session capacity exhausted');
      const now = clock();
      if (!Number.isSafeInteger(now)) throw Error('Invalid clock');
      const iat = Math.floor(now / 1000);
      const exp = iat + 5 * 60;
      const sessionId = randomBytes(24).toString('base64url');
      // Never trust client-chosen session identifiers.
      data.sessions.push({ id: sessionId, actorId, status:'active' });
      const nextSnapshot = JSON.stringify(data);
      // Never persist a snapshot that the regular session validator cannot
      // reload. A near-capacity store must fail without revoking all sessions.
      if (Buffer.byteLength(nextSnapshot) > MAX) throw Error('Session capacity exhausted');
      await durableWrite(sessionFile, nextSnapshot);
      const payload = Buffer.from(JSON.stringify({v:1,aud:'tallybook-sync-session',actorId,sessionId,iat,exp})).toString('base64url');
      const sig = createHmac('sha256', secret).update(payload).digest('base64url');
      return Object.freeze({ token:`${payload}.${sig}`, expiresAt: exp, sessionId });
    });
  }
  return Object.freeze({ issue });
}
