import test from 'node:test';
import assert from 'node:assert/strict';
import {assertImportableLegacyBackupMetadata,portableBackupMetadata} from '../client/src/features/backup/backupMetadataPolicy.mjs';
const stamp = '2026-10-11T04:00:00.000Z';
const row = (key,value='value')=>({key,value,updatedAt:stamp});

test('a new portable business backup exports no device-local metadata',()=>{
  assert.deepEqual(portableBackupMetadata(),[]);
});
test('preexisting legacy backup metadata parses but has no apply/export effect',()=>{
  assert.equal(assertImportableLegacyBackupMetadata([row('schemaVersion','26'),row('databaseCreatedAt',stamp),row('lastBackupAt',stamp),row('lastBackupCompanyId','company-1')]),true);
  assert.equal(assertImportableLegacyBackupMetadata([]),true);
});
test('restore recovery journal and active company controls cannot be imported',()=>{
  for(const key of ['restoreRecoveryJournal','activeBusinessProfileId','unknownKey'])
    assert.throws(()=>assertImportableLegacyBackupMetadata([row(key,'injected')]),/unsafe/i);
});
test('backup cannot supply duplicate device metadata to overwrite a local setting',()=>{
  assert.throws(()=>assertImportableLegacyBackupMetadata([row('schemaVersion','1'),row('schemaVersion','28')]),/duplicat|unsafe/i);
});
test('invalid metadata values and timestamps fail closed',()=>{
  for(const bad of [row('schemaVersion',5), {...row('schemaVersion'),updatedAt:'nonsense'}, {...row('schemaVersion'),value:'z'.repeat(4097)},null,[],{key:55}])
    assert.throws(()=>assertImportableLegacyBackupMetadata([bad]),/unsafe/i);
});
test('non-list metadata fails closed instead of importing arbitrary records',()=>{
  for(const bad of [undefined,null,{},'metadata',4])
    assert.throws(()=>assertImportableLegacyBackupMetadata(bad),/list/i);
});
