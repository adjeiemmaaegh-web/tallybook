/** ST24-05: fail-closed review of a proposed encrypted IndexedDB schema.
 * No production migration is performed by this module.
 */
const KEY=/^[A-Za-z][A-Za-z0-9]{0,79}$/;
const ALLOWED=new Set(['id','revision','ciphertext','iv','kind','version']);
function reject(reason){throw new Error('ST24 encrypted schema rejected: '+reason);}
export function assertSt24OpaqueStoreSchema({name,keyPath,indexes=[]}){
 if(typeof name!=='string'||!KEY.test(name))reject('invalid store name');
 if(keyPath!=='id')reject('primary key must be opaque id');
 if(!Array.isArray(indexes))reject('indexes must be an array');
 const seen=new Set();
 for(const index of indexes){
  if(!index||typeof index!=='object'||typeof index.name!=='string'||!KEY.test(index.name))reject('invalid index');
  if(seen.has(index.name))reject('duplicate index');
  seen.add(index.name);
  // A blind index is not automatically safe: equality leakage and collision handling
  // require a separate, reviewed protocol. Until then, NO secondary indexes.
  reject('secondary index requires separately reviewed leakage contract');
 }
 return Object.freeze({name,keyPath,indexCount:0});
}
export function assertSt24SealedRow(row){
 if(!row||typeof row!=='object'||Array.isArray(row))reject('invalid row');
 for(const key of Reflect.ownKeys(row)){
  if(typeof key!=='string'||!ALLOWED.has(key))reject('plaintext or unapproved field');
 }
 if(typeof row.id!=='string'||!/^[-_A-Za-z0-9]{16,128}$/.test(row.id))reject('invalid opaque id');
 if(!Number.isSafeInteger(row.revision)||row.revision<1)reject('invalid revision');
 if(row.kind!=='tallybook-ledger-record'||row.version!==1)reject('invalid envelope');
 if(typeof row.iv!=='string'||typeof row.ciphertext!=='string'||!row.iv||!row.ciphertext)reject('missing ciphertext');
 return true;
}
