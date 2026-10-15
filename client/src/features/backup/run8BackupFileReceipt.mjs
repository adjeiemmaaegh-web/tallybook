/** V19 Run 8 backup-file re-selection receipt.
 * Proves only that the user supplied byte-identical encrypted text in this
 * browser session; NOT independent off-device retention or disaster recovery.
 * The SHA-256 fingerprint is not a password verifier, encryption or signature.
 */
import {assertEncryptedBackupSize} from './backupResourceLimits.mjs';
import {RUN8_ENCRYPTED_V2,classifyRun8BackupEnvelope}
 from './run8EncryptedEnvelope.mjs';
const encoder=new TextEncoder();
const fail=message=>{throw Error(message);};
async function digest(text,subtle){
 if(!subtle||typeof subtle.digest!=='function')
  fail('Backup file verification requires browser SHA-256 support.');
 const hash=await subtle.digest('SHA-256',encoder.encode(text));
 if(!(hash instanceof ArrayBuffer)||hash.byteLength!==32)
  fail('Backup file fingerprint could not be verified.');
 return Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');
}
function validateIdentity(companyId,createdAt){
 if(typeof companyId!=='string'||!companyId.trim()||companyId.length>200||
    typeof createdAt!=='string'||!Number.isFinite(Date.parse(createdAt)))
  fail('Invalid exported backup identity or date.');
}
export async function createRun8FileReceipt(text,companyId,createdAt,
 subtle=globalThis.crypto?.subtle){
 validateIdentity(companyId,createdAt);
 assertEncryptedBackupSize(text);
 if(classifyRun8BackupEnvelope(text)!==RUN8_ENCRYPTED_V2)
  fail('Only new encrypted backup files can be confirmed by this receipt.');
 return Object.freeze({
  companyId,createdAt,format:RUN8_ENCRYPTED_V2,
  sha256:await digest(text,subtle)
 });
}
export async function verifyRun8FileReceipt(receipt,selectedText,companyId,
 subtle=globalThis.crypto?.subtle){
 if(!receipt||typeof receipt!=='object'||receipt.format!==RUN8_ENCRYPTED_V2||
    typeof receipt.sha256!=='string'||!/^[0-9a-f]{64}$/.test(receipt.sha256)||
    receipt.companyId!==companyId)
  fail('This file receipt belongs to a different export or company.');
 validateIdentity(receipt.companyId,receipt.createdAt);
 assertEncryptedBackupSize(selectedText);
 if(classifyRun8BackupEnvelope(selectedText)!==RUN8_ENCRYPTED_V2)
  fail('Select the encrypted file originally exported by this device.');
 if(await digest(selectedText,subtle)!==receipt.sha256)
  fail('The selected file does not match the exported backup. No backup is marked verified.');
 return Object.freeze({
  companyId:receipt.companyId,createdAt:receipt.createdAt,sha256:receipt.sha256
 });
}
