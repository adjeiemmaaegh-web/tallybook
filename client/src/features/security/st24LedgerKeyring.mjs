/** ST24-05: isolated, versioned ledger keyring. No Dexie read/write or migration. */
const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', {fatal: true});
const KDF_ITERATIONS = 310000;
const MAX_RECORD_BYTES = 1024 * 1024;
const KEYRING_KIND = 'tallybook-ledger-keyring';
const RECORD_KIND = 'tallybook-ledger-record';
const handles = new WeakMap();

function fail(message = 'Invalid encrypted ledger data.') { throw new Error(message); }
function webcrypto() {
  if (!globalThis.crypto?.subtle || typeof globalThis.crypto.getRandomValues !== 'function')
    fail('Secure WebCrypto is unavailable. Ledger stays locked.');
  return globalThis.crypto;
}
function scopeOf(workspaceId, companyId) {
  for (const value of [workspaceId, companyId])
    if (typeof value !== 'string' || value.length < 1 || value.length > 128 ||
        !/^[A-Za-z0-9._:/-]+$/.test(value)) fail('Invalid ledger identity.');
  return [workspaceId, companyId];
}
function random(length) { const b = new Uint8Array(length); webcrypto().getRandomValues(b); return b; }
function b64(bytes) {
  // Chunking avoids expanding the call stack for bounded record ciphertexts.
  let out = '';
  for (let i = 0; i < bytes.length; i += 16384)
    out += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(out).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function un64(text, length = null, max = MAX_RECORD_BYTES + 32) {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]+$/.test(text) || text.length > Math.ceil(max * 4 / 3) + 4)
    fail();
  let raw;
  try { raw = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - text.length % 4) % 4)); }
  catch { fail(); }
  const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
  if (bytes.length > max || (length !== null && bytes.length !== length) || b64(bytes) !== text) fail();
  return bytes;
}
function aad(domain, scope, partA = '', partB = '') { return enc.encode(JSON.stringify(['tallybook-st24-v1', domain, ...scope, partA, partB])); }
function passphrase(value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 1024)
    fail('Use a passphrase of 12 to 1024 characters.');
  return value;
}
async function passKey(secret, salt) {
  const key = await webcrypto().subtle.importKey('raw', enc.encode(passphrase(secret)), 'PBKDF2', false, ['deriveKey']);
  return webcrypto().subtle.deriveKey({name:'PBKDF2',salt,iterations:KDF_ITERATIONS,hash:'SHA-256'},
    key, {name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function recoveryKey(code, salt) {
  const bytes = un64(code, 32, 32);
  try {
    const key = await webcrypto().subtle.importKey('raw', bytes, 'HKDF', false, ['deriveKey']);
    return webcrypto().subtle.deriveKey({name:'HKDF',salt,info:enc.encode('tallybook-st24-recovery-v1'),hash:'SHA-256'},
      key,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  } finally { bytes.fill(0); }
}
async function wrap(key, raw, scope, purpose) {
  const iv = random(12);
  const bytes = new Uint8Array(await webcrypto().subtle.encrypt({name:'AES-GCM',iv,additionalData:aad('key-wrap',scope,purpose)},key,raw));
  return {iv:b64(iv),ciphertext:b64(bytes)};
}
function parseKeyring(meta) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta) || meta.kind !== KEYRING_KIND || meta.version !== 1 ||
      meta.iterations !== KDF_ITERATIONS || !meta.passphrase || !meta.recovery) fail();
  const scope = scopeOf(meta.workspaceId, meta.companyId);
  for (const part of [meta.passphrase,meta.recovery]) {
    if (!part || typeof part !== 'object' || Array.isArray(part)) fail();
    un64(part.salt,16,16); un64(part.iv,12,12); un64(part.ciphertext,48,48);
  }
  return scope;
}
async function makeHandle(raw, scope) {
  const key = await webcrypto().subtle.importKey('raw',raw,{name:'AES-GCM'},false,['encrypt','decrypt']);
  const handle=Object.freeze({kind:'unlocked-tallybook-ledger'});
  handles.set(handle,{key,scope});
  return handle;
}
function handleInfo(handle) {
  const info=handles.get(handle);
  if(!info) fail('Ledger is locked.');
  return info;
}
export async function createLedgerKeyring({workspaceId,companyId,ownerPassphrase}) {
  const scope=scopeOf(workspaceId,companyId);
  const secret=random(32);
  const recoveryCode=b64(random(32));
  try {
    const psalt=random(16),rsalt=random(16);
    const [passwordWrap,recoveryWrap]=await Promise.all([
      (async()=>({salt:b64(psalt),...await wrap(await passKey(ownerPassphrase,psalt),secret,scope,'password')}))(),
      (async()=>({salt:b64(rsalt),...await wrap(await recoveryKey(recoveryCode,rsalt),secret,scope,'recovery')}))()
    ]);
    const keyring={kind:KEYRING_KIND,version:1,workspaceId,companyId,iterations:KDF_ITERATIONS,
      passphrase:passwordWrap,recovery:recoveryWrap};
    parseKeyring(keyring);
    return {keyring,recoveryCode,handle:await makeHandle(secret,scope)};
  } finally { secret.fill(0); }
}
async function unlock(meta, credential, purpose) {
  const scope=parseKeyring(meta),part=meta[purpose];
  const salt=un64(part.salt,16,16),iv=un64(part.iv,12,12),data=un64(part.ciphertext,48,48);
  try {
    const key=purpose==='passphrase'?await passKey(credential,salt):await recoveryKey(credential,salt);
    const raw=new Uint8Array(await webcrypto().subtle.decrypt({name:'AES-GCM',iv,additionalData:aad('key-wrap',scope,purpose==='passphrase'?'password':'recovery')},key,data));
    try { if(raw.length!==32)fail(); return await makeHandle(raw,scope); } finally { raw.fill(0); }
  } catch { fail('Incorrect credential or corrupted keyring. No data was changed.'); }
}
export const unlockLedgerWithPassphrase=(keyring,credential)=>unlock(keyring,credential,'passphrase');
export const unlockLedgerWithRecoveryCode=(keyring,code)=>unlock(keyring,code,'recovery');

/** Encrypted storage must not silently drop JS/IndexedDB values during JSON conversion.
 * Real Dexie migration needs explicit per-table serializers for non-JSON fields. */
function assertLosslessJson(value, seen=new WeakSet(),depth=0) {
  if(depth>64)fail('Unsupported ledger record depth.');
  if(value===null||typeof value==='string'||typeof value==='boolean')return;
  if(typeof value==='number') {if(!Number.isFinite(value))fail('Unsupported JSON number.');return;}
  if(typeof value!=='object')fail('Non-JSON value in ledger record.');
  if(seen.has(value))fail('Cyclic ledger record.');
  const proto=Object.getPrototypeOf(value);
  if(!Array.isArray(value)&&proto!==Object.prototype&&proto!==null)fail('Non-JSON object in ledger record.');
  seen.add(value);
  if(Array.isArray(value)) {
    for(let i=0;i<value.length;i++) {
      if(!Object.hasOwn(value,i))fail('Sparse ledger record array.');
      assertLosslessJson(value[i],seen,depth+1);
    }
    if(Reflect.ownKeys(value).length!==value.length+1)fail('Unsupported ledger array property.');
  } else {
    for(const key of Reflect.ownKeys(value)) {
      if(typeof key!=='string'||['__proto__','constructor','prototype'].includes(key))fail('Unsafe ledger record key.');
      const descriptor=Object.getOwnPropertyDescriptor(value,key);
      if(!descriptor||!('value' in descriptor)||!descriptor.enumerable)fail('Unsupported ledger property.');
      assertLosslessJson(descriptor.value,seen,depth+1);
    }
  }
  seen.delete(value);
}

function recordIdentity(table,primaryKey) {
  if(typeof table!=='string'||!/^[A-Za-z][A-Za-z0-9]{0,79}$/.test(table) ||
     typeof primaryKey!=='string'||primaryKey.length<1||primaryKey.length>256||/[\u0000-\u001f]/.test(primaryKey)) fail('Invalid ledger record identity.');
}
export async function sealLedgerRecord(handle,table,primaryKey,record) {
  const {key,scope}=handleInfo(handle);recordIdentity(table,primaryKey);
  if(!record||typeof record!=='object'||Array.isArray(record))fail('Ledger record must be a plain JSON object.');
  assertLosslessJson(record);
  const json=JSON.stringify(record);
  if(typeof json!=='string')fail('Record must be JSON-serializable.');
  const plain=enc.encode(json);
  if(!plain.length||plain.length>MAX_RECORD_BYTES)fail('Ledger record exceeds size limit.');
  const iv=random(12);
  const ciphertext=new Uint8Array(await webcrypto().subtle.encrypt({name:'AES-GCM',iv,additionalData:aad('record',scope,table,primaryKey)},key,plain));
  return {kind:RECORD_KIND,version:1,workspaceId:scope[0],companyId:scope[1],table,primaryKey,iv:b64(iv),ciphertext:b64(ciphertext)};
}
export async function openLedgerRecord(handle,table,primaryKey,envelope) {
  const {key,scope}=handleInfo(handle);recordIdentity(table,primaryKey);
  if(!envelope||typeof envelope!=='object'||envelope.kind!==RECORD_KIND||envelope.version!==1||
     envelope.workspaceId!==scope[0]||envelope.companyId!==scope[1]||envelope.table!==table||envelope.primaryKey!==primaryKey)fail();
  const iv=un64(envelope.iv,12,12),data=un64(envelope.ciphertext,null,MAX_RECORD_BYTES+16);
  if(data.length<17)fail();
  try {
    const plain=await webcrypto().subtle.decrypt({name:'AES-GCM',iv,additionalData:aad('record',scope,table,primaryKey)},key,data);
    return JSON.parse(dec.decode(plain));
  } catch { fail('Ledger record could not be authenticated. No data was changed.'); }
}

/** Re-wraps the DEK without touching sealed records. A recovery reset never needs
 * the lost passphrase; a compromised recovery code must be replaced separately. */
async function rewrapPassphrase(keyring,credential,purpose,newPassphrase) {
  const scope=parseKeyring(keyring);
  passphrase(newPassphrase);
  const old=keyring[purpose];
  const raw=new Uint8Array(await webcrypto().subtle.decrypt({
    name:'AES-GCM',iv:un64(old.iv,12,12),additionalData:aad('key-wrap',scope,purpose==='passphrase'?'password':'recovery')},
    purpose==='passphrase'?await passKey(credential,un64(old.salt,16,16)):await recoveryKey(credential,un64(old.salt,16,16)),
    un64(old.ciphertext,48,48)).catch(()=>fail('Incorrect credential or corrupted keyring. No data was changed.')));
  try {
    if(raw.length!==32)fail();
    const salt=random(16);
    const next={...keyring,passphrase:{salt:b64(salt),...await wrap(await passKey(newPassphrase,salt),raw,scope,'password')}};
    parseKeyring(next);
    return next;
  } finally { raw.fill(0); }
}
export const changeLedgerPassphrase=(keyring,currentPassphrase,newPassphrase)=>
  rewrapPassphrase(keyring,currentPassphrase,'passphrase',newPassphrase);
export const resetLedgerPassphraseWithRecovery=(keyring,recoveryCode,newPassphrase)=>
  rewrapPassphrase(keyring,recoveryCode,'recovery',newPassphrase);

/** Compromised recovery credential can be rotated after an owner proves the
 * current passphrase; old codes no longer unlock the returned keyring. */
export async function replaceLedgerRecoveryCode(keyring,currentPassphrase) {
  const scope=parseKeyring(keyring);
  const old=keyring.passphrase;
  const raw=new Uint8Array(await webcrypto().subtle.decrypt({name:'AES-GCM',iv:un64(old.iv,12,12),additionalData:aad('key-wrap',scope,'password')},
    await passKey(currentPassphrase,un64(old.salt,16,16)),un64(old.ciphertext,48,48))
    .catch(()=>fail('Incorrect credential or corrupted keyring. No data was changed.')));
  try {
    if(raw.length!==32)fail();
    const recoveryCode=b64(random(32)),salt=random(16);
    const next={...keyring,recovery:{salt:b64(salt),...await wrap(await recoveryKey(recoveryCode,salt),raw,scope,'recovery')}};
    parseKeyring(next);
    return {keyring:next,recoveryCode};
  } finally {raw.fill(0);}
}
