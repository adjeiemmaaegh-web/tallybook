import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeSt24Clone,decodeSt24Clone,canonicalSt24CloneJson}
 from '../client/src/features/security/st24CloneCodec.mjs';
test('ST24 clone: preserves money BigInts, NaN, negative zero, Date and undefined',()=>{
 const row={id:'sale-1',amountMinor:1234,total:42n,when:new Date('2026-11-20T01:00:00.000Z'),
  extra:undefined,missingDecimal:NaN,negativeZero:-0};
 const copy=decodeSt24Clone(encodeSt24Clone(row));
 assert.equal(copy.id,'sale-1');assert.equal(copy.amountMinor,1234);
 assert.equal(copy.total,42n);assert.equal(copy.when.toISOString(),row.when.toISOString());
 assert.equal(Object.hasOwn(copy,'extra'),true);assert.equal(copy.extra,undefined);
 assert.equal(Number.isNaN(copy.missingDecimal),true);assert.equal(Object.is(copy.negativeZero,-0),true);
 assert.equal(canonicalSt24CloneJson(row),canonicalSt24CloneJson(copy));
});
test('ST24 clone: copies binary, typed views, Map, Set and nested index arrays',()=>{
 const value={bytes:new Uint8Array([1,2,255]),f32:new Float32Array([3.5,-5.25]),
  data:new DataView(Uint8Array.from([12,13,14]).buffer),
  pair:['company',55],values:new Map([['key',new Set(['x','y'])]])};
 const copy=decodeSt24Clone(encodeSt24Clone(value));
 assert.deepEqual([...copy.bytes],[1,2,255]);assert.deepEqual([...copy.f32],[3.5,-5.25]);
 assert.deepEqual([...new Uint8Array(copy.data.buffer)],[12,13,14]);
 assert.deepEqual([...copy.values.get('key')],['x','y']);
 assert.equal(canonicalSt24CloneJson(copy),canonicalSt24CloneJson(value));
});
test('ST24 clone: stable digest inputs independent of object insertion order',()=>{
 assert.equal(canonicalSt24CloneJson({b:{z:3,a:1},a:2}),canonicalSt24CloneJson({a:2,b:{a:1,z:3}}));
});
test('ST24 clone: unsafe object keys, accessors, cycles, sparse arrays and unsupported types fail closed',()=>{
 const cycle={id:1};cycle.self=cycle;
 const accessor={};Object.defineProperty(accessor,'amountMinor',{get(){throw Error('must not run getter');},enumerable:true});
 for(const value of [cycle,{unsafe:JSON.parse('{"__proto__":{"admin":true}}')},accessor,
  {date:new Date('invalid')},[1,,3],{event:()=>{}}]){
  assert.throws(()=>encodeSt24Clone(value),/ST24 clone codec/);
 }
 assert.throws(()=>decodeSt24Clone(['tallybook-st24-tagged-v1','object',[['__proto__',1]]]),/ST24 clone codec/);
});
test('ST24 clone: corrupted tags, typed lengths and ordering rejected',()=>{
 for(const bad of [
  ['tallybook-st24-tagged-v1','typed','Float64Array','AQ'],
  ['tallybook-st24-tagged-v1','object',[['z',1],['a',1]]],
  ['tallybook-st24-tagged-v1','bigint','0001'],
  ['tallybook-st24-tagged-v1','date','2026-02-30T00:00:00.000Z']
 ])assert.throws(()=>decodeSt24Clone(bad),/ST24 clone codec/);
});
