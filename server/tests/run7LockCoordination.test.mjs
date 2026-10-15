import test from 'node:test';
import assert from 'node:assert/strict';
import {withCrossTabDataLock,TWO_DATABASE_LOCK_NAME}
  from '../../client/src/features/backup/crossTabDataLock.mjs';
import {withRetailWriteLock}
  from '../../client/src/features/backup/retailWriteLock.mjs';

function fakeManager(){
 const holders=[];
 const requests=[];
 return{
  holders,requests,
  async request(name,options,work){
   assert.equal(name,TWO_DATABASE_LOCK_NAME);
   requests.push(options);
   const collision=holders.some(h=>h.mode==='exclusive'||options.mode==='exclusive');
   if(collision)return work(null);
   const token={mode:options.mode};
   holders.push(token);
   try{return await work(token);}
   finally{holders.splice(holders.indexOf(token),1);}
  }
 };
}
function deferred(){
 let resolve;
 const promise=new Promise(r=>{resolve=r;});
 return {promise,resolve};
}
test('shared assistant and retail writes use the same fixed origin-wide name',async()=>{
 const manager=fakeManager();
 let calls=0;
 await withCrossTabDataLock('shared',async()=>{calls++;},manager);
 await withRetailWriteLock(async()=>{calls++;},false,manager);
 assert.equal(calls,2);
 assert.equal(manager.requests.length,2);
 assert.ok(manager.requests.every(v=>v.mode==='shared'&&v.ifAvailable===true));
});
test('a pending exclusive crash restore blocks an ordinary shared writer',async()=>{
 const manager=fakeManager(),gate=deferred();
 const exclusive=withCrossTabDataLock('exclusive',()=>gate.promise,manager);
 await assert.rejects(withRetailWriteLock(()=>true,false,manager),/Another tab/);
 gate.resolve();await exclusive;
});
test('a pending retail write blocks restore before any operation begins',async()=>{
 const manager=fakeManager(),gate=deferred();
 const writer=withRetailWriteLock(()=>gate.promise,false,manager);
 let touched=false;
 await assert.rejects(withCrossTabDataLock('exclusive',()=>{touched=true;},manager),/Another tab/);
 assert.equal(touched,false);
 gate.resolve();await writer;
});
test('two independent assistant writes can hold compatible shared locks',async()=>{
 const manager=fakeManager(),gate=deferred();
 const writer=withCrossTabDataLock('shared',()=>gate.promise,manager);
 assert.equal(await withCrossTabDataLock('shared',()=>23,manager),23);
 gate.resolve();await writer;
});
test('a backup export exclusive lock blocks unrelated assistant edits',async()=>{
 const manager=fakeManager(),gate=deferred();
 const backup=withCrossTabDataLock('exclusive',()=>gate.promise,manager);
 await assert.rejects(withCrossTabDataLock('shared',()=>{throw Error('should not run');},manager),/Another tab/);
 gate.resolve();await backup;
});
test('without Web Locks, destructive multi-database operations fail shut',async()=>{
 let called=false;
 await assert.rejects(withCrossTabDataLock('exclusive',()=>{called=true;},null),/Web Locks/);
 assert.equal(called,false);
});
test('without Web Locks, ordinary local retail writes remain available',async()=>{
 assert.equal(await withCrossTabDataLock('shared',()=>17,null),17);
});
test('nested retail work avoids waiting for a second lock inside a Dexie transaction',async()=>{
 let calls=0;
 const manager={request(){calls++;throw Error('nested lock invalid');}};
 assert.equal(await withRetailWriteLock(()=>31,true,manager),31);
 assert.equal(calls,0);
});
test('invalid lock mode is never downgraded to shared',async()=>{
 await assert.rejects(withCrossTabDataLock('update',()=>true,fakeManager()),/Invalid/);
});
test('lock released after rejected work so another restore can retry',async()=>{
 const manager=fakeManager();
 await assert.rejects(withCrossTabDataLock('exclusive',async()=>{throw Error('crash');},manager),/crash/);
 assert.equal(manager.holders.length,0);
 assert.equal(await withCrossTabDataLock('exclusive',()=>12,manager),12);
});
test('conflicted work never starts after lock denial',async()=>{
 const manager=fakeManager(),gate=deferred();let executed=0;
 const active=withCrossTabDataLock('exclusive',()=>gate.promise,manager);
 await assert.rejects(withRetailWriteLock(()=>{executed++;},false,manager),/Another tab/);
 assert.equal(executed,0);
 gate.resolve();await active;
});
