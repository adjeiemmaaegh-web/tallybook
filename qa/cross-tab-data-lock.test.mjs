import test from 'node:test';
import assert from 'node:assert/strict';
import { withCrossTabDataLock, TWO_DATABASE_LOCK_NAME } from '../client/src/features/backup/crossTabDataLock.mjs';

function manager() {
  const held = new Map();
  return {
    async request(name, options, fn) {
      assert.equal(name, TWO_DATABASE_LOCK_NAME);
      assert.equal(options.ifAvailable, true);
      let state=held.get(name);
      if (!state) {state={readers:0,writer:false};held.set(name,state);}
      if (state.writer || (options.mode==='exclusive' && state.readers)) return fn(null);
      if (options.mode==='shared') state.readers++;else state.writer=true;
      try { return await fn({ name, mode:options.mode }); }
      finally {
        if(options.mode==='shared') state.readers--;else state.writer=false;
        if(!state.writer&&!state.readers) held.delete(name);
      }
    },
  };
}

test('Web Locks serialize cross-tab destructive actions and reject competing assistant writes', async () => {
  const locks=manager();
  let release;
  const barrier=new Promise(resolve => {release=resolve;});
  let entered;
  const hasEntered=new Promise(resolve => {entered=resolve;});
  const running=withCrossTabDataLock('exclusive',async () => {entered();await barrier;return 'committed';},locks);
  await hasEntered;
  let didWrite=false;
  await assert.rejects(withCrossTabDataLock('shared',()=>{didWrite=true;},locks),/another tab/i);
  await assert.rejects(withCrossTabDataLock('exclusive',()=>{didWrite=true;},locks),/another tab/i);
  assert.equal(didWrite,false);
  release();
  assert.equal(await running,'committed');
  assert.equal(await withCrossTabDataLock('shared',()=> 'new write',locks),'new write');
});

test('shared assistant writers can coexist but exclude concurrent recovery', async () => {
  const locks=manager();
  let release;
  const barrier=new Promise(resolve => {release=resolve;});
  let entered;
  const ready=new Promise(resolve => {entered=resolve;});
  const first=withCrossTabDataLock('shared',async()=>{entered();await barrier;},locks);
  await ready;
  assert.equal(await withCrossTabDataLock('shared',()=>17,locks),17);
  await assert.rejects(withCrossTabDataLock('exclusive',()=> 'never',locks),/another tab/i);
  release();await first;
  assert.equal(await withCrossTabDataLock('exclusive',()=>18,locks),18);
});

test('an exception always releases the exclusive lock for a retry', async () => {
  const locks=manager();
  await assert.rejects(withCrossTabDataLock('exclusive',()=>{throw new Error('simulated db abort');},locks),/simulated db abort/);
  assert.equal(await withCrossTabDataLock('exclusive',()=> 'retry ok',locks),'retry ok');
});

test('unsupported browsers fail closed for destructive operations but retain normal offline assistant writes', async () => {
  await assert.rejects(withCrossTabDataLock('exclusive',()=>true,null),/Web Locks support/);
  assert.equal(await withCrossTabDataLock('shared',()=> 'offline local',null),'offline local');
});

test('rejects invalid lock operations before any side effects', async () => {
  const locks=manager();let called=false;
  await assert.rejects(withCrossTabDataLock('upgrade',()=> {called=true;},locks),/Invalid two-database lock/);
  await assert.rejects(withCrossTabDataLock('shared',null,locks),/Invalid two-database lock/);
  assert.equal(called,false);
});
