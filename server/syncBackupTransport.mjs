/** Authenticated, read-only encrypted backup retrieval.
 * Never authorizes writes with a sync:inspect capability. The returned payload is opaque ciphertext.
 */
import { authorizeSyncTransport } from './syncTransport.mjs';
const BACKUP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export async function retrieveEncryptedBackup(headers, backupId, config) {
  if (typeof backupId !== 'string' || !BACKUP_ID.test(backupId)) throw new Error('Invalid backup identifier');
  const identity = await authorizeSyncTransport(headers, config);
  if (!config.vault || typeof config.vault.read !== 'function') throw new Error('Backup retrieval unavailable');
  const record = await config.vault.read(identity.organizationId, backupId);
  if (!record || record.organizationId !== identity.organizationId || record.backupId !== backupId ||
      typeof record.ciphertext !== 'string' || typeof record.sha256 !== 'string') throw new Error('Invalid scoped backup result');
  return Object.freeze({backupId:record.backupId,organizationId:identity.organizationId,
    ciphertext:record.ciphertext,sha256:record.sha256,createdAt:record.createdAt});
}
