/** Read-only server-owned identity directory snapshot.
 * Provisioned out of band by a trusted administrator; NEVER from browser requests.
 * Suitable for local integration testing only, not a production identity provider.
 */
import { open, lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, dirname } from 'node:path';
const ID = /^[A-Za-z0-9:_-]{1,128}$/;
const valid = (value) => typeof value === 'string' && ID.test(value);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

export function validateDirectorySnapshot(input) {
  if (!isObject(input) || input.version !== 1 || !Array.isArray(input.organizations) ||
      !Array.isArray(input.memberships) || !Array.isArray(input.devices)) throw new Error('Invalid directory snapshot');
  if ([input.organizations, input.memberships, input.devices].some(arr => arr.length > 10000)) throw new Error('Directory exceeds supported capacity');
  const orgs = new Map(), members = new Map(), devices = new Map();
  for (const org of input.organizations) {
    if (!isObject(org) || !valid(org.id) || !['active', 'disabled'].includes(org.status) || orgs.has(org.id)) throw new Error('Invalid organization record');
    orgs.set(org.id, Object.freeze({id: org.id, status: org.status}));
  }
  for (const m of input.memberships) {
    if (!isObject(m) || !valid(m.orgId) || !valid(m.actorId) || !orgs.has(m.orgId) ||
        !['active', 'revoked', 'suspended'].includes(m.status) || !['owner','admin','member'].includes(m.role)) throw new Error('Invalid membership record');
    const key = `${m.orgId}\0${m.actorId}`;
    if (members.has(key)) throw new Error('Duplicate membership');
    members.set(key, Object.freeze({orgId:m.orgId, actorId:m.actorId, status:m.status, role:m.role}));
  }
  for (const d of input.devices) {
    if (!isObject(d) || !valid(d.orgId) || !valid(d.id) || !valid(d.actorId) || !orgs.has(d.orgId) ||
        !['active','revoked'].includes(d.status) || !members.has(`${d.orgId}\0${d.actorId}`)) throw new Error('Invalid device record');
    const key = `${d.orgId}\0${d.id}`;
    if (devices.has(key)) throw new Error('Duplicate device');
    devices.set(key, Object.freeze({orgId:d.orgId, id:d.id, actorId:d.actorId, status:d.status}));
  }
  return Object.freeze({organizations:orgs, memberships:members, devices});
}

export function createSnapshotDirectory(snapshot) {
  const data = validateDirectorySnapshot(snapshot);
  return Object.freeze({
    async getOrganization(id) { return valid(id) ? data.organizations.get(id) ?? null : null; },
    async getMembership(orgId, actorId) { return valid(orgId) && valid(actorId) ? data.memberships.get(`${orgId}\0${actorId}`) ?? null : null; },
    async getDevice(orgId, deviceId) { return valid(orgId) && valid(deviceId) ? data.devices.get(`${orgId}\0${deviceId}`) ?? null : null; },
  });
}

/** Reads the file on every check to honor out-of-band revocation (no stale cache).
 * Production must use a transactional identity database and trusted session validation.
 */
export function createReadOnlyFileDirectory(filename) {
  if (typeof filename !== 'string' || !filename.startsWith('/') || filename.includes('\0')) throw new Error('Absolute directory path required');
  const pathname = resolve(filename);
  async function load() {
    const parent = await lstat(dirname(pathname));
    if (!parent.isDirectory() || (parent.mode & 0o077) !== 0) throw new Error('Unsafe directory parent');
    // Use O_NOFOLLOW and verify the opened descriptor. lstat(path) followed
    // by readFile(path) was a symlink-swap TOCTOU gap.
    const handle = await open(pathname, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.nlink !== 1 || stat.size < 1 || stat.size > 2_000_000 || (stat.mode & 0o077) !== 0) throw new Error('Unsafe directory file');
      const raw = await handle.readFile('utf8');
      if (Buffer.byteLength(raw) > 2_000_000) throw new Error('Oversized directory');
      return createSnapshotDirectory(JSON.parse(raw));
    } finally { await handle.close(); }
  }
  // Every authorization reads one consistent snapshot across all three records.
  return Object.freeze({ async authorizeSnapshot() { return load(); } });
}
