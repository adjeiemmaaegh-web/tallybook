import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun8FileReceipt,verifyRun8FileReceipt}
 from '../run8BackupFileReceipt.mjs';

const company='primary',date='2026-10-16T00:00:00.000Z';
const file=JSON.stringify({kind:'tallybook-encrypted-v2',version:2,
 kdf:'PBKDF2-SHA256',iterations:310000,cipher:'AES-256-GCM',
 salt:'AAAAAAAAAAAAAAAAAAAAAA==',iv:'AAAAAAAAAAAAAAAA',
 data:'AAAAAAAAAAAAAAAAAAAAAA=='});
const fakeSubtle={async digest(alg,bytes){
 assert.equal(alg,'SHA-256');
 const h=new Uint8Array(32);
 for(let i=0;i<bytes.length;i++)h[i%32]=(h[i%32]*7+bytes[i])%256;
 return h.buffer;
}};
test('encrypted reselected file with identical bytes is acknowledged',async()=>{
 const receipt=await createRun8FileReceipt(file,company,date,fakeSubtle);
 const result=await verifyRun8FileReceipt(receipt,file,company,fakeSubtle);
 assert.equal(result.companyId,company);
 assert.equal(result.createdAt,date);
 assert.equal(result.sha256,receipt.sha256);
 assert.ok(Object.isFrozen(result));
});
test('receipt stores only identity and hash, never raw backup text',async()=>{
 const r=await createRun8FileReceipt(file,company,date,fakeSubtle);
 assert.equal(JSON.stringify(r).includes(file),false);
 assert.equal(Object.isFrozen(r),true);
 assert.match(r.sha256,/^[0-9a-f]{64}$/);
});
test('modified encrypted content does not match original download receipt',async()=>{
 const receipt=await createRun8FileReceipt(file,company,date,fakeSubtle);
 const edited=file.replace('"iterations":310000','"iterations":1');
 await assert.rejects(verifyRun8FileReceipt(receipt,edited,company,fakeSubtle),/does not match/);
});
test('a different company cannot receive the selected-file verification',async()=>{
 const receipt=await createRun8FileReceipt(file,company,date,fakeSubtle);
 await assert.rejects(verifyRun8FileReceipt(receipt,file,'other',fakeSubtle),/different export or company/);
});
test('legacy unencrypted file is never qualified as a verified new export',async()=>{
 await assert.rejects(createRun8FileReceipt('{"kind":"tallybook-local-backup"}',
  company,date,fakeSubtle),/Only new encrypted/);
});
test('legacy encrypted v1 cannot masquerade as a newly exported v2 file',async()=>{
 const old=file.replace('tallybook-encrypted-v2','tallybook-encrypted-v1');
 await assert.rejects(createRun8FileReceipt(old,company,date,fakeSubtle),/Only new encrypted/);
});
test('empty company or invalid timestamp cannot produce a receipt',async()=>{
 await assert.rejects(createRun8FileReceipt(file,'',date,fakeSubtle),/Invalid exported/);
 await assert.rejects(createRun8FileReceipt(file,company,'not-date',fakeSubtle),/Invalid exported/);
});
test('lack of digest primitive blocks verification rather than automatically approving',async()=>{
 await assert.rejects(createRun8FileReceipt(file,company,date,{}),/SHA-256 support/);
});
test('unbounded corrupted fingerprint or wrong envelope format rejects',async()=>{
 const receipt=await createRun8FileReceipt(file,company,date,fakeSubtle);
 await assert.rejects(verifyRun8FileReceipt({...receipt,sha256:'bad'},file,company,fakeSubtle),/different export/);
 await assert.rejects(verifyRun8FileReceipt({...receipt,format:'plain'},file,company,fakeSubtle),/different export/);
});
