/** Run 8 portable encrypted backup format policy.
 * v1 is READ-ONLY legacy compatibility. New exports use authenticated v2
 * metadata, fixed PBKDF2 work and AES-256-GCM. No plaintext fallback on an
 * unknown/malformed encrypted kind and no unbounded attacker KDF parameters.
 */
export const RUN8_ENCRYPTED_V1='tallybook-encrypted-v1';
export const RUN8_ENCRYPTED_V2='tallybook-encrypted-v2';
export const RUN8_KDF_ITERATIONS=310000;
export const RUN8_AAD='tallybook-encrypted-v2|2|PBKDF2-SHA256|310000|AES-256-GCM';
const isRecord=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const reject=reason=>{throw Error(reason);};
function hasExactKeys(value,keys){
 const actual=Reflect.ownKeys(value);
 return actual.length===keys.length&&actual.every(k=>keys.includes(k));
}
export function classifyRun8BackupEnvelope(text){
 if(typeof text!=='string')reject('Backup file must contain text.');
 let result;
 try{result=JSON.parse(text);}
 catch{reject('Backup JSON is invalid; no records were changed.');}
 if(!isRecord(result))reject('Backup file does not contain a supported record object.');
 if(result.kind===RUN8_ENCRYPTED_V1||result.kind===RUN8_ENCRYPTED_V2)
  return result.kind;
 if(typeof result.kind==='string'&&result.kind.startsWith('tallybook-encrypted'))
  reject('This encrypted backup format requires a newer version of Tallybook.');
 return 'plaintext';
}
export function assertRun8EncryptedEnvelope(envelope,maxCipherChars,maxJsonBytes){
 if(!isRecord(envelope))reject('Not a supported encrypted backup.');
 const legacy=envelope.kind===RUN8_ENCRYPTED_V1;
 const modern=envelope.kind===RUN8_ENCRYPTED_V2;
 if(!legacy&&!modern)reject('Not a supported encrypted backup.');
 const keys=legacy?['kind','salt','iv','data']:
  ['kind','version','kdf','iterations','cipher','salt','iv','data'];
 if(!hasExactKeys(envelope,keys))
  reject('Encrypted backup has missing or unexpected metadata.');
 if(modern&&(envelope.version!==2||envelope.kdf!=='PBKDF2-SHA256'||
    envelope.iterations!==RUN8_KDF_ITERATIONS||
    envelope.cipher!=='AES-256-GCM'))
   reject('Encrypted backup has unsupported authenticated parameters.');
 if(typeof envelope.salt!=='string'||!/^[A-Za-z0-9+/]{22}==$/.test(envelope.salt)||
    typeof envelope.iv!=='string'||!/^[A-Za-z0-9+/]{16}$/.test(envelope.iv))
   reject('Invalid encrypted backup salt or IV encoding.');
 const data=envelope.data;
 if(typeof data!=='string'||!Number.isSafeInteger(maxCipherChars)||
    !Number.isSafeInteger(maxJsonBytes)||maxCipherChars<24||maxJsonBytes<0||
    data.length<24||data.length>maxCipherChars||data.length%4!==0)
   reject('Invalid encrypted backup ciphertext encoding or length.');
 const last=data.length-1;
 for(let i=0;i<data.length;i++){
  const code=data.charCodeAt(i);
  const char=(code>=65&&code<=90)||(code>=97&&code<=122)||
    (code>=48&&code<=57)||code===43||code===47;
  if(!char&&!(code===61&&i>=last-1))
   reject('Invalid encrypted backup ciphertext encoding.');
 }
 if(data[last-2]==='='||(data[last-1]==='='&&data[last]!=='='))
   reject('Invalid encrypted backup ciphertext encoding.');
 const padding=Number(data[last]==='=')+Number(data[last-1]==='=');
 const decoded=data.length/4*3-padding;
 if(decoded<16||decoded>maxJsonBytes+16)
   reject('Encrypted backup ciphertext exceeds the local backup limit or lacks an authentication tag.');
 return modern?'v2':'v1';
}
