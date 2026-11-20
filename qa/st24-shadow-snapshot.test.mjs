import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {indexedDB,IDBKeyRange} from 'fake-indexeddb';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
if(!globalThis.IDBKeyRange)globalThis.IDBKeyRange=IDBKeyRange;
import {createLedgerKeyring,unlockLedgerWithPassphrase}
 from '../client/src/features/security/st24LedgerKeyring.mjs';
import {ST24_SHADOW_DB_NAME,stageSt24ShadowSnapshot,readSt24ShadowSnapshot,
 verifyPreparedSt24ShadowSnapshot} from '../client/src/features/security/st24ShadowSnapshot.mjs';

const options={workspaceId:'owner-qa',companyId:'business-qa',ownerPassphrase:'correct owner passphrase not used in production'};
const sample=JSON.stringify({kind:'synthetic-test-data',privateName:'Sensitive Customer',records:{
 sales:[{id:'sale-1',amountMinor:543210}],customers:[{id:'c-1',name:'Sensitive Customer'}]
}});
const locks={async request(_name,_opt,callback){return callback({name:'available'});}};
function fresh(){
 return createLedgerKeyring(options);
}
function req(request){return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
async function dbOpen(){
 return await req(indexedDB.open(ST24_SHADOW_DB_NAME));
}
async function readRaw(id){
 const db=await dbOpen();
 try{
  const tx=db.transaction(['snapshots','chunks'],'readonly');
  const s=await req(tx.objectStore('snapshots').get(id));
  const c=await req(tx.objectStore('chunks').index('bySnapshot').getAll(id));
  return {s,c};
 }finally{db.close();}
}
async function changeRow(id,change){
 const db=await dbOpen();
 try{
  const tx=db.transaction('chunks','readwrite');
  const store=tx.objectStore('chunks'),row=await req(store.get([id,0]));
  store.put(change(row));
  await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);tx.onerror=()=>reject(tx.error);});
 }finally{db.close();}
}
async function setState(id,state){
 const db=await dbOpen();
 try{
  const tx=db.transaction('snapshots','readwrite');
  const store=tx.objectStore('snapshots'),row=await req(store.get(id));
  store.put({...row,state});
  await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);tx.onerror=()=>reject(tx.error);});
 }finally{db.close();}
}
test('ST24 shadow atomic encrypted snapshot verifies and never touches source ledger',async()=>{
 const {keyring,handle}=await fresh();
 const sourceBefore=await indexedDB.databases();
 const receipt=await stageSt24ShadowSnapshot({keyring,handle,ownerPassphrase:options.ownerPassphrase,
  verifiedBackupJson:sample,idb:indexedDB,locks});
 assert.equal(receipt.state,'verified');
 const raw=await readRaw(receipt.snapshotId);
 assert.equal(raw.s.state,'verified');assert.ok(raw.c.length>0);
 assert.equal(JSON.stringify(raw).includes('Sensitive Customer'),false);
 assert.equal(JSON.stringify(raw).includes('sale-1'),false);
 const reader=await unlockLedgerWithPassphrase(keyring,options.ownerPassphrase);
 const restored=await readSt24ShadowSnapshot({snapshotId:receipt.snapshotId,handle:reader,idb:indexedDB});
 assert.equal(restored.text,sample);
 const names=(await indexedDB.databases()).map(x=>x.name);
 assert.equal(names.includes('tallybook-db'),false);
 assert.equal(sourceBefore.some(x=>x.name==='tallybook-db'),false);
});
test('ST24 shadow reject tampered chunk while preserving metadata and original text',async()=>{
 const {keyring,handle}=await fresh();
 const receipt=await stageSt24ShadowSnapshot({keyring,handle,ownerPassphrase:options.ownerPassphrase,
  verifiedBackupJson:sample+' ',idb:indexedDB,locks});
 await changeRow(receipt.snapshotId,row=>({...row,ciphertext:(row.ciphertext[0]==='A'?'B':'A')+row.ciphertext.slice(1)}));
 await assert.rejects(readSt24ShadowSnapshot({snapshotId:receipt.snapshotId,handle,idb:indexedDB}),/authenticate|authentication|Invalid/);
 const raw=await readRaw(receipt.snapshotId);
 assert.equal(raw.s.state,'verified');
});
test('ST24 shadow refused when keyring and in-memory handle belong to different keys',async()=>{
 const first=await fresh(),second=await fresh();
 await assert.rejects(stageSt24ShadowSnapshot({keyring:first.keyring,handle:second.handle,
  ownerPassphrase:options.ownerPassphrase,verifiedBackupJson:sample,
  idb:indexedDB,locks}),/authenticate|authenticity|authenticated/);
});
test('ST24 shadow interrupted prepared snapshot requires authenticated independent comparison',async()=>{
 const {keyring,handle}=await fresh();
 const receipt=await stageSt24ShadowSnapshot({keyring,handle,ownerPassphrase:options.ownerPassphrase,
  verifiedBackupJson:sample+'\n',idb:indexedDB,locks});
 await setState(receipt.snapshotId,'prepared');
 await assert.rejects(verifyPreparedSt24ShadowSnapshot({snapshotId:receipt.snapshotId,handle,
  expectedBackupJson:sample,idb:indexedDB,locks}),/differs/);
 assert.equal((await readRaw(receipt.snapshotId)).s.state,'prepared');
 const result=await verifyPreparedSt24ShadowSnapshot({snapshotId:receipt.snapshotId,handle,
  expectedBackupJson:sample+'\n',idb:indexedDB,locks});
 assert.equal(result.state,'verified');
 assert.equal((await readRaw(receipt.snapshotId)).s.state,'verified');
});
test('ST24 shadow missing Web Locks or oversized input leaves source untouched',async()=>{
 const {keyring,handle}=await fresh();
 await assert.rejects(stageSt24ShadowSnapshot({keyring,handle,ownerPassphrase:options.ownerPassphrase,
  verifiedBackupJson:sample,idb:indexedDB,locks:null}),/Web Locks support/);
 await assert.rejects(stageSt24ShadowSnapshot({keyring,handle,ownerPassphrase:options.ownerPassphrase,
  verifiedBackupJson:'x'.repeat(8*1024*1024+1),idb:indexedDB,locks}),/pilot budget/);
 assert.equal((await indexedDB.databases()).some(x=>x.name==='tallybook-db'),false);
});
