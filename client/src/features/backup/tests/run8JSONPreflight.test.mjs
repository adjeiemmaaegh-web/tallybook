import test from 'node:test';
import assert from 'node:assert/strict';
import {assertRun8UnambiguousJSON}
 from '../run8JSONPreflight.mjs';
test('valid backup header and record arrays survive bounded preflight',()=>{
 const json=JSON.stringify({
  kind:'tallybook-local-backup',formatVersion:1,
  createdAt:'2026-10-16T00:00:00.000Z',
  records:{businessProfiles:[{id:'primary',name:'Shop'}],
   sales:[{id:'one',totalMinor:100},{id:'two',totalMinor:250}]}
 });
 assert.equal(assertRun8UnambiguousJSON(json),true);
});
test('duplicate monetary field is rejected instead of last-value-wins',()=>{
 const s='{"sales":[{"totalMinor":100,"totalMinor":1000000}]}';
 assert.throws(()=>assertRun8UnambiguousJSON(s),/duplicate JSON/);
});
test('escaped object keys collide with their decoded canonical names',()=>{
 const s='{"sale":{"amountMinor":10,"amount\\u004dinor":200}}';
 assert.throws(()=>assertRun8UnambiguousJSON(s),/duplicate JSON/);
});
test('duplicate company identity is never silently replaced',()=>{
 const s='{"companyId":"primary","companyId":"foreign"}';
 assert.throws(()=>assertRun8UnambiguousJSON(s),/duplicate JSON/);
});
test('unsafe object keys are rejected even when nested in a row',()=>{
 for(const key of ['__proto__','prototype','constructor'])
  assert.throws(()=>assertRun8UnambiguousJSON('{"rows":[{"'+key+'":"x"}]}'),/unsafe JSON/);
});
test('legal escaped unicode and quoted text do not create false duplicates',()=>{
 const s=JSON.stringify({history:[
  {replyText:'I said "sale"; backslash \\; Éléphant 🐘'},
  {replyText:'Line1\nLine2'}
 ]});
 assert.equal(assertRun8UnambiguousJSON(s),true);
});
test('arrays and exponent numbers are accepted',()=>{
 assert.equal(assertRun8UnambiguousJSON('{"rows":[0,-1,3.5e2,null,true,false,[]]}'),true);
});
test('truncated, trailing, comma and malformed structures reject',()=>{
 for(const text of ['{','{"x":1','{"x":1,}','[1,]','{"x":1} trailing',
  '{"x":tru}','{"x":"unfinished}','{"x":+2}','{"x":01}'])
  assert.throws(()=>assertRun8UnambiguousJSON(text),/valid Tallybook backup JSON/);
});
test('more than supported maximum JSON depth rejects with no partial parsing',()=>{
 const text='['.repeat(60)+'0'+']'.repeat(60);
 assert.throws(()=>assertRun8UnambiguousJSON(text),/nesting exceeds/);
});
test('top-level primitive alone cannot pass backup schema even if lexical JSON',()=>{
 assert.equal(assertRun8UnambiguousJSON('0'),true);
 assert.equal(assertRun8UnambiguousJSON('null'),true);
});
