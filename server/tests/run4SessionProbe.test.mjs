import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRun4SessionProbe,installRun4SessionProbe} from '../run4SessionProbe.mjs';
const sid='11111111-1111-4111-8111-111111111111';
function make({tls=true,origin='https://test.invalid',cookie=null,
  authorization='Bearer '+'a'.repeat(64),resolver=async()=>({
    active:true,userId:sid,expiresAtEpochMs:5000000
  })}={}){
 const req={socket:{encrypted:tls},get:k=>({
  origin,authorization,cookie})[k]};
 const res={statusCode:0,data:null,headers:{},setHeader(k,v){this.headers[k]=v;},
  status(c){this.statusCode=c;return this;},json(d){this.data=d;return this;}};
 return {req,res,resolver};
}
test('unconfigured session probe is fail-closed',async()=>{
 const h=make();await makeRun4SessionProbe()(h.req,h.res);
 assert.equal(h.res.statusCode,503);
});
test('verified Supabase principal returns minimal non-cacheable proof',async()=>{
 const h=make();await makeRun4SessionProbe({resolver:h.resolver,enabled:true,
  allowedOrigin:'https://test.invalid'})(h.req,h.res);
 assert.equal(h.res.statusCode,200);
 assert.equal(h.res.data.userId,sid);
 assert.equal(h.res.headers['Cache-Control'],'no-store');
 assert.equal(Object.keys(h.res.data).length,3);
});
test('missing direct TLS or foreign Origin is rejected before resolver',async()=>{
 for(const options of [{tls:false},{origin:'https://foreign.invalid'},{cookie:'session=bad'}]){
  let calls=0;
  const h=make({...options,resolver:async()=>{calls++;return {active:true};}});
  await makeRun4SessionProbe({resolver:h.resolver,enabled:true,
    allowedOrigin:'https://test.invalid'})(h.req,h.res);
  assert.equal(h.res.statusCode,403);assert.equal(calls,0);
 }
});
test('invalid bearer credential rejects before private auth call',async()=>{
 let calls=0;
 const h=make({authorization:'Bearer empty',resolver:async()=>{calls++;}});
 await makeRun4SessionProbe({resolver:h.resolver,enabled:true,
  allowedOrigin:'https://test.invalid'})(h.req,h.res);
 assert.equal(h.res.statusCode,403);assert.equal(calls,0);
});
test('revoked private Supabase session is never treated as active',async()=>{
 const h=make({resolver:async()=>{throw Error('auth.sessions row missing');}});
 await makeRun4SessionProbe({resolver:h.resolver,enabled:true,
  allowedOrigin:'https://test.invalid'})(h.req,h.res);
 assert.equal(h.res.statusCode,403);
 assert.equal(JSON.stringify(h.res.data).includes('auth.sessions'),false);
});
test('server requires an independently wired private pool before enablement',()=>{
 const app={post:()=>{}};
 assert.throws(()=>installRun4SessionProbe({app,enabled:true}),/not configured/);
});
