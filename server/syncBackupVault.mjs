/** Opaque encrypted backup vault. Deliberately NOT mounted on public HTTP routes.
 * Caller must enforce verified session, membership, device and consent before use.
 * This module stores only ciphertext and does not decrypt or restore client data.
 */
import { open, lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
const ID=/^[A-Za-z0-9:_-]{1,128}$/;
const HEX=/^[0-9a-f]{64}$/;
const MAX=8*1024*1024;
function validId(x){return typeof x==='string' && ID.test(x);}
export function validateEncryptedBackupEnvelope(envelope){
  if(!envelope || typeof envelope!=='object' || Array.isArray(envelope) ||
    Object.keys(envelope).sort().join(',')!=='ciphertext,deviceId,organizationId,sha256' ||
    !validId(envelope.organizationId) || !validId(envelope.deviceId) ||
    typeof envelope.ciphertext!=='string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(envelope.ciphertext) ||
    envelope.ciphertext.length>Math.ceil(MAX/3)*4+4 ||
    typeof envelope.sha256!=='string' || !HEX.test(envelope.sha256)) throw new Error('Invalid encrypted backup envelope');
  const bytes=Buffer.from(envelope.ciphertext,'base64');
  if(!bytes.length || bytes.length>MAX || bytes.toString('base64')!==envelope.ciphertext) throw new Error('Invalid ciphertext encoding');
  if(createHash('sha256').update(bytes).digest('hex')!==envelope.sha256) throw new Error('Ciphertext integrity mismatch');
  return Object.freeze({organizationId:envelope.organizationId,deviceId:envelope.deviceId,bytes});
}
export function createEncryptedBackupVault(root){
  if(typeof root!=='string' || !root.startsWith('/') || root.includes('\0')) throw new Error('Absolute vault path required');
  const directory=resolve(root);
  async function verifiedDirectory(){
    const info=await lstat(directory);
    if(!info.isDirectory() || (info.mode & 0o077)!==0) throw new Error('Unsafe vault directory');
  }
  return Object.freeze({
    async store(envelope){
      const data=validateEncryptedBackupEnvelope(envelope);
      await verifiedDirectory();
      const backupId=randomUUID();
      const filename=join(directory,backupId+'.backup');
      const fd=await open(filename,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
      try {
        const record={version:1,organizationId:data.organizationId,deviceId:data.deviceId,sha256:envelope.sha256,ciphertext:envelope.ciphertext,createdAt:new Date().toISOString()};
        await fd.writeFile(JSON.stringify(record)); await fd.sync();
      } catch(e){await fd.close(); const {unlink}=await import('node:fs/promises'); await unlink(filename); throw e;}
      await fd.close();
      return Object.freeze({backupId,sha256:envelope.sha256});
    },
    async read(organizationId,backupId){
      if(!validId(organizationId) || typeof backupId!=='string' || !/^[0-9a-f-]{36}$/.test(backupId)) throw new Error('Invalid backup scope');
      await verifiedDirectory();
      const filename=join(directory,backupId+'.backup');
      const fd=await open(filename,constants.O_RDONLY|constants.O_NOFOLLOW);
      try {
        const info=await fd.stat();
        if(!info.isFile() || info.nlink!==1 || (info.mode & 0o077)!==0 || info.size>MAX*1.5+2048) throw new Error('Unsafe backup file');
        const record=JSON.parse(await fd.readFile('utf8'));
        if(!record || typeof record!=='object' || Array.isArray(record) ||
           Object.keys(record).sort().join(',')!=='ciphertext,createdAt,deviceId,organizationId,sha256,version' ||
           record.version!==1 || record.organizationId!==organizationId || !validId(record.deviceId) ||
           typeof record.createdAt!=='string' || !Number.isFinite(Date.parse(record.createdAt)))
          throw new Error('Backup scope mismatch');
        validateEncryptedBackupEnvelope({organizationId:record.organizationId,deviceId:record.deviceId,sha256:record.sha256,ciphertext:record.ciphertext});
        return Object.freeze({backupId,organizationId,deviceId:record.deviceId,sha256:record.sha256,ciphertext:record.ciphertext,createdAt:record.createdAt});
      } finally {await fd.close();}
    }
  });
}
