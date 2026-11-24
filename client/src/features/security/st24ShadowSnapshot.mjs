/**
 * ST24-05 encrypted SHADOW snapshot engine — intentionally NOT wired to Dexie.
 * Never reads/deletes/writes "tallybook-db", never switches an active DB marker.
 * All financial source data comes from an externally verified backup file.
 * Shadows contain encrypted chunks only; the existing plaintext database is
 * untouched even when quota, browser shutdown or credential checks fail.
 */
import {sealLedgerRecord,openLedgerRecord,unlockLedgerWithPassphrase,lockLedgerHandle}
  from './st24LedgerKeyring.mjs';
import {withCrossTabDataLock} from '../backup/crossTabDataLock.mjs';

export const ST24_SHADOW_DB_NAME='tallybook-st24-shadow-v1';
const MAX_SNAPSHOT_BYTES=8*1024*1024; // bounded first-stage pilot, not universal ledger coverage
const CHUNK_BYTES=192*1024;
const SHADOW_KIND='tallybook-st24-encrypted-shadow';
const CHUNK_TABLE='St24Chunk';
const MANIFEST_TABLE='St24Manifest';
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});

function reject(message){throw Error('ST24 shadow: '+message);}
function subtle(){if(!globalThis.crypto?.subtle)reject('secure WebCrypto required');return globalThis.crypto.subtle;}
function b64(bytes){
 let output='';
 for(let i=0;i<bytes.length;i+=16384)output+=String.fromCharCode(...bytes.subarray(i,i+16384));
 return btoa(output).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function un64(text,maximum){
 if(typeof text!=='string'||text.length<1||text.length>Math.ceil(maximum*4/3)+4||
    !/^[A-Za-z0-9_-]+$/.test(text))reject('invalid chunk encoding');
 let raw;
 try{raw=atob(text.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-text.length%4)%4));}
 catch{reject('invalid chunk encoding');}
 const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
 if(bytes.length>maximum||b64(bytes)!==text)reject('invalid chunk encoding');
 return bytes;
}
async function sha256(bytes){
 const hash=new Uint8Array(await subtle().digest('SHA-256',bytes));
 return Array.from(hash,x=>x.toString(16).padStart(2,'0')).join('');
}
function validateKeyring(keyring){
 if(!keyring||typeof keyring!=='object'||keyring.kind!=='tallybook-ledger-keyring'||keyring.version!==1||
    typeof keyring.workspaceId!=='string'||typeof keyring.companyId!=='string')
  reject('invalid keyring');
 return [keyring.workspaceId,keyring.companyId];
}
function envelope(ke,table,id,value){
 return {kind:'tallybook-ledger-record',version:1,workspaceId:ke.workspaceId,
  companyId:ke.companyId,table,primaryKey:id,iv:value.iv,ciphertext:value.ciphertext};
}
function assertShadowStorage(idb){
 if(!idb||typeof idb.open!=='function')reject('IndexedDB unavailable; preserving source data');
}
function requestResult(request){
 return new Promise((resolve,rejectRequest)=>{
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>rejectRequest(request.error||Error('IndexedDB request failed'));
 });
}
function txComplete(tx){
 return new Promise((resolve,rejectTx)=>{
  tx.oncomplete=()=>resolve();
  tx.onerror=()=>rejectTx(tx.error||Error('IndexedDB transaction failed'));
  tx.onabort=()=>rejectTx(tx.error||Error('IndexedDB transaction aborted'));
 });
}
async function openShadow(idb){
 assertShadowStorage(idb);
 const request=idb.open(ST24_SHADOW_DB_NAME,1);
 request.onupgradeneeded=()=>{
  const db=request.result;
  if(!db.objectStoreNames.contains('snapshots'))db.createObjectStore('snapshots',{keyPath:'id'});
  if(!db.objectStoreNames.contains('chunks')){
   const store=db.createObjectStore('chunks',{keyPath:['snapshotId','sequence']});
   store.createIndex('bySnapshot','snapshotId',{unique:false});
  }
 };
 return new Promise((resolve,rejectOpen)=>{
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>rejectOpen(request.error||Error('IndexedDB shadow open failed'));
  request.onblocked=()=>rejectOpen(Error('IndexedDB shadow open blocked by another tab'));
 });
}
function assertSnapshotId(id){
 if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id))
  reject('invalid shadow snapshot id');
}
async function readSnapshotRows(id,idb){
 assertSnapshotId(id);
 const db=await openShadow(idb);
 try {
  const tx=db.transaction(['snapshots','chunks'],'readonly'),done=txComplete(tx);
  const snapshotRequest=tx.objectStore('snapshots').get(id);
  const chunksRequest=tx.objectStore('chunks').index('bySnapshot').getAll(id);
  const [snapshot,chunks]=await Promise.all([requestResult(snapshotRequest),requestResult(chunksRequest)]);
  await done;
  if(!snapshot||!Array.isArray(chunks))reject('shadow snapshot not found');
  return {snapshot,chunks};
 }finally{db.close();}
}
async function decryptSnapshot({snapshot,chunks},handle){
 const keyring=snapshot.keyring;validateKeyring(keyring);
 if(snapshot.kind!==SHADOW_KIND||snapshot.version!==1||
    !['prepared','verified'].includes(snapshot.state)||
    typeof snapshot.manifest!=='object'||!snapshot.manifest)
   reject('unsupported shadow snapshot');
 const manifest=await openLedgerRecord(handle,MANIFEST_TABLE,'manifest',
   envelope(keyring,MANIFEST_TABLE,'manifest',snapshot.manifest));
 if(!manifest||manifest.kind!=='tallybook-st24-shadow-manifest'||manifest.version!==1||
    manifest.id!==snapshot.id||manifest.companyId!==keyring.companyId||
    manifest.workspaceId!==keyring.workspaceId||
    !Number.isSafeInteger(manifest.totalBytes)||manifest.totalBytes<1||
    manifest.totalBytes>MAX_SNAPSHOT_BYTES||
    !Number.isSafeInteger(manifest.chunkCount)||manifest.chunkCount<1||
    manifest.chunkCount!==Math.ceil(manifest.totalBytes/CHUNK_BYTES)||
    typeof manifest.sha256!=='string'||!/^[0-9a-f]{64}$/.test(manifest.sha256)||
    chunks.length!==manifest.chunkCount)
   reject('shadow manifest or chunk count invalid');
 const data=new Uint8Array(manifest.totalBytes);let offset=0;
 for(let sequence=0;sequence<chunks.length;sequence++){
  const chunk=chunks[sequence];
  if(chunk.snapshotId!==snapshot.id||chunk.sequence!==sequence||
     typeof chunk.iv!=='string'||typeof chunk.ciphertext!=='string')
     reject('missing or reordered shadow chunk');
  const value=await openLedgerRecord(handle,CHUNK_TABLE,String(sequence),
    envelope(keyring,CHUNK_TABLE,String(sequence),chunk));
  if(!value||typeof value.data!=='string')reject('malformed decrypted shadow chunk');
  const bytes=un64(value.data,CHUNK_BYTES);
  if(bytes.length!==Math.min(CHUNK_BYTES,manifest.totalBytes-offset))reject('shadow chunk byte length mismatch');
  data.set(bytes,offset);offset+=bytes.length;
 }
 if(offset!==manifest.totalBytes||await sha256(data)!==manifest.sha256)
  reject('shadow plaintext digest mismatch');
 return decoder.decode(data);
}
/** Read-back must fully authenticate the encrypted manifest and ALL chunks. */
export async function readSt24ShadowSnapshot({snapshotId,handle,idb=globalThis.indexedDB}){
 const rows=await readSnapshotRows(snapshotId,idb);
 return {state:rows.snapshot.state,text:await decryptSnapshot(rows,handle)};
}
/**
 * Stage an encrypted immutable shadow from a validated backup JSON string.
 *
 * Gate: caller MUST verify an owner-reselected encrypted backup, decrypt it,
 * and run Tallybook parseBackup BEFORE calling this helper. This function does
 * NOT itself assert owner or source-business authorization. The guarded bridge
 * performs those steps and should be the only future production caller.
 *
 * State transition: IDB atomic "prepared" -> read-back/authenticate -> "verified".
 * Never writes the source. Nothing in this module activates the shadow.
 */
export async function stageSt24ShadowSnapshot({
 keyring,handle,ownerPassphrase,verifiedBackupJson,idb=globalThis.indexedDB,
 locks=globalThis.navigator?.locks
}){
 validateKeyring(keyring);assertShadowStorage(idb);
 if(typeof verifiedBackupJson!=='string')reject('backup validation required');
 const bytes=encoder.encode(verifiedBackupJson);
 if(bytes.length<2||bytes.length>MAX_SNAPSHOT_BYTES)
  reject('snapshot outside 8 MiB pilot budget; no data changed');
 // This checks that the supplied wrapped keyring actually opens the ciphertext
 // generated by this handle; matching scope alone is not sufficient.
 const probe=await sealLedgerRecord(handle,'St24Probe','challenge',{nonce:globalThis.crypto.randomUUID()});
 const credentialHandle=await unlockLedgerWithPassphrase(keyring,ownerPassphrase);
 try{await openLedgerRecord(credentialHandle,'St24Probe','challenge',probe);}
 finally{lockLedgerHandle(credentialHandle);}
 return withCrossTabDataLock('exclusive',async()=>{
  const id=globalThis.crypto.randomUUID();
  assertSnapshotId(id);
  const sha=await sha256(bytes);
  const encryptedChunks=[];
  const count=Math.ceil(bytes.length/CHUNK_BYTES);
  for(let sequence=0;sequence<count;sequence++){
   const segment=bytes.subarray(sequence*CHUNK_BYTES,Math.min(bytes.length,(sequence+1)*CHUNK_BYTES));
   const box=await sealLedgerRecord(handle,CHUNK_TABLE,String(sequence),{data:b64(segment)});
   if(box.workspaceId!==keyring.workspaceId||box.companyId!==keyring.companyId)reject('keyring/handle scope mismatch');
   encryptedChunks.push({snapshotId:id,sequence,iv:box.iv,ciphertext:box.ciphertext});
  }
  const manifest=await sealLedgerRecord(handle,MANIFEST_TABLE,'manifest',{
   kind:'tallybook-st24-shadow-manifest',version:1,id,
   workspaceId:keyring.workspaceId,companyId:keyring.companyId,
   totalBytes:bytes.length,chunkCount:count,sha256:sha
  });
  const snapshot={kind:SHADOW_KIND,version:1,id,state:'prepared',keyring,
    manifest:{iv:manifest.iv,ciphertext:manifest.ciphertext}};
  const db=await openShadow(idb);
  try {
   const tx=db.transaction(['snapshots','chunks'],'readwrite'),done=txComplete(tx);
   const store=tx.objectStore('snapshots'),chunks=tx.objectStore('chunks');
   store.add(snapshot);
   for(const row of encryptedChunks)chunks.add(row);
   await done; // atomic write; no plaintext persisted
  } finally{db.close();}
  // Crash here leaves "prepared"; the source DB remains intact. Reopen with
  // the key and verify before any explicit recovery action.
  const rows=await readSnapshotRows(id,idb);
  const restored=await decryptSnapshot(rows,handle);
  if(restored!==verifiedBackupJson)reject('shadow round-trip mismatch; original source not changed');
  const verifyDb=await openShadow(idb);
  try{
   const tx=verifyDb.transaction('snapshots','readwrite'),done=txComplete(tx);
   const store=tx.objectStore('snapshots'),req=store.get(id);
   const current=await requestResult(req);
   if(!current||current.state!=='prepared') {
    tx.abort();reject('shadow verification state changed');
   }
   store.put({...current,state:'verified'});
   await done;
  }finally{verifyDb.close();}
  return Object.freeze({snapshotId:id,state:'verified',bytes:bytes.length,chunks:count,
   note:'Encrypted shadow verified; active Dexie source is unchanged.'});
 },locks);
}
/** Recovery of a crash between atomic commit and verification: no auto-promotion. */
export async function verifyPreparedSt24ShadowSnapshot({
 snapshotId,handle,expectedBackupJson,idb=globalThis.indexedDB,
 locks=globalThis.navigator?.locks
}){
 if(typeof expectedBackupJson!=='string')reject('external backup comparison required');
 return withCrossTabDataLock('exclusive',async()=>{
  const rows=await readSnapshotRows(snapshotId,idb);
  const text=await decryptSnapshot(rows,handle);
  if(text!==expectedBackupJson)reject('recovered shadow differs from verified external backup');
  if(rows.snapshot.state==='verified')return {snapshotId,state:'verified'};
  const db=await openShadow(idb);
  try{
   const tx=db.transaction('snapshots','readwrite'),done=txComplete(tx),store=tx.objectStore('snapshots');
   const current=await requestResult(store.get(snapshotId));
   if(!current||current.state!=='prepared'){tx.abort();reject('shadow state changed during verification');}
   store.put({...current,state:'verified'});
   await done;
  }finally{db.close();}
  return {snapshotId,state:'verified'};
 },locks);
}
