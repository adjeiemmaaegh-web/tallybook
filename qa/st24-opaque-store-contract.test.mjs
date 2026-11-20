import test from 'node:test';
import assert from 'node:assert/strict';
import {assertSt24OpaqueStoreSchema,assertSt24SealedRow} from '../client/src/features/security/st24OpaqueStoreContract.mjs';
test('only opaque id primary key without secondary indexes is accepted',()=>{
 assert.deepEqual(assertSt24OpaqueStoreSchema({name:'encryptedRows',keyPath:'id'}),{name:'encryptedRows',keyPath:'id',indexCount:0});
 for(const keyPath of ['customerId','phone',['companyId','name'],null])
  assert.throws(()=>assertSt24OpaqueStoreSchema({name:'encryptedRows',keyPath}),/rejected/);
 for(const name of ['customerName','receiptNumber','outstandingMinor'])
  assert.throws(()=>assertSt24OpaqueStoreSchema({name:'encryptedRows',keyPath:'id',indexes:[{name,keyPath:name}]}),/secondary index/);
});
test('rejects plaintext leakage, unsafe revisions and malformed envelopes',()=>{
 const row={id:'opaque_1234567890123456',revision:1,kind:'tallybook-ledger-record',version:1,iv:'abc',ciphertext:'def'};
 assert.equal(assertSt24SealedRow(row),true);
 for(const extra of [{phone:'123'}, {customerName:'Person'}, {outstandingMinor:200}, {businessProfileId:'shop'}])
  assert.throws(()=>assertSt24SealedRow({...row,...extra}),/unapproved field/);
 for(const revision of [0,-1,1.5,NaN])
  assert.throws(()=>assertSt24SealedRow({...row,revision}),/invalid revision/);
 assert.throws(()=>assertSt24SealedRow({...row,id:'customer-1'}),/opaque id/);
});
