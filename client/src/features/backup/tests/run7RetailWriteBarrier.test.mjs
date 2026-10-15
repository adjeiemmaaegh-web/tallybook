import test from 'node:test';
import assert from 'node:assert/strict';
import {assertRun7RetailWriteReady} from '../run7RetailWriteBarrier.mjs';
import {RESTORE_JOURNAL_KEY} from '../restoreJournal.mjs';

test('healthy retail IndexedDB metadata allows transaction write',async()=>{
 let checked;
 assert.equal(await assertRun7RetailWriteReady({async get(k){checked=k;return undefined;}}),true);
 assert.equal(checked,RESTORE_JOURNAL_KEY);
});
test('unresolved backup restore marker rejects mutation',async()=>{
 await assert.rejects(assertRun7RetailWriteReady({
  get:async()=>({key:RESTORE_JOURNAL_KEY,value:'journal'})
 }),/requires recovery/);
});
test('unresolved company clear marker rejects mutation',async()=>{
 await assert.rejects(assertRun7RetailWriteReady({
  get:async()=>({key:RESTORE_JOURNAL_KEY,value:'company-clear'})
 }),/requires recovery/);
});
test('corrupt pending marker still rejects without attempting repair',async()=>{
 await assert.rejects(assertRun7RetailWriteReady({get:async()=>'corrupt'}),
  /requires recovery/);
});
test('failure to read IndexedDB metadata propagates and cannot authorize writes',async()=>{
 await assert.rejects(assertRun7RetailWriteReady({
  get:async()=>{throw Error('transaction inactive');}
 }),/transaction inactive/);
});
test('missing or invalid transaction table never becomes a permissive fallback',async()=>{
 await assert.rejects(assertRun7RetailWriteReady(null),/requires the indexed metadata table/);
 await assert.rejects(assertRun7RetailWriteReady({get:false}),/requires the indexed metadata table/);
});
test('explicit null is the only other absence representation, not false/empty marker',async()=>{
 assert.equal(await assertRun7RetailWriteReady({get:async()=>null}),true);
 for(const marker of [false,'',0])await assert.rejects(
  assertRun7RetailWriteReady({get:async()=>marker}),/requires recovery/);
});
