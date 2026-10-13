/** Encrypted-only backup write boundary. No plaintext or sync event writes. */
import { verifySyncCapability, checkSyncRequestScope } from './syncAuth.mjs';
import { verifySyncSession, authorizeActiveSyncSession } from './syncSession.mjs';
import { authorizeBackupWrite } from './syncMembership.mjs';
import { validateEncryptedBackupEnvelope } from './syncBackupVault.mjs';

export async function uploadEncryptedBackup(headers, envelope, config) {
  if (!config?.directory || !config.sessionStore || typeof config.vault?.store !== 'function') throw new Error('Backup upload unavailable');
  const claims = verifySyncCapability(headers?.authorization, config.capabilitySecret);
  if (claims.scope !== 'backup:write') throw new Error('Backup write capability required');
  checkSyncRequestScope(claims, headers?.organizationId, headers?.deviceId);
  const session = verifySyncSession(headers?.session, config.sessionSecret);
  const actorId = await authorizeActiveSyncSession(session, config.sessionStore);
  const directory = typeof config.directory.authorizeSnapshot === 'function'
    ? await config.directory.authorizeSnapshot() : config.directory;
  await authorizeBackupWrite(claims, directory, actorId);
  if (envelope?.organizationId !== claims.orgId || envelope?.deviceId !== claims.deviceId) throw new Error('Backup envelope scope mismatch');
  validateEncryptedBackupEnvelope(envelope);
  const result = await config.vault.store(envelope);
  if (!result || !/^[0-9a-f-]{36}$/.test(result.backupId) || result.sha256 !== envelope.sha256) throw new Error('Invalid backup storage acknowledgement');
  return Object.freeze({backupId:result.backupId,sha256:result.sha256,organizationId:claims.orgId});
}
