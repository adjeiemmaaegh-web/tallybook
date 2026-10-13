/** Server-side organization membership and device authorization boundary.
 * The repository intentionally contains NO identity-store implementation.
 * Adapters must retrieve authoritative server records, never browser-supplied data.
 */
const ID = /^[A-Za-z0-9:_-]{1,128}$/;
const ROLE = new Set(['owner', 'admin', 'member']);
function validId(id) { return typeof id === 'string' && ID.test(id); }
function denied() { throw new Error('Server organization/device authorization denied'); }
/**
 * Resolve the authenticated human actor and their membership, and check device status.
 * Denies closed for missing/non-authoritative adapters, revoked devices, disabled orgs,
 * mismatched ownership, and revoked/suspended memberships. Inspect only: no data reads.
 * @param {object} claims verified signed capability claims (not raw token claims)
 * @param {object} directory server-owned adapter with async getOrganization/getMembership/getDevice
 * @param {string} actorId authenticated human identity obtained from trusted server session
 */
export async function authorizeSyncInspect(claims, directory, actorId) {
  if (!validId(actorId) || !validId(claims?.orgId) || !validId(claims?.deviceId) || claims?.scope !== 'sync:inspect') denied();
  if (!directory || !['getOrganization','getMembership','getDevice'].every(key => typeof directory[key] === 'function')) denied();
  let org, membership, device;
  try {
    // Never trust locally registered devices or claims to establish membership.
    [org, membership, device] = await Promise.all([
      directory.getOrganization(claims.orgId),
      directory.getMembership(claims.orgId, actorId),
      directory.getDevice(claims.orgId, claims.deviceId),
    ]);
  } catch { denied(); }
  if (org?.id !== claims.orgId || org?.status !== 'active' ||
      membership?.orgId !== claims.orgId || membership?.actorId !== actorId ||
      membership?.status !== 'active' || !ROLE.has(membership?.role) ||
      device?.orgId !== claims.orgId || device?.id !== claims.deviceId ||
      device?.status !== 'active' || device?.actorId !== actorId) denied();
  return Object.freeze({orgId: claims.orgId, deviceId: claims.deviceId, actorId, role: membership.role, scope: 'sync:inspect'});
}

/** Explicit deny-all default until authenticated sessions + durable directory are deployed. */
export const disabledSyncIdentityDirectory = Object.freeze({
  async getOrganization() { return null; },
  async getMembership() { return null; },
  async getDevice() { return null; },
});

/** Separate write privilege: requires active owner/admin and server-owned device + session. */
export async function authorizeBackupWrite(claims, directory, actorId) {
  if (claims?.scope !== 'backup:write') denied();
  const inspectClaims = Object.freeze({...claims, scope:'sync:inspect'});
  const authorized = await authorizeSyncInspect(inspectClaims, directory, actorId);
  if (authorized.role !== 'owner' && authorized.role !== 'admin') denied();
  return Object.freeze({...authorized, scope:'backup:write'});
}

/** Event-metadata staging requires active membership/device; no financial role escalation. */
export async function authorizeSyncStage(claims, directory, actorId) {
  if (claims?.scope !== 'sync:stage') denied();
  const authorized = await authorizeSyncInspect(Object.freeze({...claims,scope:'sync:inspect'}),directory,actorId);
  return Object.freeze({...authorized,scope:'sync:stage'});
}
