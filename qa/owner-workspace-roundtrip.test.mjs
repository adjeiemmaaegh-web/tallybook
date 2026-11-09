import test from 'node:test';
import assert from 'node:assert/strict';

test('private workspace switch and original-ledger return preserve distinct device records', async t => {
  const storage = () => {
    const values = new Map();
    return {getItem: key => values.get(key) ?? null, setItem: (key,value) => values.set(key,value),
      removeItem: key => values.delete(key)};
  };
  const local = storage(), session = storage(), navigations = [];
  const globals = {localStorage:local, sessionStorage:session,
    window:{location:{reload:()=>navigations.push('reload'), assign:path=>navigations.push(path)}}};
  for (const [key,value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{value,configurable:true});
    t.after(() => original ? Object.defineProperty(globalThis,key,original) : delete globalThis[key]);
  }
  let boot = 0;
  const reopen = () => import('../client/src/auth/ownerWorkspace.ts?boot='+ ++boot);
  const original = await reopen();
  const key = 'ledger-test';
  local.setItem(original.workspaceKey(key),'original');
  original.openPrivateWorkspace('owner-a');
  assert.equal(original.workspaceKey(key),key);
  const a = await reopen();
  local.setItem(a.workspaceKey(key),'private A');
  a.openPrivateWorkspace('owner-b');
  const b = await reopen();
  assert.equal(local.getItem(b.workspaceKey(key)),null);
  local.setItem(b.workspaceKey(key),'private B');
  b.revisitOriginalLedger('owner-b');
  const back = await reopen();
  assert.equal(local.getItem(back.workspaceKey(key)),'original');
  assert.equal(back.preferredWorkspace('owner-b'),null);
  back.switchWorkspace(back.preferredWorkspace('owner-a'));
  const again = await reopen();
  assert.equal(again.workspaceOwner,'owner-a');
  assert.equal(local.getItem(again.workspaceKey(key)),'private A');
  assert.equal(local.getItem(b.workspaceKey(key)),'private B');
  assert.deepEqual(navigations,['reload','reload','/','reload']);
});
