import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {indexedDB,IDBKeyRange} from 'fake-indexeddb';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
if(!globalThis.IDBKeyRange)globalThis.IDBKeyRange=IDBKeyRange;
import {createLedgerKeyring,unlockLedgerWithRecoveryCode} from '../client/src/features/security/st24LedgerKeyring.mjs';
import {stageSt24PopulatedDisposableLedger,restoreSt24ShadowToDisposableLedger,compareSt24DisposableLedgers,discardSt24DisposableRestore}
 from '../client/src/features/security/st24DisposableMigration.mjs';

const COMPANY='test-company-001',PASS='high entropy fixture password at least sixteen characters';
const locks={async request(_name,_options,callback){return callback({name:'exclusive'});}};
function id(prefix){return prefix+crypto.randomUUID();}
const request=req=>new Promise((resolve,reject)=>{
 req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
});
async function seedDb(){
 const name=id('tallybook-st24-fixture-');
 const req=indexedDB.open(name,39);
 req.onupgradeneeded=()=>{
  const db=req.result;
  db.createObjectStore('appMeta',{keyPath:'key'}).createIndex('updatedAt','updatedAt');
  db.createObjectStore('businessProfiles',{keyPath:'id'}).createIndex('name','name');
  const sales=db.createObjectStore('sales',{keyPath:'id'});
  sales.createIndex('businessProfileId','businessProfileId');
  sales.createIndex('submissionKey','submissionKey',{unique:true});
  db.createObjectStore('payments',{keyPath:'id'}).createIndex('saleId','saleId');
  db.createObjectStore('customers',{keyPath:'id'}).createIndex('businessProfileId','businessProfileId');
  db.createObjectStore('inventoryMovements',{keyPath:'id'}).createIndex('productId','productId');
  db.createObjectStore('binaryEvidence',{keyPath:'id'});
  db.createObjectStore('orphanKeys',{autoIncrement:false});
 };
 const db=await request(req);
 const tx=db.transaction(Array.from(db.objectStoreNames),'readwrite');
 tx.objectStore('appMeta').put({key:'schemaVersion',value:'39',updatedAt:'2026-11-20'});
 tx.objectStore('businessProfiles').put({id:COMPANY,name:'Synthetic shop',businessProfileId:COMPANY});
 tx.objectStore('customers').put({id:'cust-1',name:'Private Customer Test',businessProfileId:COMPANY});
 tx.objectStore('sales').put({id:'sale-1',businessProfileId:COMPANY,submissionKey:'submit-1',
   totalMinor:135000,paidMinor:100000,outstandingMinor:35000,when:new Date('2026-11-20T00:00:00.000Z')});
 tx.objectStore('payments').put({id:'pay-1',businessProfileId:COMPANY,saleId:'sale-1',amountMinor:100000});
 tx.objectStore('inventoryMovements').put({id:'stock-1',businessProfileId:COMPANY,productId:'sku-1',quantity:3,costMinor:80000});
 tx.objectStore('binaryEvidence').put({id:'evidence-1',businessProfileId:COMPANY,
   blobBytes:Uint8Array.from([0,1,255]),flag:undefined,count:2n});
 tx.objectStore('orphanKeys').put({businessProfileId:COMPANY,amountMinor:1},['path',7]);
 await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)});
 db.close();
 return name;
}
function access(name,table,key){
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open(name);
  req.onsuccess=()=>{
   const db=req.result;
   const get=db.transaction(table,'readonly').objectStore(table).get(key);
   get.onsuccess=()=>{db.close();resolve(get.result)};
   get.onerror=()=>{db.close();reject(get.error)};
  };
  req.onerror=()=>reject(req.error);
 });
}
test('ST24: populated v39 source copies all object stores and indexes into a separate encrypted shadow',async()=>{
 const source=await seedDb(),target=id('tallybook-st24-restore-');
 const {keyring,handle,recoveryCode}=await createLedgerKeyring({workspaceId:'owner-qa',companyId:COMPANY,ownerPassphrase:PASS});
 const original=await access(source,'sales','sale-1');
 const staged=await stageSt24PopulatedDisposableLedger({sourceDbName:source,companyId:COMPANY,keyring,handle,ownerPassphrase:PASS,idb:indexedDB,locks});
 assert.equal(staged.sourceVersion,39);
 assert.equal(staged.tableCount,8);
 assert.equal(staged.rows,8);
 assert.equal(staged.minorTotals['sales.totalMinor'],'135000');
 assert.equal(staged.minorTotals['sales.paidMinor'],'100000');
 assert.equal(staged.minorTotals['sales.outstandingMinor'],'35000');
 assert.equal(staged.minorTotals['payments.amountMinor'],'100000');
 const fromRecovery=await unlockLedgerWithRecoveryCode(keyring,recoveryCode);
 const restored=await restoreSt24ShadowToDisposableLedger({
  snapshotId:staged.snapshotId,targetDbName:target,companyId:COMPANY,
  handle:fromRecovery,expectedSourceSha256:staged.sourceSha256,idb:indexedDB
 });
 assert.equal(restored.sha256,staged.sourceSha256);
 assert.deepEqual(restored.minorTotals,staged.minorTotals);
 assert.deepEqual(await access(source,'sales','sale-1'),original);
 const newSale=await access(target,'sales','sale-1');
 assert.deepEqual(newSale,original);
 const newBinary=await access(target,'binaryEvidence','evidence-1');
 assert.deepEqual([...newBinary.blobBytes],[0,1,255]);
 assert.equal(newBinary.flag,undefined);assert.equal(newBinary.count,2n);
 const comparison=await compareSt24DisposableLedgers({sourceDbName:source,restoredDbName:target,companyId:COMPANY,idb:indexedDB});
 assert.equal(comparison.exact,true);
});
test('ST24: blocked lock and actual source names are rejected before any source mutation',async()=>{
 const source=await seedDb();
 const {keyring,handle}=await createLedgerKeyring({workspaceId:'owner-qa',companyId:COMPANY,ownerPassphrase:PASS});
 await assert.rejects(stageSt24PopulatedDisposableLedger({sourceDbName:'tallybook-db',
  companyId:COMPANY,keyring,handle,ownerPassphrase:PASS,idb:indexedDB,locks}),/non-disposable/);
 await assert.rejects(stageSt24PopulatedDisposableLedger({sourceDbName:source,
  companyId:COMPANY,keyring,handle,ownerPassphrase:PASS,idb:indexedDB,locks:null}),/Web Locks/);
 await assert.rejects(stageSt24PopulatedDisposableLedger({sourceDbName:source,
  companyId:'another-company',keyring,handle,ownerPassphrase:PASS,idb:indexedDB,locks}),/company/);
 assert.equal((await access(source,'sales','sale-1')).totalMinor,135000);
});
test('ST24: tampered external digest and already used targets never overwrite source or a restored target',async()=>{
 const source=await seedDb(),target=id('tallybook-st24-restore-');
 const {keyring,handle}=await createLedgerKeyring({workspaceId:'owner-qa',companyId:COMPANY,ownerPassphrase:PASS});
 const staged=await stageSt24PopulatedDisposableLedger({sourceDbName:source,companyId:COMPANY,keyring,handle,ownerPassphrase:PASS,idb:indexedDB,locks});
 await assert.rejects(restoreSt24ShadowToDisposableLedger({snapshotId:staged.snapshotId,
  targetDbName:target,companyId:COMPANY,handle,expectedSourceSha256:'f'.repeat(64),idb:indexedDB}),/fingerprint/);
 await restoreSt24ShadowToDisposableLedger({snapshotId:staged.snapshotId,
  targetDbName:target,companyId:COMPANY,handle,expectedSourceSha256:staged.sourceSha256,idb:indexedDB});
 await assert.rejects(restoreSt24ShadowToDisposableLedger({snapshotId:staged.snapshotId,
  targetDbName:target,companyId:COMPANY,handle,expectedSourceSha256:staged.sourceSha256,idb:indexedDB}),/existing restore/);
 assert.equal((await access(source,'sales','sale-1')).totalMinor,135000);
});
test('ST24: tenant mixing rejected without copying another company financial rows',async()=>{
 const source=await seedDb(),db=await request(indexedDB.open(source));
 const tx=db.transaction('customers','readwrite');
 tx.objectStore('customers').put({id:'other',businessProfileId:'other-company',name:'Do not copy'});
 await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);tx.onerror=()=>reject(tx.error)});
 db.close();
 const {keyring,handle}=await createLedgerKeyring({workspaceId:'owner-qa',companyId:COMPANY,ownerPassphrase:PASS});
 await assert.rejects(stageSt24PopulatedDisposableLedger({
  sourceDbName:source,companyId:COMPANY,keyring,handle,ownerPassphrase:PASS,idb:indexedDB,locks
 }),/cross-company/);
 assert.equal((await access(source,'customers','other')).name,'Do not copy');
});

test('ST24: interrupted disposable restore target can be explicitly discarded and retried',async()=>{
 const source=await seedDb(),target=id('tallybook-st24-restore-');
 const {keyring,handle}=await createLedgerKeyring({workspaceId:'owner-qa',companyId:COMPANY,ownerPassphrase:PASS});
 const staged=await stageSt24PopulatedDisposableLedger({sourceDbName:source,companyId:COMPANY,keyring,handle,ownerPassphrase:PASS,idb:indexedDB,locks});
 const partialOpen=indexedDB.open(target,39);
 partialOpen.onupgradeneeded=()=>partialOpen.result.createObjectStore('interrupted',{keyPath:'id'});
 const partial=await request(partialOpen); // simulated abandoned rollback target
 partial.close();
 await assert.rejects(restoreSt24ShadowToDisposableLedger({
  snapshotId:staged.snapshotId,targetDbName:target,companyId:COMPANY,
  handle,expectedSourceSha256:staged.sourceSha256,idb:indexedDB
 }),/existing restore/);
 await assert.rejects(discardSt24DisposableRestore({targetDbName:'tallybook-db',idb:indexedDB}),/non-disposable/);
 assert.equal((await discardSt24DisposableRestore({targetDbName:target,idb:indexedDB})).discarded,true);
 const recovered=await restoreSt24ShadowToDisposableLedger({
  snapshotId:staged.snapshotId,targetDbName:target,companyId:COMPANY,
  handle,expectedSourceSha256:staged.sourceSha256,idb:indexedDB
 });
 assert.equal(recovered.sha256,staged.sourceSha256);
 assert.equal((await access(source,'sales','sale-1')).totalMinor,135000);
});
