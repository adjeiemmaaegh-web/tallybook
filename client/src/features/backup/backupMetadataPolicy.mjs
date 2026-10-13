/**
 * App metadata belongs to this browser/database instance, not to a portable
 * business snapshot. Retain a narrow set of legacy backup keys only for
 * parsing old files. Never write these rows into the current device on import.
 *
 * In particular, the current schema marker, database creation identity,
 * recovery journal and most recent local backup status must not be replaced
 * by an untrusted or older file.
 */
const legacyMetadataKeys = new Set([
  'databaseCreatedAt', 'schemaVersion', 'lastBackupAt', 'lastBackupCompanyId',
]);

export function assertImportableLegacyBackupMetadata(rows) {
  if (!Array.isArray(rows)) throw new Error('Backup metadata must be a list.');
  const keys = new Set();
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row) ||
        typeof row.key !== 'string' || !legacyMetadataKeys.has(row.key) || keys.has(row.key) ||
        typeof row.value !== 'string' || row.value.length > 4096 ||
        typeof row.updatedAt !== 'string' || !Number.isFinite(Date.parse(row.updatedAt))) {
      throw new Error('Backup contains unsafe or duplicated device metadata.');
    }
    keys.add(row.key);
  }
  return true;
}

/** The business snapshot has its own schema/version; device metadata is never exported. */
export function portableBackupMetadata() { return []; }
