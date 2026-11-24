/**
 * ST24-05 active-ledger row cipher (SYNCHRONOUS on purpose).
 *
 * Why synchronous: every Tallybook service runs read -> compute -> write inside ONE IndexedDB transaction.
 * Awaiting WebCrypto inside such a transaction lets it auto-commit, and ciphertext cannot be staged before
 * the transaction because writes depend on reads made inside it. A synchronous, vetted AEAD
 * (@noble/ciphers XChaCha20-Poly1305, audited) is therefore used below the Dexie layer.
 *
 * Trade-off (documented, accepted by design): while the ledger is unlocked, the 32-byte row key and blind key
 * exist as raw bytes in this tab's JavaScript heap (unlike the non-extractable WebCrypto handle of the keyring
 * module). Locking overwrites them best-effort; JavaScript cannot guarantee every heap copy is erased.
 *
 * Keys are derived (HKDF-SHA-256, WebCrypto, async, at unlock time only) from the keyring DEK with distinct
 * domain info strings, so the DEK itself never keys a record and the row key never keys a blind index.
 */
import {xchacha20poly1305} from '@noble/ciphers/chacha.js';
import {hmac} from '@noble/hashes/hmac.js';
import {sha256} from '@noble/hashes/sha2.js';
import {canonicalSt24CloneJson,decodeSt24Clone,encodeSt24Clone} from './st24CloneCodec.mjs';

const enc=new TextEncoder(),dec=new TextDecoder('utf-8',{fatal:true});
const ROW_DOMAIN='tallybook-st24-row-v1',BLIND_DOMAIN='tallybook-st24-blind-v1';
export const ST24_ROW_VERSION=1;
const MAX_ROW_BYTES=8*1024*1024;
const fail=(m='Invalid encrypted ledger row.')=>{throw new Error(m);};
/** Accept a Uint8Array from any realm (IndexedDB structured clones can cross realms); return a same-realm view. */
const isBytes=x=>x!==null&&typeof x==='object'&&ArrayBuffer.isView(x)&&Object.prototype.toString.call(x)==='[object Uint8Array]';
const asBytes=x=>isBytes(x)?new Uint8Array(x.buffer,x.byteOffset,x.byteLength):null;

function webcrypto(){
  const c=globalThis.crypto;
  if(!c?.subtle||typeof c.getRandomValues!=='function')fail('Secure WebCrypto is unavailable. Ledger stays locked.');
  return c;
}
function hkdf(dek,info){
  return webcrypto().subtle.importKey('raw',dek,'HKDF',false,['deriveBits']).then(key=>
    webcrypto().subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt:enc.encode('tallybook-st24-subkeys-v1'),info:enc.encode(info)},key,256))
    .then(bits=>new Uint8Array(bits));
}
/** Derive independent row and blind-index keys from the 32-byte DEK. Caller zeroes `dek`. */
export async function deriveSt24Subkeys(dek){
  if(!(dek instanceof Uint8Array)||dek.length!==32)fail('Invalid ledger key.');
  const [rowKey,blindKey]=await Promise.all([hkdf(dek,ROW_DOMAIN),hkdf(dek,BLIND_DOMAIN)]);
  return {rowKey,blindKey};
}
const scopeText=scope=>{
  if(typeof scope!=='string'||!scope||scope.length>256||/[\u0000-\u001f]/.test(scope))fail('Invalid ledger scope.');
  return scope;
};
const aadFor=(scope,table,primaryKey)=>{
  if(typeof table!=='string'||!/^[A-Za-z][A-Za-z0-9]{0,79}$/.test(table))fail('Invalid ledger table.');
  return enc.encode(JSON.stringify([ROW_DOMAIN,scopeText(scope),table,canonicalSt24CloneJson(primaryKey)]));
};
/** The tagged codec builds null-prototype objects; IndexedDB returns ordinary objects, so restore them
 * (own enumerable data only) to keep encrypted mode transparent to application code. */
function restorePlain(x,depth=0){
  if(depth>64||x===null||typeof x!=='object')return x;
  if(Array.isArray(x)){for(let i=0;i<x.length;i++)x[i]=restorePlain(x[i],depth+1);return x;}
  if(Object.getPrototypeOf(x)===null){
    for(const k of Object.keys(x))x[k]=restorePlain(x[k],depth+1);
    return Object.setPrototypeOf(x,Object.prototype);
  }
  return x;
}
const randomNonce=()=>webcrypto().getRandomValues(new Uint8Array(24));

/** Encrypt a whole record. The table and primary key are authenticated, so a row moved to another table,
 * another key or another workspace cannot be opened. */
export function sealSt24Row({rowKey,scope,table,primaryKey,record}){
  if(!isBytes(rowKey)||rowKey.length!==32)fail('Ledger is locked.');
  if(!record||typeof record!=='object'||Array.isArray(record))fail('Ledger record must be an object.');
  const plain=enc.encode(JSON.stringify(encodeSt24Clone(record,{preserveOrder:true})));
  if(plain.length>MAX_ROW_BYTES)fail('Ledger record exceeds size limit.');
  const nonce=randomNonce();
  const c=xchacha20poly1305(asBytes(rowKey),nonce,aadFor(scope,table,primaryKey)).encrypt(plain);
  plain.fill(0);
  return {v:ST24_ROW_VERSION,n:nonce,c};
}
export function openSt24Row({rowKey,scope,table,primaryKey,sealed}){
  if(!isBytes(rowKey)||rowKey.length!==32)fail('Ledger is locked.');
  const nonce=sealed&&typeof sealed==='object'?asBytes(sealed.n):null;
  const body=sealed&&typeof sealed==='object'?asBytes(sealed.c):null;
  if(!sealed||sealed.v!==ST24_ROW_VERSION||!nonce||nonce.length!==24||!body||body.length<17||body.length>MAX_ROW_BYTES+32)fail();
  let plain;
  try{plain=xchacha20poly1305(asBytes(rowKey),nonce,aadFor(scope,table,primaryKey)).decrypt(body);}
  catch{fail('Ledger row could not be authenticated. No data was changed.');}
  try{return restorePlain(decodeSt24Clone(JSON.parse(dec.decode(plain)),{preserveOrder:true}));}
  catch{fail('Ledger row is damaged. No data was changed.');}
  finally{plain.fill(0);}
}
/** Deterministic keyed index value. Equal inputs give equal outputs so exact lookups and uniqueness keep
 * working; the value reveals nothing without the blind key, and equality (not order or prefix) is all it
 * preserves. Output is a string so IndexedDB compares it consistently. */
export function blindSt24Value({blindKey,scope,table,field,value}){
  if(!isBytes(blindKey)||blindKey.length!==32)fail('Ledger is locked.');
  const mac=hmac(sha256,asBytes(blindKey),enc.encode(JSON.stringify([BLIND_DOMAIN,scopeText(scope),table,field,canonicalSt24CloneJson(value)])));
  let s='';for(const b of mac)s+=String.fromCharCode(b);
  return 'b1:'+btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export const zeroSt24Key=key=>{if(key instanceof Uint8Array)key.fill(0);};
