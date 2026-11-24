import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {blindSt24Value,deriveSt24Subkeys,openSt24Row,sealSt24Row} from '../client/src/features/security/st24RowCipher.mjs';

const dek=()=>new Uint8Array(randomBytes(32));
const rec={id:'sale-1',totalMinor:2500,note:'Ama Mensah +233201234567',at:new Date('2026-01-02T10:00:00Z'),big:123n,u:undefined,nan:NaN,bytes:new Uint8Array([1,2,3])};

test('subkeys are deterministic per DEK, distinct from each other and from the DEK',async()=>{
 const d=dek();const a=await deriveSt24Subkeys(d),b=await deriveSt24Subkeys(d),c=await deriveSt24Subkeys(dek());
 assert.deepEqual(a.rowKey,b.rowKey);assert.notDeepEqual(a.rowKey,a.blindKey);
 assert.notDeepEqual(a.rowKey,d);assert.notDeepEqual(a.rowKey,c.rowKey);
 await assert.rejects(deriveSt24Subkeys(new Uint8Array(31)),/Invalid ledger key/);
});
test('seal/open round-trips every structured-clone type losslessly and hides plaintext',async()=>{
 const {rowKey}=await deriveSt24Subkeys(dek());
 const sealed=sealSt24Row({rowKey,scope:'ws',table:'sales',primaryKey:'sale-1',record:rec});
 assert.equal(sealed.n.length,24);
 const text=Buffer.from(sealed.c).toString('latin1');
 assert.ok(!text.includes('Ama')&&!text.includes('233201234567')&&!text.includes('2500'));
 const back=openSt24Row({rowKey,scope:'ws',table:'sales',primaryKey:'sale-1',sealed});
 assert.deepEqual(back,rec);assert.ok(Object.hasOwn(back,'u'));assert.ok(Number.isNaN(back.nan));assert.ok(back.at instanceof Date);
});
test('every seal uses a fresh nonce, so identical records produce different ciphertext',async()=>{
 const {rowKey}=await deriveSt24Subkeys(dek());const seen=new Set();
 for(let i=0;i<200;i++){const s=sealSt24Row({rowKey,scope:'ws',table:'t',primaryKey:'k',record:{a:1}});seen.add(Buffer.from(s.n).toString('hex'));}
 assert.equal(seen.size,200);
});
test('a row cannot be moved to another key, table, workspace or opened with another key',async()=>{
 const {rowKey}=await deriveSt24Subkeys(dek());const other=(await deriveSt24Subkeys(dek())).rowKey;
 const sealed=sealSt24Row({rowKey,scope:'ws',table:'sales',primaryKey:'a',record:{x:1}});
 for(const args of [{table:'sales',primaryKey:'b'},{table:'payments',primaryKey:'a'},{scope:'other',table:'sales',primaryKey:'a'},{rowKey:other,table:'sales',primaryKey:'a'}])
  assert.throws(()=>openSt24Row({rowKey,scope:'ws',sealed,...args}),/could not be authenticated|locked/i);
 // Primary-key TYPE is authenticated too (1 vs "1").
 const numeric=sealSt24Row({rowKey,scope:'ws',table:'t',primaryKey:1,record:{x:1}});
 assert.throws(()=>openSt24Row({rowKey,scope:'ws',table:'t',primaryKey:'1',sealed:numeric}),/authenticated/);
});
test('any bit flip in nonce or ciphertext is rejected; malformed envelopes fail closed',async()=>{
 const {rowKey}=await deriveSt24Subkeys(dek());
 const sealed=sealSt24Row({rowKey,scope:'ws',table:'t',primaryKey:'k',record:{x:1,y:'z'}});
 for(const part of ['n','c'])for(let i=0;i<sealed[part].length;i++){
  const copy={...sealed,[part]:new Uint8Array(sealed[part])};copy[part][i]^=1;
  assert.throws(()=>openSt24Row({rowKey,scope:'ws',table:'t',primaryKey:'k',sealed:copy}),/authenticated|Invalid encrypted/);
 }
 for(const bad of [null,{},{v:2,n:sealed.n,c:sealed.c},{v:1,n:new Uint8Array(23),c:sealed.c},{v:1,n:sealed.n,c:new Uint8Array(5)},{v:1,n:'x',c:sealed.c}])
  assert.throws(()=>openSt24Row({rowKey,scope:'ws',table:'t',primaryKey:'k',sealed:bad}),/Invalid encrypted/);
 assert.throws(()=>openSt24Row({rowKey:null,scope:'ws',table:'t',primaryKey:'k',sealed}),/locked/);
});
test('unsupported or oversized values fail closed instead of being silently dropped',async()=>{
 const {rowKey}=await deriveSt24Subkeys(dek());
 assert.throws(()=>sealSt24Row({rowKey,scope:'ws',table:'t',primaryKey:'k',record:{f:()=>1}}),/unsupported/i);
 assert.throws(()=>sealSt24Row({rowKey,scope:'ws',table:'t',primaryKey:'k',record:[1]}),/object/);
 assert.throws(()=>sealSt24Row({rowKey,scope:'',table:'t',primaryKey:'k',record:{}}),/scope/);
 assert.throws(()=>sealSt24Row({rowKey,scope:'ws',table:'bad table',primaryKey:'k',record:{}}),/table/);
});
test('blind index: deterministic, keyed, field/table/scope separated, type-aware, reveals nothing readable',async()=>{
 const {blindKey}=await deriveSt24Subkeys(dek());const other=(await deriveSt24Subkeys(dek())).blindKey;
 const b=v=>blindSt24Value({blindKey,scope:'ws',table:'customers',field:'phone',value:v});
 assert.equal(b('+233201234567'),b('+233201234567'));assert.notEqual(b('+233201234567'),b('+233201234568'));
 assert.match(b('x'),/^b1:[A-Za-z0-9_-]{43}$/);assert.ok(!b('+233201234567').includes('233201'));
 assert.notEqual(b('x'),blindSt24Value({blindKey,scope:'ws',table:'customers',field:'name',value:'x'}));
 assert.notEqual(b('x'),blindSt24Value({blindKey,scope:'ws',table:'suppliers',field:'phone',value:'x'}));
 assert.notEqual(b('x'),blindSt24Value({blindKey,scope:'ws2',table:'customers',field:'phone',value:'x'}));
 assert.notEqual(b('x'),blindSt24Value({blindKey:other,scope:'ws',table:'customers',field:'phone',value:'x'}));
 assert.notEqual(b(0),b('0'));assert.notEqual(b(0),b(-0));
});

test('property insertion order survives the round trip (JSON.stringify comparisons in services depend on it)',async()=>{
 const {rowKey}=await deriveSt24Subkeys(dek());
 const record={id:'r1',z:1,saleAllocations:[{saleId:'s1',amountMinor:5},{amountMinor:6,saleId:'s2'}],a:{y:1,x:2},m:2};
 const back=openSt24Row({rowKey,scope:'ws',table:'t',primaryKey:'r1',sealed:sealSt24Row({rowKey,scope:'ws',table:'t',primaryKey:'r1',record})});
 assert.equal(JSON.stringify(back),JSON.stringify(record));
 assert.deepEqual(Object.keys(back),['id','z','saleAllocations','a','m']);
});
