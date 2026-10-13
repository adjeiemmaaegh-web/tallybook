import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,chmod,rm,symlink,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createEncryptedBackupVault,validateEncryptedBackupEnvelope} from '../syncBackupVault.mjs';
const envelope=(org='org-a')=>{const bytes=Buffer.from('encrypted backup fixture');return {organizationId:org,deviceId:'device-1',ciphertext:bytes.toString('base64'),sha256:createHash('sha256').update(bytes).digest('hex')}};
test('valid encrypted envelope accepted',()=>assert.equal(validateEncryptedBackupEnvelope(envelope()).organizationId,'org-a'));
test('tampered ciphertext rejected',()=>{let e=envelope();e.ciphertext=Buffer.from('tampered').toString('base64');assert.throws(()=>validateEncryptedBackupEnvelope(e),/integrity/i)});
test('extra field rejected',()=>assert.throws(()=>validateEncryptedBackupEnvelope({...envelope(),plaintext:'secret'})));
test('invalid and empty ciphertext rejected',()=>{assert.throws(()=>validateEncryptedBackupEnvelope({...envelope(),ciphertext:''}));assert.throws(()=>validateEncryptedBackupEnvelope({...envelope(),ciphertext:'AA==='}))});
test('vault rejects unsafe root directory',async()=>{const dir=await mkdtemp(join(tmpdir(),'vault-'));try{await chmod(dir,0o755);await assert.rejects(createEncryptedBackupVault(dir).store(envelope()),/Unsafe vault/)}finally{await rm(dir,{recursive:true,force:true})}});
test('vault writes immutable named ciphertext and reads within organization',async()=>{const dir=await mkdtemp(join(tmpdir(),'vault-'));try{await chmod(dir,0o700);const vault=createEncryptedBackupVault(dir);const stored=await vault.store(envelope());const read=await vault.read('org-a',stored.backupId);assert.equal(read.ciphertext,envelope().ciphertext);await assert.rejects(vault.read('org-b',stored.backupId),/scope mismatch/)}finally{await rm(dir,{recursive:true,force:true})}});
test('backup identifier traversal rejected',async()=>{const dir=await mkdtemp(join(tmpdir(),'vault-'));try{await chmod(dir,0o700);await assert.rejects(createEncryptedBackupVault(dir).read('org-a','../../etc/passwd'),/scope/)}finally{await rm(dir,{recursive:true,force:true})}});

test('vault refuses symlink root even when its destination is private',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'vault-link-'));
  try {
    const linked=join(dir,'linked');
    await symlink(dir,linked,'dir');
    await assert.rejects(createEncryptedBackupVault(linked).store(envelope()),/Unsafe vault directory/);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
test('vault rejects records altered to include unrecognized fields or invalid creation dates',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'vault-record-'));
  try {
    const vault=createEncryptedBackupVault(dir);
    const stored=await vault.store(envelope());
    const path=join(dir,stored.backupId+'.backup');
    const original=JSON.parse(await readFile(path,'utf8'));
    await writeFile(path,JSON.stringify({...original,unexpected:'unsafe'}));
    await assert.rejects(vault.read('org-a',stored.backupId),/scope mismatch/);
    await writeFile(path,JSON.stringify({...original,createdAt:'not-a-date'}));
    await assert.rejects(vault.read('org-a',stored.backupId),/scope mismatch/);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
