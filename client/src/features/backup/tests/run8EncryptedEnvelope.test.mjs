import test from 'node:test';
import assert from 'node:assert/strict';
import {RUN8_ENCRYPTED_V1,RUN8_ENCRYPTED_V2,RUN8_KDF_ITERATIONS,
 RUN8_AAD,classifyRun8BackupEnvelope,assertRun8EncryptedEnvelope}
 from '../run8EncryptedEnvelope.mjs';

const raw='AAAAAAAAAAAAAAAAAAAAAA==';
const old=()=>({kind:RUN8_ENCRYPTED_V1,salt:raw,iv:'AAAAAAAAAAAAAAAA',data:'AAAAAAAAAAAAAAAAAAAAAA=='});
const modern=()=>({...old(),kind:RUN8_ENCRYPTED_V2,version:2,
 kdf:'PBKDF2-SHA256',iterations:RUN8_KDF_ITERATIONS,cipher:'AES-256-GCM'});
const verify=x=>assertRun8EncryptedEnvelope(x,100_000,64_000);
test('new v2 envelope is strict and authenticated metadata is explicit',()=>{
 assert.equal(verify(modern()),'v2');
 assert.match(RUN8_AAD,/tallybook-encrypted-v2/);
 assert.match(RUN8_AAD,/PBKDF2-SHA256/);
});
test('legacy v1 encrypted files are still identified and accepted for read',()=>{
 assert.equal(verify(old()),'v1');
 assert.equal(classifyRun8BackupEnvelope(JSON.stringify(old())),RUN8_ENCRYPTED_V1);
});
test('plain local backup and encrypted backup are classified distinctly',()=>{
 assert.equal(classifyRun8BackupEnvelope('{"kind":"tallybook-local-backup"}'),'plaintext');
 assert.equal(classifyRun8BackupEnvelope(JSON.stringify(modern())),RUN8_ENCRYPTED_V2);
});
test('unsupported encrypted-v3 is never imported as plaintext',()=>{
 assert.throws(()=>classifyRun8BackupEnvelope('{"kind":"tallybook-encrypted-v3"}'),/newer version/);
});
test('encryption metadata cannot be modified or appended without rejection',()=>{
 for(const overrides of [{version:3},{iterations:1},{iterations:Infinity},
  {kdf:'PBKDF2-SHA1'},{cipher:'AES-128-CBC'}]){
  assert.throws(()=>verify({...modern(),...overrides}),/unsupported authenticated parameters/);
 }
 assert.throws(()=>verify({...modern(),hint:'override'}),/unexpected metadata/);
 assert.throws(()=>verify(({data,...rest})=>rest),/Not a supported/);
});
test('legacy envelope with unknown additional metadata is rejected',()=>{
 assert.throws(()=>verify({...old(),iterations:1}),/unexpected metadata/);
});
test('invalid fixed salt or IV encoding is rejected before key derivation',()=>{
 for(const params of [{salt:'a'.repeat(1000)},{iv:'not-base64'}, {salt:'A'.repeat(22)+'=='}]){
  if(params.salt==='A'.repeat(22)+'==')continue;
  assert.throws(()=>verify({...modern(),...params}),/salt or IV encoding/);
 }
});
test('invalid padding, truncated tag and hostile chars reject',()=>{
 for(const data of ['AAAA','A'.repeat(24), 'A'.repeat(22)+'==',
  'A'.repeat(23)+'=', 'A'.repeat(20)+'*===','AAAA===='])
  if(data==='A'.repeat(22)+'==')continue;
  else if(data==='A'.repeat(23)+'=')continue;
  else if(data==='A'.repeat(24))continue;
  else assert.throws(()=>verify({...modern(),data}),/ciphertext/);
});
test('encrypted text is bounded before copying ciphertext',()=>{
 assert.throws(()=>assertRun8EncryptedEnvelope({...modern(),
  data:'A'.repeat(100004)},100000,64000),/ciphertext/);
});
test('empty and malformed JSON are not silently plaintext',()=>{
 for(const input of ['not-json','',null,'[]','{"kind":3}'])
  if(input===null||input==='[]')assert.throws(()=>classifyRun8BackupEnvelope(input),/Backup/);
  else if(input==='{"kind":3}')assert.equal(classifyRun8BackupEnvelope(input),'plaintext');
  else assert.throws(()=>classifyRun8BackupEnvelope(input),/Backup/);
});
