import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun3MembershipHandler} from '../run3MembershipRoutes.mjs';
function fixture(overrides={}){
  const response={statusCode:0,data:null,headers:{},setHeader(k,v){this.headers[k]=v;},
    status(code){this.statusCode=code;return this;},json(data){this.data=data;return this;}};
  const request={params:{operation:'invite'},socket:{encrypted:true,remoteAddress:'127.0.0.1'},
    body:{companyId:'company',targetUserId:'target'},
    get(k){return ({origin:'https://test.invalid',authorization:'Bearer '+'a'.repeat(64),
      cookie:null})[k]},is:()=> 'application/json',...overrides};
  const calls=[],service={
    async invite(input){calls.push(['invite',input]);return {id:'invitation'};},
    async accept(input){calls.push(['accept',input]);return {role:'attendant'};},
    async revokeMember(input){calls.push(['revokeMember',input]);return {revoked:true};},
    async revokeInvite(input){calls.push(['revokeInvite',input]);return {revoked:true};},
    async listMembers(input){calls.push(['listMembers',input]);return {members:[]};}
  };
  return {request,response,service,calls};
}
test('default disable is 503 and does not invoke mutation service',async()=>{
  const f=fixture();
  await createRun3MembershipHandler({service:f.service})(f.request,f.response);
  assert.equal(f.response.statusCode,503);assert.equal(f.calls.length,0);
});
test('explicitly enabled direct-TLS exact-origin bearer flow dispatches invite',async()=>{
  const f=fixture();
  await createRun3MembershipHandler({service:f.service,enabled:true,
    allowedOrigin:'https://test.invalid',clock:()=>1000})(f.request,f.response);
  assert.equal(f.response.statusCode,200);
  assert.equal(f.calls[0][1].session,'a'.repeat(64));
});
test('missing TLS, cross-origin and cookies all deny before service call',async()=>{
  for(const opts of [
    {socket:{encrypted:false,remoteAddress:'127.0.0.1'}},
    {get:k=>k==='origin'?'https://evil.invalid':k==='authorization'?'Bearer '+'a'.repeat(64):null},
    {get:k=>k==='cookie'?'session=bad':k==='authorization'?'Bearer '+'a'.repeat(64):
      k==='origin'?'https://test.invalid':null}
  ]){
    const f=fixture(opts);
    await createRun3MembershipHandler({service:f.service,enabled:true,
      allowedOrigin:'https://test.invalid',clock:()=>1000})(f.request,f.response);
    assert.equal(f.response.statusCode,403);assert.equal(f.calls.length,0);
  }
});
test('unknown operations and unexpected parameters never reach service',async()=>{
  const f=fixture({body:{companyId:'company',isOwner:true}});
  await createRun3MembershipHandler({service:f.service,enabled:true,
    allowedOrigin:'https://test.invalid',clock:()=>1000})(f.request,f.response);
  assert.equal(f.response.statusCode,400);
  assert.equal(f.calls.length,0);
  const n=fixture({params:{operation:'grantAdmin'}});
  await createRun3MembershipHandler({service:n.service,enabled:true,
    allowedOrigin:'https://test.invalid',clock:()=>1000})(n.request,n.response);
  assert.equal(n.response.statusCode,404);
});
test('rejects denied service actions without exposing SQL or auth details',async()=>{
  const f=fixture();
  f.service.invite=async()=>{throw Error('postgres private error');};
  await createRun3MembershipHandler({service:f.service,enabled:true,
    allowedOrigin:'https://test.invalid',clock:()=>1000})(f.request,f.response);
  assert.equal(f.response.statusCode,403);
  assert.ok(!JSON.stringify(f.response.data).includes('postgres'));
});
test('per-IP throttle denies after twenty requests in one minute',async()=>{
  const f=fixture();
  const handler=createRun3MembershipHandler({service:f.service,enabled:true,
    allowedOrigin:'https://test.invalid',clock:()=>1000});
  for(let i=0;i<21;i++)await handler(f.request,f.response);
  assert.equal(f.response.statusCode,429);
  assert.equal(f.calls.length,20);
});
