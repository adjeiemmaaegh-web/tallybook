import assert from 'node:assert/strict';

/** Feature audit tests must survive a later valid Dexie migration while
 * retaining both the historical v28 path and the v36 staff safety marker. */
export function assertStaffGovernanceSchema(databaseSource) {
  const declared = Number(databaseSource.match(/DATABASE_SCHEMA_VERSION\s*=\s*(\d+)/)?.[1]);
  const migrations = [...databaseSource.matchAll(/this\.version\((\d+)\)/g)].map(match => Number(match[1]));
  assert.ok(Number.isSafeInteger(declared) && declared >= 36);
  assert.ok(migrations.includes(28) && migrations.includes(36));
  assert.equal(declared, Math.max(...migrations));
}
