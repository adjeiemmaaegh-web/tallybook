import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_BACKUP_JSON_BYTES, MAX_ENCRYPTED_BACKUP_BYTES, MAX_ENCRYPTED_BACKUP_DATA_CHARS,
  utf8ExceedsLimit, assertPlainBackupSize, assertEncryptedBackupSize, assertBackupImportFileSize,
} from '../client/src/features/backup/backupResourceLimits.mjs';

test('UTF-8 budget accounts for ASCII, multibyte text, surrogate pairs and replacement characters', () => {
  for (const text of ['abc', 'GHS ₵', '🛒', 'A\ud800B', '\udc00', '🇬🇭']) {
    const bytes = new TextEncoder().encode(text).byteLength;
    assert.equal(utf8ExceedsLimit(text, bytes), false, JSON.stringify(text));
    assert.equal(utf8ExceedsLimit(text, bytes - 1), true, JSON.stringify(text));
  }
  assert.equal(utf8ExceedsLimit('', 0), false);
  assert.equal(utf8ExceedsLimit('a', 0), true);
  assert.throws(() => utf8ExceedsLimit('x', -1), /invalid backup size/i);
  assert.throws(() => utf8ExceedsLimit('x', NaN), /invalid backup size/i);
});

test('plain JSON cap blocks 3-byte input even when UTF-16 length looks safe', () => {
  assert.equal(MAX_BACKUP_JSON_BYTES, 64 * 1024 * 1024);
  const text = '€'.repeat(Math.floor(MAX_BACKUP_JSON_BYTES / 3) + 1);
  assert.ok(text.length < MAX_BACKUP_JSON_BYTES);
  assert.ok(new TextEncoder().encode(text).byteLength > MAX_BACKUP_JSON_BYTES);
  assert.throws(() => assertPlainBackupSize(text), /64 MiB JSON safety limit/i);
  assert.equal(assertPlainBackupSize('{"sales":[]}'), '{"sales":[]}');
});

test('file import cap rejects oversized and invalid file metadata BEFORE reading', () => {
  assert.equal(MAX_ENCRYPTED_BACKUP_BYTES, 96 * 1024 * 1024);
  assert.equal(assertBackupImportFileSize(MAX_ENCRYPTED_BACKUP_BYTES), undefined);
  for (const size of [-1, Infinity, NaN, MAX_ENCRYPTED_BACKUP_BYTES + 1, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => assertBackupImportFileSize(size), /import limit|invalid size/i);
  }
});

test('envelope budget accounts for UTF-8 and encrypted ciphertext tag overhead', () => {
  assert.ok(MAX_ENCRYPTED_BACKUP_DATA_CHARS > MAX_BACKUP_JSON_BYTES);
  assert.ok(MAX_ENCRYPTED_BACKUP_DATA_CHARS < MAX_ENCRYPTED_BACKUP_BYTES);
  assert.equal(assertEncryptedBackupSize('{"kind":"tallybook-encrypted-v1"}'), '{"kind":"tallybook-encrypted-v1"}');
  assert.throws(() => assertEncryptedBackupSize('X'.repeat(MAX_ENCRYPTED_BACKUP_BYTES + 1)), /96 MiB safety limit/i);
});
