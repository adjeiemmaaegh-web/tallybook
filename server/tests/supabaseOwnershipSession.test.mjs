import test from 'node:test';
import assert from 'node:assert/strict';
import {createSupabaseOwnershipSessionResolver,createPostgresAuthSessionReader} from '../supabaseOwnershipSession.mjs';
const userId='11111111-1111-4111-8111-111111111111';
const sid='22222222-2222-4222-8222-222222222222';
function token(part={}){
  const header=Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT'})).toString('base64url');
  const payload=Buffer.from(JSON.stringify({
    sub:userId,session_id:sid,role:'authenticated',aud:'authenticated',exp:3600,...part,
  })).toString('base64url');
  return header+'.'+payload+'.'+'a'.repeat(64);
}
function fixture(){
  let active=true;
  const calls=[];
  const authClient={auth:{async getUser(access){calls.push(['auth',access]);return {data:{user:{id:userId}},error:null};}}};
  const sessionReader={async isSessionActive(sessionId,user,now){calls.push(['session',sessionId,user,now]);return active;}};
  const resolver=createSupabaseOwnershipSessionResolver({authClient,sessionReader,clock:()=>1000});
  return {resolver,calls,setActive:v=>active=v};
}
test('server-verified Supabase account must have active authoritative auth.session',async()=>{
  const f=fixture();
  const result=await f.resolver(token());
  assert.deepEqual(result,{userId,sessionId:sid,active:true,expiresAtEpochMs:3600000});
  assert.equal(f.calls[0][0],'auth');
  assert.deepEqual(f.calls[1],['session',sid,userId,1000]);
});
test('revoked session is denied even when getUser still succeeds',async()=>{
  const f=fixture();f.setActive(false);
  await assert.rejects(f.resolver(token()),/not authorized/);
});
test('unverified token, wrong subject, role, audience and expiry deny',async()=>{
  const f=fixture();
  for(const claims of [{sub:sid},{session_id:'forged'},{role:'service_role'},{aud:'other'},
    {exp:0},{exp:-1},{exp:Number.MAX_SAFE_INTEGER}]){
    await assert.rejects(f.resolver(token(claims)),/not authorized/);
  }
  await assert.rejects(f.resolver('not-a-token'),/not authorized/);
  await assert.rejects(f.resolver(null),/not authorized/);
});
test('getUser failure and unavailable session registry fail closed',async()=>{
  const f=fixture();const errorClient={auth:{async getUser(){return {data:{user:null},error:Error('failed')}}}};
  const resolver=createSupabaseOwnershipSessionResolver({
    authClient:errorClient,sessionReader:{isSessionActive:async()=>true},clock:()=>1000});
  await assert.rejects(resolver(token()),/not authorized/);
  const throwing=createSupabaseOwnershipSessionResolver({
    authClient:{auth:{getUser:async()=>({data:{user:{id:userId}}})}},
    sessionReader:{isSessionActive:async()=>{throw Error('offline');}},clock:()=>1000});
  await assert.rejects(throwing(token()),/not authorized/);
});
test('private database reader uses parameterized auth.sessions lookup',async()=>{
  const calls=[];
  const reader=createPostgresAuthSessionReader({async query(sql,values){
    calls.push({sql,values});return {rows:[{active:true}]};
  }});
  assert.equal(await reader.isSessionActive(sid,userId,1000),true);
  assert.equal(calls.length,1);
  assert.ok(calls[0].sql.includes('auth.sessions'));
  assert.deepEqual(calls[0].values,[sid,userId,1000]);
  assert.equal(await reader.isSessionActive('other',userId,1000),false);
  assert.equal(calls.length,1);
});
test('missing trusted authentication dependencies reject at construction',()=>{
  assert.throws(()=>createSupabaseOwnershipSessionResolver({}),/not authorized/);
  assert.throws(()=>createPostgresAuthSessionReader(null),/not authorized/);
});

test('verified token expiry is carried into the privileged transaction context',async()=>{
  const f=fixture();
  const result=await f.resolver(token({exp:2}));
  assert.equal(result.expiresAtEpochMs,2000);
});
