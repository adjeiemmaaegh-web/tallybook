/** Disposable encrypted-record repository. Never opens the production ledger. */
import {sealLedgerRecord,openLedgerRecord} from './st24LedgerKeyring.mjs';
import {assertSt24OpaqueStoreSchema,assertSt24SealedRow} from './st24OpaqueStoreContract.mjs';
const NAME=/^tallybook-st24-encrypted-fixture-[A-Za-z0-9_-]{5,80}$/;
const STORE='encryptedRows';
function fail(s){throw Error('ST24 encrypted fixture: '+s);}
function req(request){return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||Error('request failed'));});}
function done(tx){return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error||Error('transaction aborted'));tx.onerror=()=>reject(tx.error||Error('transaction failed'));});}
function validate(name,table,id){if(!NAME.test(name))fail('production database access forbidden');if(typeof table!=='string'||!/^[A-Za-z][A-Za-z0-9]{0,79}$/.test(table))fail('invalid table');if(typeof id!=='string'||!/^[-_A-Za-z0-9]{16,128}$/.test(id))fail('opaque identifier required');}
async function opaqueKey(table,id){const bytes=new TextEncoder().encode(JSON.stringify([table,id]));const digest=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');}
function open(idb,name){return new Promise((resolve,reject)=>{const r=idb.open(name,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE,{keyPath:'id'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||Error('open failed'));r.onblocked=()=>reject(Error('blocked by another tab'));});}
function inspect(db){if(db.objectStoreNames.length!==1||!db.objectStoreNames.contains(STORE))fail('unexpected database schema');const tx=db.transaction(STORE,'readonly');const s=tx.objectStore(STORE);assertSt24OpaqueStoreSchema({name:STORE,keyPath:s.keyPath,indexes:Array.from(s.indexNames).map(name=>({name}))});}
export async function createSt24EncryptedFixture({dbName,handle,keyring,idb=globalThis.indexedDB}){
 if(!keyring||typeof keyring.workspaceId!=='string'||typeof keyring.companyId!=='string')fail('keyring identity required');
 if(typeof dbName!=='string'||!NAME.test(dbName))fail('production database access forbidden');
 if(!idb?.open||!idb?.databases)fail('IndexedDB enumeration required');
 if((await idb.databases()).some(d=>d.name===dbName))fail('fixture already exists');
 const db=await open(idb,dbName);try{inspect(db);}finally{db.close();}
 return {dbName,handle,idb,workspaceId:keyring.workspaceId,companyId:keyring.companyId};
}
export async function writeSt24EncryptedFixture(repository,{table,id,record,expectedRevision=0}){
 const {dbName,handle,idb}=repository;validate(dbName,table,id);
 if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)fail('invalid expected revision');
 const envelope=await sealLedgerRecord(handle,table,id,record);
 const key=await opaqueKey(table,id);
 const db=await open(idb,dbName);
 try{
  inspect(db);
  const tx=db.transaction(STORE,'readwrite');const completion=done(tx);
  const store=tx.objectStore(STORE);
  try{
   const previous=await req(store.get(key));
   if(previous)assertSt24SealedRow(previous);
   const revision=previous?.revision??0;
   if(revision!==expectedRevision){tx.abort();await completion.catch(()=>{});fail('revision conflict');}
   const next={id:key,revision:revision+1,kind:envelope.kind,version:envelope.version,iv:envelope.iv,ciphertext:envelope.ciphertext};
   assertSt24SealedRow(next);
   await req(store.put(next));await completion;
   return next.revision;
  }catch(e){try{tx.abort();}catch{}await completion.catch(()=>{});throw e;}
 }finally{db.close();}
}
export async function readSt24EncryptedFixture(repository,{table,id}){
 const {dbName,handle,idb}=repository;validate(dbName,table,id);
 const key=await opaqueKey(table,id);
 const db=await open(idb,dbName);
 try{
  inspect(db);const tx=db.transaction(STORE,'readonly');const completion=done(tx);
  const row=await req(tx.objectStore(STORE).get(key));await completion;
  if(!row)return null;
  assertSt24SealedRow(row);
  const envelope={kind:row.kind,version:row.version,workspaceId:repository.workspaceId,companyId:repository.companyId,table,primaryKey:id,iv:row.iv,ciphertext:row.ciphertext};
  return {revision:row.revision,record:await openLedgerRecord(handle,table,id,envelope)};
 }finally{db.close();}
}
