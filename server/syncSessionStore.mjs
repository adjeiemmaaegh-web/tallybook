/** Development-only, read-only session snapshot adapter.
 * Provisioned by trusted server operators, never via client requests.
 * Reads afresh for revocation. Production needs transactional session storage.
 */
import { open, lstat, constants } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
const ID = /^[A-Za-z0-9:_-]{1,128}$/;
const valid = value => typeof value === 'string' && ID.test(value);
const MAX_SIZE = 1_000_000;
export function validateSyncSessionSnapshot(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).sort().join(',') !== 'sessions,version' || input.version !== 1 || !Array.isArray(input.sessions) || input.sessions.length > 10000) throw new Error('Invalid session snapshot');
  const sessions = new Map();
  for (const session of input.sessions) {
    if (!session || typeof session !== 'object' || Array.isArray(session) || Object.keys(session).sort().join(',') !== 'actorId,id,status' || !valid(session.id) || !valid(session.actorId) || !['active','revoked'].includes(session.status) || sessions.has(session.id)) throw new Error('Invalid session record');
    sessions.set(session.id, Object.freeze({id:session.id, actorId:session.actorId, status:session.status}));
  }
  return sessions;
}
export function createReadOnlySessionSnapshot(input) {
  const sessions = validateSyncSessionSnapshot(input);
  return Object.freeze({ async getSession(id) { return valid(id) ? sessions.get(id) ?? null : null; } });
}
export function createReadOnlyFileSessionStore(filename) {
  if (typeof filename !== 'string' || !filename.startsWith('/') || filename.includes('\0')) throw new Error('Absolute session file path required');
  const pathname = resolve(filename);
  return Object.freeze({ async getSession(id) {
    if (!valid(id)) return null;
    const folder = await lstat(dirname(pathname));
    if (!folder.isDirectory() || (folder.mode & 0o077) !== 0) throw new Error('Unsafe session directory');
    const handle = await open(pathname, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.nlink !== 1 || stat.size < 1 || stat.size > MAX_SIZE || (stat.mode & 0o077) !== 0) throw new Error('Unsafe session file');
      const raw = await handle.readFile('utf8');
      if (Buffer.byteLength(raw) > MAX_SIZE) throw new Error('Oversized session file');
      return (await createReadOnlySessionSnapshot(JSON.parse(raw)).getSession(id));
    } finally { await handle.close(); }
  } });
}
