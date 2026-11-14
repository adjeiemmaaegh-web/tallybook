import test from 'node:test';
import assert from 'node:assert/strict';
import { retirePriorBrowserData } from '../client/src/auth/freshStartReset.mjs';

function storage(entries={}) {
  const m = new Map(Object.entries(entries));
  return { m, clear() { m.clear(); }, getItem(k) { return m.get(k) ?? null; },
    setItem(k,v) { m.set(k,String(v)); } };
}
function fixture({blocked=false,failCache=false}={}) {
  const local=storage({'supabase.auth.token':'old-token', 'tallybook.workspace':'old'});
  const session=storage({'tallybook.workspace.tab.v1':'old-owner'});
  const deleted=[], removed=[], unregistered=[];
  const databaseFactory={
    async databases(){ return [{name:'tallybook-db'},{name:'tallybook-secure'},{name:'tallybook-db:owner:old'}]; },
    deleteDatabase(name) {
      deleted.push(name);
      const request={};
      queueMicrotask(()=>blocked ? request.onblocked?.() : request.onsuccess?.());
      return request;
    }
  };
  const cacheStore={async keys(){return ['workbox-v1','old-cached-data'];},
    async delete(name){removed.push(name);return !failCache;}};
  const workerContainer={async getRegistrations(){return [{unregister:async()=>{unregistered.push('worker');return true;}}];}};
  const run = (epoch='2026-11-14-fresh-start')=>retirePriorBrowserData({
    epoch,local,session,databaseFactory,cacheStore,workerContainer,mandatoryOnlineAuth:true
  });
  return {local,session,deleted,removed,unregistered,run,databaseFactory};
}
test('no reset unless explicitly requested; rejects invalid epoch and non-strict mode',async()=>{
  const f=fixture();
  assert.equal(await retirePriorBrowserData({epoch:'',local:f.local}), 'not-requested');
  await assert.rejects(retirePriorBrowserData({epoch:'bad',mandatoryOnlineAuth:true}),/Invalid/);
  await assert.rejects(retirePriorBrowserData({epoch:'2026-11-14-fresh-start', mandatoryOnlineAuth:false}),/requires mandatory/);
  assert.equal(f.local.getItem('supabase.auth.token'),'old-token');
});
test('retires all discovered original and per-owner databases, caches, tabs, and tokens once',async()=>{
  const f=fixture();
  assert.equal(await f.run(),'cleared');
  assert.deepEqual(f.deleted,['tallybook-db','tallybook-secure','tallybook-db:owner:old']);
  assert.deepEqual(f.removed,['workbox-v1','old-cached-data']);
  assert.deepEqual(f.unregistered,['worker']);
  assert.equal(f.local.getItem('supabase.auth.token'),null);
  assert.equal(f.session.getItem('tallybook.workspace.tab.v1'),null);
  assert.equal(f.local.getItem('tallybook.fresh-start.completed:2026-11-14-fresh-start'),'complete');
  assert.equal(await f.run(),'already-complete');
  assert.equal(f.deleted.length,3);
});
test('blocked prior tabs fail closed and do not commit the completion marker',async()=>{
  const f=fixture({blocked:true});
  await assert.rejects(f.run(),/Close other tabs/);
  assert.equal(f.local.getItem('tallybook.fresh-start.completed:2026-11-14-fresh-start'),null);
});
test('failed cache deletion cannot mark incomplete retirement successful',async()=>{
  const f=fixture({failCache:true});
  await assert.rejects(f.run(),/Unable to retire previous Tallybook cache/);
  assert.equal(f.local.getItem('tallybook.fresh-start.completed:2026-11-14-fresh-start'),null);
});
test('browser database enumeration must be available; no fallback guesses',async()=>{
  const f=fixture(); f.databaseFactory.databases=undefined;
  await assert.rejects(f.run(),/cannot safely enumerate/);
  assert.equal(f.local.getItem('supabase.auth.token'),'old-token');
});
