import { MAX_BACKUP_JSON_BYTES, MAX_ENCRYPTED_BACKUP_BYTES,
 MAX_ENCRYPTED_BACKUP_DATA_CHARS, assertPlainBackupSize,
 assertEncryptedBackupSize } from "./backupResourceLimits.mjs";
import {RUN8_ENCRYPTED_V1,RUN8_ENCRYPTED_V2,
 RUN8_KDF_ITERATIONS,RUN8_AAD,classifyRun8BackupEnvelope,
 assertRun8EncryptedEnvelope} from "./run8EncryptedEnvelope.mjs";

/** New exports are AES-256-GCM encrypted with authenticated v2 header.
 * Legacy encrypted-v1 remains readable. No custom encryption primitives.
 * Passwords remain device-local and are never persisted in IndexedDB.
 */
const encoder=new TextEncoder();
const decoder=new TextDecoder("utf-8",{fatal:true});
function base64(bytes:Uint8Array):string{
 let result="";
 for(const byte of bytes)result+=String.fromCharCode(byte);
 return btoa(result);
}
function unbase64(value:string):Uint8Array{
 return Uint8Array.from(atob(value),c=>c.charCodeAt(0));
}
async function deriveKey(passphrase:string,salt:Uint8Array){
 const raw=await crypto.subtle.importKey(
  "raw",encoder.encode(passphrase),"PBKDF2",false,["deriveKey"]);
 return crypto.subtle.deriveKey(
  {name:"PBKDF2",salt:salt as BufferSource,
   iterations:RUN8_KDF_ITERATIONS,hash:"SHA-256"},
  raw,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
export function isEncryptedBackup(text:string):boolean{
 if(typeof text!=="string"||text.length>MAX_ENCRYPTED_BACKUP_BYTES)return false;
 try{
  assertEncryptedBackupSize(text);
  const kind=classifyRun8BackupEnvelope(text);
  return kind===RUN8_ENCRYPTED_V1||kind===RUN8_ENCRYPTED_V2;
 }catch{return false;}
}
export async function encryptBackupText(text:string,passphrase:string):Promise<string>{
 assertPlainBackupSize(text);
 if(typeof passphrase!=="string"||passphrase.length<12)
  throw Error("Use a backup passphrase of at least 12 characters.");
 const salt=crypto.getRandomValues(new Uint8Array(16));
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const key=await deriveKey(passphrase,salt);
 const encrypted=await crypto.subtle.encrypt(
  {name:"AES-GCM",iv,
   additionalData:encoder.encode(RUN8_AAD)},
  key,encoder.encode(text));
 const envelope={
  kind:RUN8_ENCRYPTED_V2,version:2,kdf:"PBKDF2-SHA256",
  iterations:RUN8_KDF_ITERATIONS,cipher:"AES-256-GCM",
  salt:base64(salt),iv:base64(iv),
  data:base64(new Uint8Array(encrypted))
 };
 return assertEncryptedBackupSize(JSON.stringify(envelope));
}
export async function decryptBackupText(text:string,passphrase:string):Promise<string>{
 assertEncryptedBackupSize(text); // Bound allocation before parsing or crypto.
 if(typeof passphrase!=="string"||passphrase.length===0)
  throw Error("Enter a backup passphrase.");
 let value:unknown;
 try{value=JSON.parse(text);}catch{throw Error("Invalid encrypted backup JSON.");}
 const format=assertRun8EncryptedEnvelope(
  value,MAX_ENCRYPTED_BACKUP_DATA_CHARS,MAX_BACKUP_JSON_BYTES);
 const envelope=value as {salt:string;iv:string;data:string};
 let plain:ArrayBuffer;
 try{
  const salt=unbase64(envelope.salt),iv=unbase64(envelope.iv);
  // Reject alternate base64 spellings before deriving an expensive key.
  const encoded=unbase64(envelope.data);
  if(base64(salt)!==envelope.salt||
     base64(iv)!==envelope.iv||
     base64(encoded)!==envelope.data)
    throw Error("Noncanonical encryption parameters.");
  const key=await deriveKey(passphrase,salt);
  const cipherOptions: AesGcmParams={name:"AES-GCM",iv};
  if(format==="v2")cipherOptions.additionalData=encoder.encode(RUN8_AAD);
  plain=await crypto.subtle.decrypt(cipherOptions,key,encoded);
 }catch{
  throw Error("Could not decrypt backup. Check the passphrase and file integrity.");
 }
 if(plain.byteLength>MAX_BACKUP_JSON_BYTES)
  throw Error("Decrypted backup exceeds the 64 MiB JSON safety limit.");
 try{return decoder.decode(plain);}
 catch{throw Error("Decrypted backup contains invalid UTF-8. No records were imported.");}
}
