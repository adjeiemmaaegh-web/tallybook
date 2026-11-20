/**
 * ST24-05 disposable populated-ledger migration rehearsal.
 *
 * Source names must begin "tallybook-st24-fixture-". Restored names must begin
 * "tallybook-st24-restore-". This module CANNOT open or mutate live tallybook-db,
 * workspace-specific ledgers, cloud, or the assistant database.
 *
 * A single read-only IndexedDB transaction captures ALL object stores at one
 * consistent point. The source is never edited. The encrypted snapshot is
 * reconstructed into a different disposable target; row values, primary keys,
 * key paths, indexes, counts and money-field totals are compared before success.
 */
import {encodeSt24Clone,decodeSt24Clone,canonicalSt24CloneJson} from './st24CloneCodec.mjs';
import {stageSt24ShadowSnapshot,readSt24ShadowSnapshot} from './st24ShadowSnapshot.mjs';
import {withCrossTabDataLock} from '../backup/crossTabDataLock.mjs';
const MAX_BYTES=8*1024*1024,MAX_ROWS=100000,MAX_STORES=128;
const encoder=new TextEncoder();
const fail=message=>{throw Error('ST24 disposable migration: '+message);};
const FIXTURE=/^tallybook-st24-fixture-[A-Za-z0-9_-]{5,90}$/;
const RESTORE=/^tallybook-st24-restore-[A-Za-z0-9_-]{5,90}$/;
function nameIsAllowed(name,kind) {
 if(typeof name!=='string'||!(kind==='source'?FIXTURE:RESTORE).test(name))
  fail('refusing non-disposable database name');
}
function assertIdb(idb) {
 if(!idb||typeof idb.open!=='function'||typeof idb.databases!=='function')
  fail('safe isolated database enumeration unavailable');
}
function assertKeyPath(path) {
 if(path===null||typeof path==='string'&&path.length<200)return;
 if(Array.isArray(path)&&path.length>0&&path.length<=8&&path.every(x=>typeof x==='string'&&x.length>0&&x.length<200))return;
 fail('unsupported index or primary key path');
}
function assertStoreName(name) {
 if(typeof name!=='string'||name.length<1||name.length>128||/[\u0000-\u001f\u007f]/.test(name))
  fail('invalid object-store or index name');
}
function assertScope(record,companyId,table) {
 if(record&&typeof record==='object'&&!Array.isArray(record)){
  for(const k of ['businessProfileId','companyId']){
   if(typeof record[k]==='string'&&record[k]!==companyId)
    fail('cross-company record in '+table);
  }
  if(table==='businessProfiles'&&record.id!==companyId)fail('unexpected business in source');
 }
}
function aggregateMinor(record,table,totals) {
 const visit=(value,path,depth=0)=>{
  if(depth>32)fail('financial record nesting too deep');
  if(value===null||typeof value!=='object')return;
  if(value instanceof Date||value instanceof Map||value instanceof Set||ArrayBuffer.isView(value)||
     value instanceof ArrayBuffer)return;
  if(Array.isArray(value)){value.forEach(v=>visit(v,path+'[]',depth+1));return;}
  for(const [k,v] of Object.entries(value)){
   if(/Minor$/.test(k)){
    if(v===undefined||v===null)continue; // truly absent optional monetary fields remain absent
    if(typeof v!=='number'||!Number.isSafeInteger(v))fail('unsafe money field '+table+'.'+k);
    const metric=table+'.'+path+k;
    totals.set(metric,(totals.get(metric)||0n)+BigInt(v));
   }else if(v&&typeof v==='object')visit(v,path+k+'.',depth+1);
  }
 };
 visit(record,'');
}
function readRequest(request) {
 return new Promise((resolve,reject)=>{
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||Error('IDB request failed'));
 });
}
function transactionDone(tx) {
 return new Promise((resolve,reject)=>{
  tx.oncomplete=()=>resolve();
  tx.onerror=()=>reject(tx.error||Error('IDB transaction failed'));
  tx.onabort=()=>reject(tx.error||Error('IDB transaction aborted'));
 });
}
async function openedExisting(idb,name) {
 const existing=await idb.databases();
 if(!existing.some(x=>x.name===name))fail('source database does not exist');
 const req=idb.open(name);
 req.onupgradeneeded=()=>{req.transaction.abort();};
 return readRequest(req);
}
function digestInput(value){return JSON.stringify(value);}
async function sha256(text){
 if(!globalThis.crypto?.subtle)fail('secure digest unavailable');
 const result=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(text)));
 return Array.from(result,b=>b.toString(16).padStart(2,'0')).join('');
}
function validateGraph(graph,companyId) {
 if(!graph||graph.kind!=='tallybook-st24-disposable-source-v1'||graph.version!==1||
    graph.companyId!==companyId||!Number.isSafeInteger(graph.sourceVersion)||
    graph.sourceVersion<1||graph.sourceVersion>39||!Array.isArray(graph.tables)||
    graph.tables.length<1||graph.tables.length>MAX_STORES)
  fail('invalid source graph');
 const seen=new Set();let rows=0;
 for(const table of graph.tables){
  assertStoreName(table.name);
  if(seen.has(table.name))fail('duplicate object store');
  seen.add(table.name);assertKeyPath(table.keyPath);
  if(typeof table.autoIncrement!=='boolean'||!Array.isArray(table.indexes)||!Array.isArray(table.records))
   fail('invalid store descriptor');
  rows+=table.records.length;
  if(rows>MAX_ROWS)fail('source exceeds row safety budget');
  const indexNames=new Set();
  for(const index of table.indexes){
   assertStoreName(index.name);assertKeyPath(index.keyPath);
   if(index.keyPath===null||typeof index.unique!=='boolean'||typeof index.multiEntry!=='boolean'||
      indexNames.has(index.name))fail('invalid index definition');
   indexNames.add(index.name);
  }
  for(const record of table.records){
   if(!record||!Object.hasOwn(record,'primaryKey')||!Object.hasOwn(record,'value'))fail('invalid record pair');
   const val=decodeSt24Clone(record.value);
   assertScope(val,companyId,table.name);
   decodeSt24Clone(record.primaryKey);
  }
 }
 if(!seen.has('businessProfiles'))fail('source missing businessProfiles');
 const companies=graph.tables.find(x=>x.name==='businessProfiles').records;
 if(companies.length!==1)fail('expected exactly one disposable business');
 const row=decodeSt24Clone(companies[0].value);
 if(row.id!==companyId)fail('wrong disposable business');
}
function graphSummary(graph){
 const totals=new Map();let rows=0;
 const tables={};
 for(const t of graph.tables){
  tables[t.name]=t.records.length;rows+=t.records.length;
  for(const pair of t.records)aggregateMinor(decodeSt24Clone(pair.value),t.name,totals);
 }
 return {tableCounts:tables,rows,minorTotals:Object.fromEntries([...totals].sort((a,b)=>a[0].localeCompare(b[0])).map(([k,v])=>[k,v.toString()]))};
}
/** Read one atomic IndexedDB snapshot. A schema includes every store and index. */
async function readGraph({dbName,companyId,idb,kind='source'}){
 nameIsAllowed(dbName,kind);assertIdb(idb);
 if(typeof companyId!=='string'||!companyId.length||companyId.length>256)fail('invalid company');
 const db=await openedExisting(idb,dbName);
 try{
  const names=Array.from(db.objectStoreNames);
  if(names.length===0||names.length>MAX_STORES)fail('unsafe source table count');
  const tx=db.transaction(names,'readonly'),done=transactionDone(tx);
  let count=0,size=0;
  const graph={kind:'tallybook-st24-disposable-source-v1',version:1,sourceVersion:db.version,companyId,tables:[]};
  // Schedule each cursor synchronously before awaiting; IDB auto-commit must
  // never occur while awaiting external crypto or any unrelated JS promise.
  const pending=names.map(name=>{
   const store=tx.objectStore(name);assertStoreName(name);
   const indexes=Array.from(store.indexNames).map(indexName=>{
    const idx=store.index(indexName);assertStoreName(indexName);assertKeyPath(idx.keyPath);
    return {name:indexName,keyPath:idx.keyPath,unique:idx.unique,multiEntry:idx.multiEntry};
   });
   const table={name,keyPath:store.keyPath,autoIncrement:store.autoIncrement,indexes,records:[]};
   assertKeyPath(table.keyPath);graph.tables.push(table);
   return new Promise((resolve,reject)=>{
    const req=store.openCursor();
    req.onerror=()=>reject(req.error||Error('cursor failure'));
    req.onsuccess=()=>{
     const cursor=req.result;
     if(!cursor){resolve();return;}
     try{
      assertScope(cursor.value,companyId,name);
      const pair={primaryKey:encodeSt24Clone(cursor.primaryKey),value:encodeSt24Clone(cursor.value)};
      size+=encoder.encode(JSON.stringify(pair)).length;
      count++;
      if(size>MAX_BYTES||count>MAX_ROWS)fail('disposable fixture exceeds bounded migration budget');
      table.records.push(pair);
      cursor.continue();
     }catch(e){try{tx.abort();}catch{}reject(e);}
    };
   });
  });
  await Promise.all(pending);await done;
  validateGraph(graph,companyId);
  const json=digestInput(graph);
  if(encoder.encode(json).length>MAX_BYTES)fail('serialized migration exceeds 8 MiB pilot budget');
  return {graph,json,sha256:await sha256(json),summary:graphSummary(graph)};
 }finally{db.close();}
}
/**
 * Stage all actual source-table records and schema in an inactive encrypted
 * shadow. lock is held for source extraction; separate shadow staging obtains
 * its own exclusive lock. The result is NOT an active storage migration.
 */
export async function stageSt24PopulatedDisposableLedger({
 sourceDbName,companyId,keyring,handle,ownerPassphrase,idb=globalThis.indexedDB,
 locks=globalThis.navigator?.locks
}){
 if(!keyring||keyring.companyId!==companyId)fail('source company and keyring differ');
 const source=await withCrossTabDataLock('exclusive',
   ()=>readGraph({dbName:sourceDbName,companyId,idb}),locks);
 const shadow=await stageSt24ShadowSnapshot({
  keyring,handle,ownerPassphrase,verifiedBackupJson:source.json,idb,locks
 });
 const verified=await readSt24ShadowSnapshot({snapshotId:shadow.snapshotId,handle,idb});
 if(verified.state!=='verified'||verified.text!==source.json)
  fail('encrypted source read-back mismatch');
 // Source may have moved since the snapshot. A rehearsal is only accepted
 // if a second consistent source read matches the exact first version.
 const reread=await withCrossTabDataLock('exclusive',
   ()=>readGraph({dbName:sourceDbName,companyId,idb}),locks);
 if(reread.sha256!==source.sha256)
  fail('source changed during rehearsal; no active storage was changed');
 return Object.freeze({
  snapshotId:shadow.snapshotId,sourceSha256:source.sha256,sourceVersion:source.graph.sourceVersion,
  tableCount:source.graph.tables.length,...source.summary
 });
}
/** Restore to a new disposable database, never the user's real source. */
export async function restoreSt24ShadowToDisposableLedger({
 snapshotId,targetDbName,companyId,handle,expectedSourceSha256,idb=globalThis.indexedDB
}){
 nameIsAllowed(targetDbName,'restore');assertIdb(idb);
 if(typeof expectedSourceSha256!=='string'||!/^[0-9a-f]{64}$/.test(expectedSourceSha256))fail('independent source fingerprint required');
 const rows=await readSt24ShadowSnapshot({snapshotId,handle,idb});
 if(rows.state!=='verified')fail('shadow was not verified');
 if(await sha256(rows.text)!==expectedSourceSha256)fail('external source fingerprint mismatch');
 let graph;
 try{graph=JSON.parse(rows.text);}catch{fail('decrypted source schema is not JSON');}
 validateGraph(graph,companyId);
 const already=await idb.databases();
 if(already.some(x=>x.name===targetDbName))fail('refusing to overwrite existing restore target');
 const req=idb.open(targetDbName,graph.sourceVersion);
 req.onupgradeneeded=()=>{
  const dest=req.result;
  try{
   for(const t of graph.tables){
    const options={autoIncrement:t.autoIncrement};
    if(t.keyPath!==null)options.keyPath=t.keyPath;
    const store=dest.createObjectStore(t.name,options);
    for(const idx of t.indexes)
     store.createIndex(idx.name,idx.keyPath,{unique:idx.unique,multiEntry:idx.multiEntry});
   }
  }catch(e){req.transaction.abort();}
 };
 const db=await readRequest(req);
 try{
  const names=graph.tables.map(t=>t.name),tx=db.transaction(names,'readwrite'),done=transactionDone(tx);
  for(const t of graph.tables){
   const store=tx.objectStore(t.name);
   for(const pair of t.records){
    const value=decodeSt24Clone(pair.value);
    const key=decodeSt24Clone(pair.primaryKey);
    if(t.keyPath===null)store.add(value,key);
    else store.add(value);
   }
  }
  await done;
 }finally{db.close();}
 const restored=await readGraph({dbName:targetDbName,companyId,idb,kind:'restore'});
 if(restored.sha256!==expectedSourceSha256||restored.json!==rows.text)
  fail('restored data/schema differs; target is unsafe and source untouched');
 return Object.freeze({restoredDatabase:targetDbName,sha256:restored.sha256,
  tableCount:restored.graph.tables.length,...restored.summary});
}
/** Explicit source/restore digest proof; never promotes either DB. */
export async function compareSt24DisposableLedgers({
 sourceDbName,restoredDbName,companyId,idb=globalThis.indexedDB
}){
 const [source,target]=await Promise.all([
  readGraph({dbName:sourceDbName,companyId,idb}),
  readGraph({dbName:restoredDbName,companyId,idb,kind:'restore'})
 ]);
 if(source.sha256!==target.sha256||source.json!==target.json)
  fail('financial source/restore mismatch');
 return {exact:true,sha256:source.sha256,...source.summary};
}


/**
 * Explicitly discard a failed / interrupted DISPOSABLE restore target.
 * Cannot touch tallybook-db, owner workspaces, original fixture databases,
 * or the encrypted shadow. No automatic deletion is performed on exception.
 */
export async function discardSt24DisposableRestore({
 targetDbName,idb=globalThis.indexedDB
}){
 nameIsAllowed(targetDbName,'restore');assertIdb(idb);
 const existing=await idb.databases();
 if(!existing.some(entry=>entry.name===targetDbName))
  return Object.freeze({targetDbName,discarded:false,reason:'target absent'});
 const request=idb.deleteDatabase(targetDbName);
 const result=await new Promise((resolve,reject)=>{
  request.onsuccess=()=>resolve(true);
  request.onerror=()=>reject(request.error||Error('disposable restore deletion failed'));
  request.onblocked=()=>reject(Error('disposable restore is open in another tab; close it before discarding'));
 });
 return Object.freeze({targetDbName,discarded:result,reason:'explicit disposable cleanup'});
}
