import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptBackupText, decryptBackupText, isEncryptedBackup } from '../client/src/features/backup/backupCrypto.ts';
import { MAX_BACKUP_JSON_BYTES, MAX_ENCRYPTED_BACKUP_DATA_CHARS } from '../client/src/features/backup/backupResourceLimits.mjs';

const passphrase = 'test only — strong passphrase for local backup QA';

test('actual WebCrypto encrypted backup remains readable after size-guard changes', async () => {
  const json = JSON.stringify({ kind:'tallybook-local-backup', record:'á🚀 Ghana ₵', items:[1,2,3] });
  const ciphertext = await encryptBackupText(json, passphrase);
  assert.equal(isEncryptedBackup(ciphertext), true);
  assert.ok(!ciphertext.includes('Ghana'));
  assert.equal(await decryptBackupText(ciphertext, passphrase), json);
  await assert.rejects(decryptBackupText(ciphertext, 'a different long passphrase'), /Could not decrypt backup/);
});

test('encrypted backups reject invalid and damaged structures without deriving a key', async () => {
  for (const serialized of ['x', 'null', '[]', '{}', '{"kind":"tallybook-encrypted-v1","salt":true,"iv":false,"data":""}']) {
    await assert.rejects(decryptBackupText(serialized, passphrase), /Invalid encrypted backup JSON|Not a supported encrypted backup|Invalid encrypted backup salt or IV encoding/);
  }
  const hostile = JSON.stringify({kind:'tallybook-encrypted-v1', salt:'AA==', iv:'AA==', data:'AAAA'});
  await assert.rejects(decryptBackupText(hostile, passphrase), /Invalid encrypted backup salt or IV encoding/);
});

test('large UTF-8 backup JSON is refused before any encryption work', async () => {
  const large = '€'.repeat(Math.floor(MAX_BACKUP_JSON_BYTES / 3) + 1);
  await assert.rejects(encryptBackupText(large, passphrase), /64 MiB JSON safety limit/);
});

test('ciphertext base64 exceeds the permitted decoded JSON budget even inside a valid-sized wrapper', async () => {
  const data = 'A'.repeat(MAX_ENCRYPTED_BACKUP_DATA_CHARS + 1);
  const wrapper = JSON.stringify({kind:'tallybook-encrypted-v1', salt:'AAAAAAAAAAAAAAAAAAAAAA==',iv:'AAAAAAAAAAAAAAAA',data});
  assert.ok(wrapper.length < 96 * 1024 * 1024);
  await assert.rejects(decryptBackupText(wrapper, passphrase), /ciphertext exceeds|Invalid encrypted backup ciphertext encoding or length/i);
});


test('malformed salt and IV are rejected before decoding large attacker-controlled fields', async () => {
  const envelope = {kind:'tallybook-encrypted-v1', salt:'A'.repeat(2_000_000), iv:'AAAAAAAAAAAAAAAA', data:'AAAAAAAAAAAAAAAAAAAAAA=='};
  await assert.rejects(decryptBackupText(JSON.stringify(envelope), passphrase), /salt or IV encoding/i);
  for (const [salt, iv] of [
    ['AAAAAAAAAAAAAAAAAAAAAA==', 'A'.repeat(1_000_000)],
    ['AAAAAAAAAAAAAAAAAAAAAA==', 'AAAAAAAAAAAAAAA='],
    ['A'.repeat(22) + '==', 'AAAAAAAAAAAAAAA!'],
  ]) {
    await assert.rejects(decryptBackupText(JSON.stringify({...envelope,salt,iv}), passphrase), /salt or IV encoding/i);
  }
});

test('invalid ciphertext base64 padding, alphabet and short authentication tags fail before PBKDF2', async () => {
  const base = { kind:'tallybook-encrypted-v1', salt:'AAAAAAAAAAAAAAAAAAAAAA==', iv:'AAAAAAAAAAAAAAAA' };
  for (const data of ['AAAA', 'A'.repeat(25), 'A'.repeat(22) + '!=', 'A'.repeat(22) + '=A',
                      'A'.repeat(20) + '===A', 'A'.repeat(20) + '=AAA', 'A'.repeat(20) + 'AA= ',
                      'A'.repeat(24) + '\n']) {
    await assert.rejects(decryptBackupText(JSON.stringify({...base, data}), passphrase), /ciphertext encoding|authentication tag/i, data.slice(-8));
  }
});

test('authenticated but invalid UTF-8 is rejected rather than silently replaced during import', async () => {
  const salt = new Uint8Array(16).fill(13);
  const iv = new Uint8Array(12).fill(29);
  const rawKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name:'PBKDF2', salt, iterations:310000, hash:'SHA-256' }, rawKey,
    { name:'AES-GCM', length:256 }, false, ['encrypt'],
  );
  // Valid JSON byte framing with an invalid UTF-8 string byte. The previous
  // non-fatal decoder silently converted this into a different JSON record.
  const maliciousPlaintext = Uint8Array.from([123,34,120,34,58,34,255,34,125]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv}, key, maliciousPlaintext));
  const toBase64 = bytes => Buffer.from(bytes).toString('base64');
  const wrapper = JSON.stringify({kind:'tallybook-encrypted-v1',salt:toBase64(salt),iv:toBase64(iv),data:toBase64(ciphertext)});
  await assert.rejects(decryptBackupText(wrapper, passphrase), /invalid UTF-8.*No records were imported/i);
});
