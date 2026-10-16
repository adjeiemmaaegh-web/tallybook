/** Run 14 — browser-side authenticated encryption of immutable source evidence.
 * Remote replicas are copies for owner review, never self-executing inventory,
 * tender, customer credit, tax, staff authorization or refund instructions.
 */
export interface Run14Envelope {
  version:1; organizationId:string; deviceId:string; eventId:string;
  operationId:string; sequence:number; previousDigest:string;createdAt:string;
  ciphertext:string;nonce:string;salt:string;ciphertextSha256:string;
}
export interface Run14ReplicaRecord {
  recordKind:string; recordId:string; content:unknown;
  companyId:string; createdAt:string;
  automaticFinancialPosting:false;
}
const ID=/^[A-Za-z0-9:_-]{1,128}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const ZERO="0".repeat(64);
const utf8=new TextEncoder();
const decode=new TextDecoder("utf-8",{fatal:true});
const deny=(message:string):never=>{throw new Error(message);};
const date=(s:unknown)=>typeof s==="string"&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString()===s;
const valid=(x:unknown)=>typeof x==="string"&&ID.test(x);
const b64=(bytes:Uint8Array)=>btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(""));
const bytes=(value:string):Uint8Array=>{
  if(typeof value!=="string"||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))
    deny("Malformed encrypted replica encoding.");
  let raw:string;try{raw=atob(value);}catch{return deny("Malformed encrypted replica encoding.");}
  const result=Uint8Array.from(Array.from(raw,ch=>ch.charCodeAt(0)));
  if(b64(result)!==value)deny("Noncanonical encrypted replica bytes.");
  return result;
};
const hex=(value:Uint8Array)=>Array.from(value,b=>b.toString(16).padStart(2,"0")).join("");
const buffer=(value:Uint8Array):ArrayBuffer=>{const result=new ArrayBuffer(value.byteLength);new Uint8Array(result).set(value);return result;};
const hash=async(data:Uint8Array)=>hex(new Uint8Array(await crypto.subtle.digest("SHA-256",buffer(data))));
const aad=(e:Omit<Run14Envelope,"ciphertext"|"nonce"|"salt"|"ciphertextSha256">)=>
  utf8.encode(JSON.stringify({version:e.version,organizationId:e.organizationId,
    deviceId:e.deviceId,eventId:e.eventId,operationId:e.operationId,
    sequence:e.sequence,previousDigest:e.previousDigest,createdAt:e.createdAt}));
async function secretKey(passphrase:string,salt:Uint8Array) {
  if(typeof passphrase!=="string"||passphrase.length<16||passphrase.length>1024)
    deny("Shared sync passphrase must contain 16 to 1024 characters.");
  if(!crypto?.subtle)deny("Secure browser cryptography is unavailable.");
  const base=await crypto.subtle.importKey("raw",buffer(utf8.encode(passphrase)),"PBKDF2",false,["deriveKey"]);
  return crypto.subtle.deriveKey({name:"PBKDF2",salt:buffer(salt),iterations:310000,hash:"SHA-256"},
    base,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
export function validateRun14Envelope(e:Run14Envelope):void{
  if(!e||typeof e!=="object"||Array.isArray(e)||
    Object.keys(e).sort().join(",")!=="ciphertext,ciphertextSha256,createdAt,deviceId,eventId,nonce,operationId,organizationId,previousDigest,salt,sequence,version"||
    e.version!==1||![e.organizationId,e.deviceId,e.eventId,e.operationId].every(valid)||
    !Number.isSafeInteger(e.sequence)||e.sequence<1||e.sequence>1_000_000||
    !DIGEST.test(e.previousDigest)||!DIGEST.test(e.ciphertextSha256)||!date(e.createdAt))
    deny("Invalid encrypted event metadata.");
  const nonce=bytes(e.nonce),salt=bytes(e.salt),ciphertext=bytes(e.ciphertext);
  if(nonce.length!==12||salt.length!==16||ciphertext.length<17||ciphertext.length>48*1024)
    deny("Encrypted event exceeds resource limits.");
}
export function inspectRun14ReplicaRecord(value:unknown,companyId:string):Run14ReplicaRecord{
  if(!value||typeof value!=="object"||Array.isArray(value))deny("Invalid remote replica record.");
  const x=value as Record<string,unknown>;
  if(Object.keys(x).sort().join(",")!=="automaticFinancialPosting,companyId,content,createdAt,recordId,recordKind"||
    x.companyId!==companyId||!valid(x.recordId)||typeof x.recordKind!=="string"||
    !/^[a-z][a-z0-9-]{0,63}$/.test(x.recordKind)||!date(x.createdAt)||
    x.automaticFinancialPosting!==false)
    deny("Remote evidence cannot authorize a financial mutation.");
  const encoded=JSON.stringify(x);
  if(!encoded||utf8.encode(encoded).byteLength>32*1024)
    deny("Remote replica payload is outside the allowed size.");
  // JSON.stringify normalizes the plain data; detect prototype-pollution keys
  // after JSON.parse through one recursive strict walk (no eval, no revival).
  const stack:unknown[]=[x.content];
  while(stack.length){
    const item=stack.pop();
    if(item&&typeof item==="object"){
      if(Array.isArray(item)){for(const child of item)stack.push(child);}
      else {for(const [key,child] of Object.entries(item)){
        if(["__proto__","constructor","prototype"].includes(key))deny("Unsafe replica object key.");
        stack.push(child);
      }}
    }else if(typeof item==="number"&&!Number.isFinite(item))deny("Invalid replica amount.");
  }
  return x as unknown as Run14ReplicaRecord;
}
export async function sealRun14Event(input:{
  organizationId:string;deviceId:string;eventId:string;operationId:string;
  sequence:number;previousDigest:string;createdAt:string;record:Run14ReplicaRecord;
},passphrase:string):Promise<Run14Envelope>{
  const {record,...rest}=input;
  const meta={version:1 as const,...rest};
  if(![meta.organizationId,meta.deviceId,meta.eventId,meta.operationId].every(valid)||
    !DIGEST.test(meta.previousDigest)||!date(meta.createdAt)||
    !Number.isSafeInteger(meta.sequence)||meta.sequence<1||meta.sequence>1_000_000)
    deny("Invalid event scope or ordered sequence.");
  inspectRun14ReplicaRecord(record,meta.organizationId);
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const nonce=crypto.getRandomValues(new Uint8Array(12));
  const plaintext=utf8.encode(JSON.stringify(record));
  const key=await secretKey(passphrase,salt);
  const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv:buffer(nonce),
    additionalData:buffer(aad(meta)),tagLength:128},key,buffer(plaintext)));
  const result:Run14Envelope={...meta,salt:b64(salt),nonce:b64(nonce),
    ciphertext:b64(encrypted),ciphertextSha256:await hash(encrypted)};
  validateRun14Envelope(result);
  return result;
}
export async function openRun14Event(envelope:Run14Envelope,passphrase:string):Promise<Run14ReplicaRecord> {
  validateRun14Envelope(envelope);
  const cipher=bytes(envelope.ciphertext);
  if(await hash(cipher)!==envelope.ciphertextSha256)
    deny("Encrypted event digest mismatch.");
  const key=await secretKey(passphrase,bytes(envelope.salt));
  let plaintext:ArrayBuffer;
  const {ciphertext,nonce,salt,ciphertextSha256,...meta}=envelope;
  try{plaintext=await crypto.subtle.decrypt({name:"AES-GCM",iv:buffer(bytes(nonce)),
      additionalData:buffer(aad(meta)),tagLength:128},key,buffer(cipher));}
  catch{deny("Encrypted event decryption failed; do not apply remote data.");}
  let object:unknown;
  try{object=JSON.parse(decode.decode(plaintext));}catch{deny("Invalid decrypted replica data.");}
  return inspectRun14ReplicaRecord(object,envelope.organizationId);
}
export {ZERO as RUN14_EMPTY_CHAIN_DIGEST};
