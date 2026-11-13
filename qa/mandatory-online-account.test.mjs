import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {mayOpenCachedOfflineLedger} from '../client/src/auth/mandatoryOnlineAccountPolicy.mjs';

test('strict account mode never admits a cached owner, even when verified before',()=>{
  for(const proof of [true,false,null,undefined,'true',1])
    assert.equal(mayOpenCachedOfflineLedger(true,proof),false);
});

test('standalone offline use only accepts exact prior verified owner proof',()=>{
  assert.equal(mayOpenCachedOfflineLedger(false,true),true);
  for(const proof of [false,null,undefined,'true',1])
    assert.equal(mayOpenCachedOfflineLedger(false,proof),false);
});

test('missing or mistyped deployment mode fails closed',()=>{
  for(const value of [undefined,null,'false','true',0,1])
    assert.equal(mayOpenCachedOfflineLedger(value,true),false);
});

test('actual device gate denies cached offline return in mandatory mode',()=>{
  const gate=readFileSync(new URL('../client/src/auth/FriendsTestGate.tsx',import.meta.url),'utf8');
  assert.match(gate,/VITE_TALLYBOOK_MANDATORY_ONLINE_AUTH\s*===\s*'true'/);
  assert.match(gate,/if\(mandatoryOnlineAccountMode\)\{setAccess\(\{userId:null,status:'offline'\}\);return;\}/);
  assert.match(gate,/mayOpenCachedOfflineLedger\(mandatoryOnlineAccountMode,true\)/);
  assert.match(gate,/if\(mandatoryOnlineAccountMode\)void retry\(\)/);
  const device=readFileSync(new URL('../client/src/auth/deviceEntry.ts',import.meta.url),'utf8');
  assert.match(device,/VITE_TALLYBOOK_MANDATORY_ONLINE_AUTH\s*===\s*'true'/);
  const env=readFileSync(new URL('../.env.example',import.meta.url),'utf8');
  assert.match(env,/VITE_TALLYBOOK_MANDATORY_ONLINE_AUTH=false/);
});
