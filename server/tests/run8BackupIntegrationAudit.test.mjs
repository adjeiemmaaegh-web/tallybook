import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=(path)=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
const backup=()=>source('client/src/features/backup/backup.ts');
const page=()=>source('client/src/pages/BackupPage.tsx');
test('portable schema version stays unchanged while compatibility is additive',()=>{
 const db=source('client/src/db/TallybookDB.ts');
 assert.match(db,/DATABASE_SCHEMA_VERSION = 28/);
 assert.match(backup(),/normalizeRun8BackupTables\(/);
 assert.match(backup(),/RUN8_BACKUP_TABLES\.some/);
});
test('backup parser validates size and ambiguous JSON before object parsing',()=>{
 const code=backup(),begin=code.indexOf('export function parseBackup(');
 const end=code.indexOf('export function getBackupSummary(',begin);
 assert.ok(begin>0&&end>begin);
 const parser=code.slice(begin,end);
 const size=parser.indexOf('assertPlainBackupSize(text)');
 const preflight=parser.indexOf('assertRun8UnambiguousJSON(text)');
 const json=parser.indexOf('JSON.parse(text)');
 const matrix=parser.indexOf('normalizeRun8BackupTables(');
 assert.ok(size>=0&&preflight>size&&json>preflight&&matrix>json);
});
test('parser refuses unknown root and incomplete assistant snapshots',()=>{
 const code=backup();
 assert.match(code,/unknown top-level data/);
 assert.match(code,/assistant section is incomplete/);
 assert.match(code,/Required backup table/); // via explicit module import or policy
});
test('v2 encrypted backups bind authenticated header and keep v1 decrypt compatibility',()=>{
 const crypto=source('client/src/features/backup/backupCrypto.ts');
 assert.match(crypto,/kind:RUN8_ENCRYPTED_V2/);
 assert.match(crypto,/additionalData:encoder\.encode\(RUN8_AAD\)/);
 assert.match(crypto,/if\(format==="v2"\)cipherOptions\.additionalData/);
 assert.match(crypto,/assertRun8EncryptedEnvelope/);
});
test('backup UI encrypts every export, never offers a plaintext export toggle',()=>{
 const ui=page(),begin=ui.indexOf('const exportLocalBackup = async');
 const end=ui.indexOf('const verifyDownloadedFile=',begin);
 const code=ui.slice(begin,end);
 assert.ok(begin>=0&&end>begin);
 assert.match(code,/encryptBackupText\(stringifyBackup\(backup\),passphrase\)/);
 assert.match(code,/createRun8FileReceipt\(/);
 assert.doesNotMatch(code,/optional passphrase encryption|window\.confirm\(/);
 assert.doesNotMatch(code,/recordBackupExportedAt\(/);
});
test('reselected-file verification precedes persisted backup readiness marker',()=>{
 const ui=page(),begin=ui.indexOf('const verifyDownloadedFile=');
 const end=ui.indexOf('const readBackup = async',begin);
 const code=ui.slice(begin,end);
 const hash=code.indexOf('verifyRun8FileReceipt(');
 const decrypt=code.indexOf('decryptBackupText(');
 const parse=code.indexOf('parseBackup(');
 const record=code.indexOf('recordBackupExportedAt(');
 assert.ok(hash>=0&&decrypt>hash&&parse>=0&&parse<record&&record>decrypt);
 assert.match(code,/proof\.companyId/);
});
test('import path requires privacy acknowledgement for legacy plaintext backups',()=>{
 const ui=page(),begin=ui.indexOf('const readBackup = async');
 const end=ui.indexOf('const confirmRestore = async',begin);
 const code=ui.slice(begin,end);
 assert.match(code,/setPendingBackup\(null\);setSummary\(null\)/);
 assert.match(code,/classifyRun8BackupEnvelope/);
 assert.match(code,/window\.confirm\(/);
 assert.match(code,/parseBackup\(plain\)/);
});
test('restore remains exclusive with journal commit and assistant rollback',()=>{
 const code=backup();
 assert.match(code,/withCrossTabDataLock\('exclusive', \(\) => restoreBackupWhileLocked/);
 assert.match(code,/beginBackupRestoreJournal\(/);
 assert.match(code,/writeAssistantRestoreSnapshot\(/);
 assert.match(code,/await database\.appMeta\.delete\(RESTORE_JOURNAL_KEY\)/);
 assert.match(code,/recoverPendingBackupRestoreWhileLocked/);
});
test('new v2 passphrase and binary operations remain browser-local',()=>{
 const crypto=source('client/src/features/backup/backupCrypto.ts');
 assert.match(crypto,/crypto\.getRandomValues\(new Uint8Array\(16\)\)/);
 assert.match(crypto,/crypto\.getRandomValues\(new Uint8Array\(12\)\)/);
 assert.match(crypto,/crypto\.subtle\.encrypt/);
 assert.match(crypto,/crypto\.subtle\.decrypt/);
 assert.doesNotMatch(crypto,/fetch\(|localStorage\.|sessionStorage\./);
});
test('file receipt never stores the entire encrypted file or passphrase',()=>{
 const receipt=source('client/src/features/backup/run8BackupFileReceipt.mjs');
 assert.match(receipt,/sha256:await digest\(text,subtle\)/);
 assert.doesNotMatch(receipt,/passphrase|localStorage|sessionStorage/);
 assert.match(receipt,/sha256:receipt\.sha256/);
});
