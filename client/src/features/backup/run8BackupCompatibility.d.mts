export const RUN8_BACKUP_TABLES: readonly string[];
export function normalizeRun8BackupTables(
 records:unknown,schemaVersion:number,currentSchemaVersion:number
): Record<string, Record<string, unknown>[]>;
