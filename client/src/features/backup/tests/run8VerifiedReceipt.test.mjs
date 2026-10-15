import test from 'node:test';
import assert from 'node:assert/strict';
import {RUN8_VERIFIED_RECEIPT_KEY,RUN8_VERIFIED_RECEIPT_KIND,
 serializeRun8VerifiedReceipt,parseRun8VerifiedReceipt}
 from '../run8VerifiedReceipt.mjs';
const original=()=>({kind:RUN8_VERIFIED_RECEIPT_KIND,
 companyId:'primary',createdAt:'2026-10-16T01:00:00.000Z',
 verifiedAt:'2026-10-16T01:15:00.000Z',sha256:'a'.repeat(64)});
test('receipt uses separate v2 metadata key, not legacy export timestamp',()=>{
 assert.equal(RUN8_VERIFIED_RECEIPT_KEY,'verifiedBackupReceiptV2');
});
test('receipt round-trip retains company and file SHA only',()=>{
 const parsed=parseRun8VerifiedReceipt(serializeRun8VerifiedReceipt(original()));
 assert.deepEqual(parsed,original());
 assert.ok(Object.isFrozen(parsed));
});
test('short or malformed fingerprint cannot assert backup readiness',()=>{
 for(const sha256 of ['', 'A'.repeat(64), 'a'.repeat(63)])
  assert.throws(()=>serializeRun8VerifiedReceipt({...original(),sha256}),/Invalid verified/);
});
test('unknown identity and extra metadata cannot masquerade as a valid receipt',()=>{
 assert.throws(()=>serializeRun8VerifiedReceipt({...original(), companyId:''}),/Invalid verified/);
 assert.throws(()=>serializeRun8VerifiedReceipt({...original(),role:'owner'}),/Invalid verified/);
});
test('corrupt or wrong-kind metadata is denied without replacement',()=>{
 assert.throws(()=>parseRun8VerifiedReceipt('{'),/Invalid verified/);
 assert.throws(()=>parseRun8VerifiedReceipt(JSON.stringify({...original(),kind:'legacy'})),/Invalid verified/);
});
test('dates must use exact round-trippable ISO UTC timestamps',()=>{
 for(const createdAt of ['2026-02-30T01:00:00.000Z',
  '2026-10-16','yesterday','2026-10-16T01:00:00+00:00'])
  assert.throws(()=>serializeRun8VerifiedReceipt({...original(),createdAt}),/Invalid verified/);
});
test('oversized metadata is rejected before JSON allocation',()=>{
 assert.throws(()=>parseRun8VerifiedReceipt('x'.repeat(1025)),/Invalid verified/);
});
test('legacy timestamp-only data cannot be parsed as verified file evidence',()=>{
 assert.throws(()=>parseRun8VerifiedReceipt(JSON.stringify({
  companyId:'primary',createdAt:'2026-10-16T01:00:00.000Z'
 })),/Invalid verified/);
});
