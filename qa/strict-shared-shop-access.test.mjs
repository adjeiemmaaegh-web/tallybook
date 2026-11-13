import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mayMountSharedShop} from '../client/src/auth/strictSharedShopAccess.mjs';

test('strict shared shop access never admits a cached or expired account',()=>{
  const now=1_700_000_000_000,expiry=now+60000;
  assert.equal(mayMountSharedShop(true,true,'signed-in',expiry,now),true);
  for(const state of ['checking','signed-out','offline','error','disabled'])
    assert.equal(mayMountSharedShop(true,true,state,expiry,now),false);
  assert.equal(mayMountSharedShop(true,false,'signed-in',expiry,now),false);
  assert.equal(mayMountSharedShop(true,true,'signed-in',now,now),false);
  assert.equal(mayMountSharedShop(true,true,'signed-in',now-1,now),false);
  for(const expiryValue of [null,undefined,NaN,Infinity,'1700000010000'])
    assert.equal(mayMountSharedShop(true,true,'signed-in',expiryValue,now),false);
});
test('legacy standalone shared shop remains controlled by its existing boundaries',()=>{
  assert.equal(mayMountSharedShop(false,false,'offline',null,Date.now()),true);
});
test('actual /shop routing mounts strict guard before the shared shop',()=>{
  const app=readFileSync(new URL('../client/src/App.tsx',import.meta.url),'utf8');
  const gate=readFileSync(new URL('../client/src/auth/StrictSharedShopGate.tsx',import.meta.url),'utf8');
  assert.match(app,/<StrictSharedShopGate><SharedShopPage\s*\/><\/StrictSharedShopGate>/);
  assert.match(gate,/VITE_TALLYBOOK_MANDATORY_ONLINE_AUTH\s*===\s*'true'/);
  assert.match(gate,/useRun4CloudSession\(true,true\)/);
  assert.match(gate,/mayMountSharedShop\(true, online, state.status/);
});
