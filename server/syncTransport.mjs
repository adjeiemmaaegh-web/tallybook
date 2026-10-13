/** Read-only, opt-in server transport preflight. NEVER processes uploads or financial data. */
import { verifySyncCapability, checkSyncRequestScope } from './syncAuth.mjs';
import { verifySyncSession, authorizeActiveSyncSession } from './syncSession.mjs';
import { authorizeSyncInspect } from './syncMembership.mjs';

export async function authorizeSyncTransport(headers, config) {
  if (!config || !config.directory || !config.sessionStore) throw new Error('Transport unavailable');
  const claims = verifySyncCapability(headers?.authorization, config.capabilitySecret);
  checkSyncRequestScope(claims, headers?.organizationId, headers?.deviceId);
  const session = verifySyncSession(headers?.session, config.sessionSecret);
  const actorId = await authorizeActiveSyncSession(session, config.sessionStore);
  // Adapter returns an immutable read-only snapshot where supported.
  const directory = typeof config.directory.authorizeSnapshot === 'function'
    ? await config.directory.authorizeSnapshot() : config.directory;
  const authorized = await authorizeSyncInspect(claims, directory, actorId);
  return Object.freeze({ organizationId: authorized.orgId, deviceId: authorized.deviceId, actorId: authorized.actorId });
}

export async function inspectSyncTransport(headers, config) {
  const auth = await authorizeSyncTransport(headers, config);
  // Don't reveal event metadata until journal exists and is readable.
  if (!config.journal || typeof config.journal.inspect !== 'function') throw new Error('Journal unavailable');
  const records = await config.journal.inspect(auth.organizationId);
  if (!Array.isArray(records)) throw new Error('Invalid journal response');
  return Object.freeze({ connected: true, organizationId: auth.organizationId,
    stagedEvents: records.length, uploadsEnabled: false, financialReplicationEnabled: false });
}
