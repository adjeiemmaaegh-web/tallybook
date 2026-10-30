/** Device-local, non-exportable signing keys. This database is intentionally
 * outside portable business backups; a new installation needs owner approval.
 */
export type DeviceKeyScope={supabaseOrigin:string;userId:string;cloudCompanyId:string;
  localCompanyId:string;staffId:string;shopId:string;deviceId:string};
export type StoredDeviceKey={scopeId:string;scope:DeviceKeyScope;privateKey:CryptoKey;
  publicKeySpkiPem:string;status:'pending'|'active';createdAt:string};

const DB_NAME='tallybook-device-keys-v1';
const ID=/^[A-Za-z0-9:_-]{1,128}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function requireScope(scope:DeviceKeyScope):string {
  if(!UUID.test(scope?.userId??'')||!UUID.test(scope?.cloudCompanyId??'')||
     ![scope.localCompanyId,scope.staffId,scope.shopId,scope.deviceId].every(id=>ID.test(id)))
    throw Error('Invalid device-key identity scope.');
  let url:URL;
  try{url=new URL(scope.supabaseOrigin);}catch{throw Error('Invalid Supabase origin.');}
  if(url.protocol!=='https:'||url.origin!==url.href.replace(/\/$/,'')||
     url.username||url.password||url.search||url.hash)
    throw Error('Device key requires a canonical HTTPS Supabase origin.');
  return [url.origin,scope.userId,scope.cloudCompanyId,scope.localCompanyId,
    scope.staffId,scope.shopId,scope.deviceId].join('|');
}
function validPrivateKey(key:CryptoKey):boolean {
  return key?.type==='private'&&key.extractable===false&&
    key.algorithm?.name==='Ed25519'&&key.usages.includes('sign');
}
function base64(bytes:Uint8Array):string {
  let binary='';for(let i=0;i<bytes.length;i+=8192)
    binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(binary);
}
function base64url(bytes:Uint8Array):string {
  return base64(bytes).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function pem(spki:ArrayBuffer):string {
  const encoded=base64(new Uint8Array(spki));
  return `-----BEGIN PUBLIC KEY-----\n${encoded.match(/.{1,64}/g)?.join('\n')}\n-----END PUBLIC KEY-----\n`;
}
async function openVault():Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>{
      if(!request.result.objectStoreNames.contains('keys'))
        request.result.createObjectStore('keys',{keyPath:'scopeId'});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error??Error('Device key vault unavailable.'));
  });
}
async function read(scopeId:string):Promise<StoredDeviceKey|undefined> {
  const db=await openVault();
  return new Promise((resolve,reject)=>{
    let value:StoredDeviceKey|undefined;
    const tx=db.transaction('keys','readonly');
    const request=tx.objectStore('keys').get(scopeId);
    request.onsuccess=()=>{value=request.result as StoredDeviceKey|undefined;};
    tx.oncomplete=()=>{db.close();resolve(value);};
    tx.onerror=()=>{db.close();reject(tx.error??Error('Device key read failed.'));};
    tx.onabort=()=>{db.close();reject(tx.error??Error('Device key read aborted.'));};
  });
}
async function write(record:StoredDeviceKey,onlyNew=false):Promise<void> {
  const db=await openVault();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('keys','readwrite');
    if(onlyNew)tx.objectStore('keys').add(record);
    else tx.objectStore('keys').put(record);
    tx.oncomplete=()=>{db.close();resolve();};
    tx.onerror=()=>{db.close();reject(tx.error??Error('Device key write failed.'));};
    tx.onabort=()=>{db.close();reject(tx.error??Error('Device key write aborted.'));};
  });
}
async function remove(scopeId:string):Promise<void> {
  const db=await openVault();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('keys','readwrite');
    tx.objectStore('keys').delete(scopeId);
    tx.oncomplete=()=>{db.close();resolve();};
    tx.onerror=()=>{db.close();reject(tx.error??Error('Device key deletion failed.'));};
    tx.onabort=()=>{db.close();reject(tx.error??Error('Device key deletion aborted.'));};
  });
}
function sameScope(a:DeviceKeyScope,b:DeviceKeyScope):boolean {
  return Object.keys(a).length===7&&Object.keys(b).length===7&&
    (Object.keys(a) as (keyof DeviceKeyScope)[]).every(key=>a[key]===b[key]);
}
async function requirePrincipal(scope:DeviceKeyScope,resolveUserId:()=>Promise<string>,
  currentLocalScope:()=>{companyId:string|null;staffId:string|null}):Promise<void> {
  const userId=await resolveUserId();
  const local=currentLocalScope();
  if(userId!==scope.userId||local.companyId!==scope.localCompanyId||
     local.staffId!==scope.staffId)throw Error('Device key scope changed.');
}

/** Generate once. A failed/lost server ACK keeps the key pending; an owner can
 * revoke and issue a fresh invitation. No private material enters backups.
 */
export async function createPendingDeviceKey(scope:DeviceKeyScope,
  resolveUserId:()=>Promise<string>,currentLocalScope:()=>{companyId:string|null;staffId:string|null},
  subtle:SubtleCrypto=globalThis.crypto.subtle):Promise<{deviceId:string;publicKeySpkiPem:string}> {
  const scopeId=requireScope(scope);
  await requirePrincipal(scope,resolveUserId,currentLocalScope);
  if(await read(scopeId))throw Error('Device key already exists; rotate through owner approval.');
  const pair=await subtle.generateKey('Ed25519',false,['sign','verify']);
  if(!('privateKey' in pair)||!validPrivateKey(pair.privateKey))
    throw Error('Non-extractable Ed25519 keys are unavailable.');
  const publicKeySpkiPem=pem(await subtle.exportKey('spki',pair.publicKey));
  const record:StoredDeviceKey={scopeId,scope,privateKey:pair.privateKey,
    publicKeySpkiPem,status:'pending',createdAt:new Date().toISOString()};
  await requirePrincipal(scope,resolveUserId,currentLocalScope);
  await write(record,true);
  return {deviceId:scope.deviceId,publicKeySpkiPem};
}

/** Server challenge proof. The one-use invitation token is never stored. */
export async function signDeviceEnrollmentProof(scope:DeviceKeyScope,token:string,
  resolveUserId:()=>Promise<string>,currentLocalScope:()=>{companyId:string|null;staffId:string|null},
  subtle:SubtleCrypto=globalThis.crypto.subtle):Promise<{publicKeySpkiPem:string;proofSignature:string}> {
  const scopeId=requireScope(scope);
  if(!/^[0-9a-f]{64}$/.test(token))throw Error('Invalid device invitation.');
  await requirePrincipal(scope,resolveUserId,currentLocalScope);
  const record=await read(scopeId);
  if(!record||record.status!=='pending'||!sameScope(record.scope,scope)||
     !validPrivateKey(record.privateKey))throw Error('Pending device key unavailable.');
  const tokenHash=Array.from(new Uint8Array(await subtle.digest('SHA-256',
    new TextEncoder().encode(token) as BufferSource)),b=>b.toString(16).padStart(2,'0')).join('');
  const pemHash=Array.from(new Uint8Array(await subtle.digest('SHA-256',
    new TextEncoder().encode(record.publicKeySpkiPem) as BufferSource)),b=>b.toString(16).padStart(2,'0')).join('');
  const bytes=new TextEncoder().encode(['tallybook.device.enroll.v1',tokenHash,
    scope.cloudCompanyId,scope.shopId,scope.userId,scope.staffId,scope.deviceId,pemHash].join('\n'));
  await requirePrincipal(scope,resolveUserId,currentLocalScope);
  const signature=new Uint8Array(await subtle.sign('Ed25519',record.privateKey,bytes as BufferSource));
  if(signature.length!==64)throw Error('Invalid device enrollment proof.');
  return {publicKeySpkiPem:record.publicKeySpkiPem,proofSignature:base64url(signature)};
}

export async function activateDeviceKey(scope:DeviceKeyScope,
  receipt:{companyId:string;storeId:string;userId:string;staffId:string;deviceId:string;
    publicKeyBound:true;hardwareBound:false},resolveUserId:()=>Promise<string>,
  currentLocalScope:()=>{companyId:string|null;staffId:string|null}):Promise<void> {
  const scopeId=requireScope(scope);
  await requirePrincipal(scope,resolveUserId,currentLocalScope);
  if(receipt?.companyId!==scope.cloudCompanyId||receipt.storeId!==scope.shopId||
     receipt.userId!==scope.userId||receipt.staffId!==scope.staffId||
     receipt.deviceId!==scope.deviceId||receipt.publicKeyBound!==true||
     receipt.hardwareBound!==false)throw Error('Device enrollment receipt does not match.');
  const record=await read(scopeId);
  if(!record||record.status!=='pending'||!sameScope(record.scope,scope)||
     !validPrivateKey(record.privateKey))throw Error('Pending device key unavailable.');
  await requirePrincipal(scope,resolveUserId,currentLocalScope);
  await write({...record,status:'active'});
}

export async function loadActiveDeviceKey(scope:DeviceKeyScope,
  resolveUserId:()=>Promise<string>,currentLocalScope:()=>{companyId:string|null;staffId:string|null}):Promise<CryptoKey> {
  const scopeId=requireScope(scope);
  await requirePrincipal(scope,resolveUserId,currentLocalScope);
  const record=await read(scopeId);
  if(!record||record.status!=='active'||!sameScope(record.scope,scope)||
     !validPrivateKey(record.privateKey))throw Error('Active device key unavailable.');
  await requirePrincipal(scope,resolveUserId,currentLocalScope);
  return record.privateKey;
}

/** Public status only, after the same identity checks used to load a key. */
export async function inspectDeviceKeyState(scope:DeviceKeyScope,
  resolveUserId:()=>Promise<string>,currentLocalScope:()=>{companyId:string|null;staffId:string|null}):Promise<'pending'|'active'> {
  const scopeId=requireScope(scope);
  await requirePrincipal(scope,resolveUserId,currentLocalScope);
  const record=await read(scopeId);
  if(!record||!sameScope(record.scope,scope)||!validPrivateKey(record.privateKey)||
     !['pending','active'].includes(record.status))throw Error('Device key unavailable.');
  await requirePrincipal(scope,resolveUserId,currentLocalScope);
  return record.status;
}

export async function forgetDeviceKey(scope:DeviceKeyScope,
  resolveUserId:()=>Promise<string>,currentLocalScope:()=>{companyId:string|null;staffId:string|null}):Promise<void> {
  const scopeId=requireScope(scope);
  await requirePrincipal(scope,resolveUserId,currentLocalScope);
  await remove(scopeId);
}
