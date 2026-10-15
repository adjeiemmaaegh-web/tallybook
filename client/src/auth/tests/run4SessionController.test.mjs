import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun4SessionController} from '../run4SessionController.mjs';
const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
function fixture(){
  let online=true,now=1000,event=()=>{},activeUser=A,verifiedUser=A,
    token='a'.repeat(32),expiresAt=2000,signOutError=false,unsubscribed=false;
  const queued=[],alarms=[],states=[];
  const auth={
    async getSession(){return {data:{session:activeUser?{
      user:{id:activeUser},access_token:token,expires_at:expiresAt
    }:null},error:null};},
    async getUser(){return {data:{user:verifiedUser?{id:verifiedUser}:null},error:null};},
    onAuthStateChange(cb){event=cb;return {data:{subscription:{
      unsubscribe(){unsubscribed=true;}
    }}};},
    async signOut(){if(signOutError)return {error:Error('failed')};
      activeUser=null;verifiedUser=null;event('SIGNED_OUT',null);return {error:null};}
  };
  const controller=createRun4SessionController({
    auth,clock:()=>now,isOnline:()=>online,
    schedule:fn=>{queued.push(fn);return ()=>{};},
    alarm:(fn,delay)=>{const r={fn,delay,cancelled:false};alarms.push(r);
      return ()=>{r.cancelled=true;};},
    onChange:state=>states.push(state)
  });
  return {auth,controller,states,queued,alarms,
    setOnline:v=>online=v,setNow:v=>now=v,setUser:v=>activeUser=v,
    verifyAs:v=>verifiedUser=v,setToken:v=>token=v,setExpiry:v=>expiresAt=v,
    event:(e)=>event(e,null),signOutFails:()=>signOutError=true,
    unsubscribed:()=>unsubscribed};
}
test('valid getUser + identical session and live expiry grants cloud identity',async()=>{
  const f=fixture(),state=await f.controller.refresh();
  assert.equal(state.status,'signed-in');assert.equal(state.userId,A);
  assert.equal(state.expiresAtEpochMs,2000000);
});
test('unverified cached getSession alone never authorizes',async()=>{
  const f=fixture();f.verifyAs(null);
  assert.equal((await f.controller.refresh()).status,'error');
});
test('account mismatch with validated getUser fails closed',async()=>{
  const f=fixture();f.verifyAs(B);
  assert.equal((await f.controller.refresh()).status,'error');
});
test('expired cached session is rejected before getUser',async()=>{
  const f=fixture();f.setExpiry(1);
  assert.equal((await f.controller.refresh()).status,'signed-out');
});
test('offline never creates a cloud principal from stored browser session',async()=>{
  const f=fixture();f.setOnline(false);
  assert.equal((await f.controller.refresh()).status,'offline');
  assert.equal(f.controller.getSnapshot().userId,null);
});
test('sign-out event invalidates previously verified account synchronously',async()=>{
  const f=fixture();await f.controller.refresh();
  f.controller.authEvent('SIGNED_OUT');
  assert.equal(f.controller.getSnapshot().status,'signed-out');
  assert.equal(f.controller.getSnapshot().userId,null);
});
test('signed-out barrier rejects stale refresh with still-cached token',async()=>{
  const f=fixture();await f.controller.refresh();
  f.controller.authEvent('SIGNED_OUT');
  assert.equal((await f.controller.refresh()).status,'signed-out');
});
test('new signed-in event only restores identity after live verification',async()=>{
  const f=fixture();await f.controller.refresh();
  f.controller.authEvent('SIGNED_OUT');
  f.verifyAs(B);f.controller.authEvent('SIGNED_IN');
  assert.equal((await f.controller.refresh()).status,'error');
});
test('account switch prevents stale owner A result from becoming B principal',async()=>{
  const f=fixture();await f.controller.refresh();
  f.setUser(B);f.verifyAs(B);f.controller.authEvent('SIGNED_IN');
  const next=await f.controller.refresh();
  assert.equal(next.status,'signed-in');assert.equal(next.userId,B);
});
test('session token rotation invalidates in-flight cloud work',async()=>{
  const f=fixture();await f.controller.refresh();
  await assert.rejects(f.controller.runVerified(async()=>{
    f.setToken('b'.repeat(32));return 'old response';
  }),/Verified cloud session required/);
});
test('concurrent sign-out denies an in-flight cloud action response',async()=>{
  const f=fixture();await f.controller.refresh();
  await assert.rejects(f.controller.runVerified(async()=>{
    f.controller.authEvent('SIGNED_OUT');return {secret:'old tenant'};
  }),/Verified cloud session required/);
});
test('successful cloud operation must survive revalidation after work',async()=>{
  const f=fixture();
  assert.equal(await f.controller.runVerified(async({userId})=>userId),A);
});
test('sign-out failure does not reauthorize unverified old cached session',async()=>{
  const f=fixture();await f.controller.refresh();f.signOutFails();
  assert.equal(await f.controller.signOut(),false);
  assert.equal((await f.controller.refresh()).status,'error');
});
test('expiry timer invalidates token before scheduling online revalidation',async()=>{
  const f=fixture();await f.controller.refresh();
  assert.equal(f.alarms.length,1);
  f.alarms[0].fn();
  assert.equal(f.controller.getSnapshot().status,'checking');
  assert.equal(f.queued.length,1);
});
test('auth events require fresh check instead of accepting event session',async()=>{
  const f=fixture();f.controller.start();f.event('INITIAL_SESSION');
  assert.equal(f.controller.getSnapshot().status,'checking');
  assert.ok(f.queued.length>=2);
});
test('stop unsubscribes and future refresh cannot restore an identity',async()=>{
  const f=fixture();f.controller.start();await f.controller.refresh();
  f.controller.stop();assert.equal(f.unsubscribed(),true);
  const before=f.controller.getSnapshot();
  await f.controller.refresh();assert.equal(f.controller.getSnapshot(),before);
});
test('old delayed getUser result cannot override later sign-out',async()=>{
  const f=fixture();let resolve;
  f.auth.getUser=()=>new Promise(r=>{resolve=r;});
  const request=f.controller.refresh();
  await Promise.resolve();await Promise.resolve();
  f.controller.authEvent('SIGNED_OUT');
  resolve({data:{user:{id:A}},error:null});
  await request;
  assert.equal(f.controller.getSnapshot().status,'signed-out');
});
test('never reads or writes a legacy offline account authorization marker',async()=>{
  const f=fixture();await f.controller.refresh();
  assert.equal(f.controller.getSnapshot().status,'signed-in');
  assert.equal(Object.keys(f.controller.getSnapshot()).includes('accessToken'),false);
});
