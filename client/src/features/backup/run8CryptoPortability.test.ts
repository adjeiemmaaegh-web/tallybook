import {describe,it,expect} from 'vitest';
import {encryptBackupText,decryptBackupText,isEncryptedBackup} from './backupCrypto';
import {classifyRun8BackupEnvelope,RUN8_ENCRYPTED_V1,RUN8_ENCRYPTED_V2,
 RUN8_KDF_ITERATIONS} from './run8EncryptedEnvelope.mjs';
import {createRun8FileReceipt,verifyRun8FileReceipt}
 from './run8BackupFileReceipt.mjs';

const pass='run8 portable recovery phrase with ample length';
const payload=JSON.stringify({kind:'tallybook-local-backup',
 createdAt:'2026-10-16T00:00:00.000Z',notes:'Éléphant 🐘',sales:[{totalMinor:975}]});
const to64=(bytes:Uint8Array)=>btoa(Array.from(bytes,
 value=>String.fromCharCode(value)).join(''));
describe('Run 8 browser WebCrypto and portable backup v1/v2 compatibility',()=>{
 it('new encryption writes v2 with fixed authenticated cipher and key derivation',async()=>{
  const encrypted=await encryptBackupText(payload,pass);
  const wrapped=JSON.parse(encrypted);
  expect(wrapped.kind).toBe(RUN8_ENCRYPTED_V2);
  expect(wrapped.version).toBe(2);
  expect(wrapped.iterations).toBe(RUN8_KDF_ITERATIONS);
  expect(wrapped.kdf).toBe('PBKDF2-SHA256');
  expect(wrapped.cipher).toBe('AES-256-GCM');
  expect(isEncryptedBackup(encrypted)).toBe(true);
  expect(encrypted).not.toContain('totalMinor');
  expect(await decryptBackupText(encrypted,pass)).toBe(payload);
 });
 it('wrong password, altered ciphertext and forged v2 metadata are rejected',async()=>{
  const encrypted=await encryptBackupText(payload,pass);
  const wrapped=JSON.parse(encrypted);
  await expect(decryptBackupText(encrypted,'incorrect password'))
    .rejects.toThrow(/Could not decrypt/);
  const tampered={...wrapped,data:wrapped.data.replace(/^./,wrapped.data[0]==='A'?'B':'A')};
  await expect(decryptBackupText(JSON.stringify(tampered),pass))
    .rejects.toThrow(/decrypt/);
  for(const overrides of [{iterations:1},{version:999},{cipher:'AES-128-CBC'}]){
   await expect(decryptBackupText(JSON.stringify({...wrapped,...overrides}),pass))
    .rejects.toThrow(/authenticated parameters/);
  }
 });
 it('unexpected encrypted envelope keys or noncanonical base64 cannot be accepted',async()=>{
  const envelope=JSON.parse(await encryptBackupText(payload,pass));
  await expect(decryptBackupText(JSON.stringify({...envelope,extra:'unknown'}),pass))
    .rejects.toThrow(/unexpected metadata/);
  const invalid={...envelope,salt:envelope.salt.replace(/.$/,'A')};
  await expect(decryptBackupText(JSON.stringify(invalid),pass))
    .rejects.toThrow();
 });
 it('decrypts a genuine legacy encrypted-v1 file from the old algorithm',async()=>{
  const salt=Uint8Array.from({length:16},(_,i)=>i+1);
  const iv=Uint8Array.from({length:12},(_,i)=>i+2);
  const raw=await crypto.subtle.importKey('raw',new TextEncoder().encode(pass),
   'PBKDF2',false,['deriveKey']);
  const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt,
   iterations:310000,hash:'SHA-256'},raw,{name:'AES-GCM',length:256},
   false,['encrypt','decrypt']);
  const ciphertext=new Uint8Array(await crypto.subtle.encrypt(
   {name:'AES-GCM',iv},key,new TextEncoder().encode(payload)));
  const legacy=JSON.stringify({kind:RUN8_ENCRYPTED_V1,salt:to64(salt),
   iv:to64(iv),data:to64(ciphertext)});
  expect(isEncryptedBackup(legacy)).toBe(true);
  expect(await decryptBackupText(legacy,pass)).toBe(payload);
 });
 it('does not silently import unsupported future encrypted formats as plaintext',()=>{
  expect(classifyRun8BackupEnvelope('{"kind":"tallybook-local-backup"}'))
   .toBe('plaintext');
  expect(()=>classifyRun8BackupEnvelope('{"kind":"tallybook-encrypted-v99"}'))
   .toThrow(/newer version/);
 });
 it('reselected encrypted v2 file matches real browser SHA-256 fingerprint',async()=>{
  const encrypted=await encryptBackupText(payload,pass);
  const receipt=await createRun8FileReceipt(encrypted,'primary',
   '2026-10-16T00:00:00.000Z');
  const verified=await verifyRun8FileReceipt(receipt,encrypted,'primary');
  expect(verified.companyId).toBe('primary');
  await expect(verifyRun8FileReceipt(receipt,encrypted+' ','primary'))
   .rejects.toThrow(/does not match/);
  await expect(verifyRun8FileReceipt(receipt,encrypted,'different-company'))
   .rejects.toThrow(/different export or company/);
 });
});
