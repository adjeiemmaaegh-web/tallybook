import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export function verifyBackupPayload(bytes: Uint8Array, metadata: {sha256:string;length:number;schemaVersion:number}) {
  if (!Number.isSafeInteger(metadata.schemaVersion) || metadata.schemaVersion < 1) throw new Error('Invalid schema version');
  if (metadata.length !== bytes.byteLength) throw new Error('Backup length mismatch');
  if (createHash('sha256').update(bytes).digest('hex') !== metadata.sha256) throw new Error('Backup checksum mismatch');
  return true;
}

test('unchanged backup bytes verify', () => {const b=Buffer.from('backup');assert.equal(verifyBackupPayload(b,{sha256:createHash('sha256').update(b).digest('hex'),length:b.length,schemaVersion:33}),true)});
test('altered backup fails', () => {const b=Buffer.from('backup');assert.throws(() => verifyBackupPayload(Buffer.from('corrupt'),{sha256:createHash('sha256').update(b).digest('hex'),length:7,schemaVersion:33}), /checksum/)});
test('invalid schema fails', () => assert.throws(() => verifyBackupPayload(Buffer.alloc(0),{sha256:createHash('sha256').update('').digest('hex'),length:0,schemaVersion:0}), /schema/));
