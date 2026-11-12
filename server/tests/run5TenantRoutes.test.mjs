import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun5TenantRoute} from '../run5TenantRoutes.mjs';
const tenant='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function fixture(overrides={}){
 const calls=[],input={reportId:'known'};
 const req={params:{operation:'reportsRead'},body:{companyId:tenant,input},
  socket:{encrypted:true,remoteAddress:'127.0.0.1'},
  get:k=>({origin:'https://test.invalid',authorization:'Bearer '+'a'.repeat(32),cookie:null})[k],
  is:()=>true,...overrides};
 const res={statusCode:0,body:null,headers:{},setHeader(k,v){this.headers[k]=v;},
  status(code){this.statusCode=code;return this;},
  json(x){this.body=x;return this;}};
 const authorizer={authorize:async(input,run)=>{calls.push(input);
  return run({scoped:true},{companyId:tenant,userId:'owner',role:'owner',action:input.action});}};
 const operations={reportsRead:({ctx})=>({companyId:ctx.companyId,result:'ok'})};
 return {req,res,calls,authorizer,operations};
}
test('tenant routes remain disabled until independently configured',async()=>{
 const f=fixture();
 await createRun5TenantRoute()(f.req,f.res);
 assert.equal(f.res.statusCode,503);
});
test('authorized private report read receives only scoped transaction context',async()=>{
 const f=fixture();
 await createRun5TenantRoute({enabled:true,authorizer:f.authorizer,
   operations:f.operations,origin:'https://test.invalid',clock:()=>1000})(f.req,f.res);
 assert.equal(f.res.statusCode,200);assert.equal(f.res.body.companyId,tenant);
 assert.equal(f.calls[0].action,'reports:read');
 assert.equal(f.calls[0].companyId,tenant);
});
test('unknown or missing operation never invokes authorizer',async()=>{
 for(const op of ['unknown','financeWrite']){
  const f=fixture({params:{operation:op}});
  await createRun5TenantRoute({enabled:true,authorizer:f.authorizer,
   operations:f.operations,origin:'https://test.invalid',clock:()=>1000})(f.req,f.res);
  assert.equal(f.res.statusCode,op==='unknown'?404:503);
  assert.equal(f.calls.length,0);
 }
});
test('foreign origin, disabled TLS or cookies deny before DB lookup',async()=>{
 for(const override of [
  {socket:{encrypted:false,remoteAddress:'127.0.0.1'}},
  {get:k=>k==='origin'?'https://evil.invalid':k==='authorization'?'Bearer '+'a'.repeat(32):null},
  {get:k=>k==='cookie'?'session=bad':k==='origin'?'https://test.invalid':
    k==='authorization'?'Bearer '+'a'.repeat(32):null}
 ]){
  const f=fixture(override);
  await createRun5TenantRoute({enabled:true,authorizer:f.authorizer,
   operations:f.operations,origin:'https://test.invalid',clock:()=>1000})(f.req,f.res);
  assert.equal(f.res.statusCode,403);assert.equal(f.calls.length,0);
 }
});
test('invalid tenant and request fields are denied without operations',async()=>{
 for(const body of [{companyId:'primary'}, {companyId:tenant,role:'owner'},
   {companyId:tenant,input:[]}]){
  const f=fixture({body});
  await createRun5TenantRoute({enabled:true,authorizer:f.authorizer,
   operations:f.operations,origin:'https://test.invalid',clock:()=>1000})(f.req,f.res);
  assert.equal(f.res.statusCode,400);assert.equal(f.calls.length,0);
 }
});
test('authorization rejection has generic error with no sensitive details',async()=>{
 const f=fixture();
 f.authorizer.authorize=async()=>{throw Error('private schema SQL error');};
 await createRun5TenantRoute({enabled:true,authorizer:f.authorizer,
  operations:f.operations,origin:'https://test.invalid',clock:()=>1000})(f.req,f.res);
 assert.equal(f.res.statusCode,403);
 assert.ok(!JSON.stringify(f.res.body).includes('SQL'));
});
test('per-address rate limit blocks repeated service calls',async()=>{
 const f=fixture();
 const handler=createRun5TenantRoute({enabled:true,authorizer:f.authorizer,
  operations:f.operations,origin:'https://test.invalid',clock:()=>1000});
 for(let i=0;i<21;i++)await handler(f.req,f.res);
 assert.equal(f.res.statusCode,429);assert.equal(f.calls.length,20);
});
test('every resource category requires an injected trusted operation',async()=>{
 for(const operation of ['companyRead','membershipRead','reportsRead',
   'backupRead','backupWrite','importsWrite','exportsRead','assistantRead',
   'financeRead','financeWrite','syncRead','syncWrite']){
  const f=fixture({params:{operation}});
  f.operations[operation]=({ctx})=>({action:ctx.action});
  await createRun5TenantRoute({enabled:true,authorizer:f.authorizer,
   operations:f.operations,origin:'https://test.invalid',clock:()=>1000})(f.req,f.res);
  assert.equal(f.res.statusCode,200);
  assert.equal(f.res.body.action,f.calls[0].action);
 }
});


test('nested foreign company references are rejected before authorization and DB lookup',async()=>{
 for(const input of [
  {cart:{companyId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}},
  {rows:[{company_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}]},
  {collection:{tenantId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}},
  {items:[{details:{businessId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}}]},
  JSON.parse('{"constructor":{"companyId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}}'),
  JSON.parse('{"__proto__":{"safe":true}}'),
 ]){
  const f=fixture({body:{companyId:tenant,input}});
  await createRun5TenantRoute({enabled:true,authorizer:f.authorizer,
   operations:f.operations,origin:'https://test.invalid',clock:()=>1000})(f.req,f.res);
  assert.equal(f.res.statusCode,400);
  assert.equal(f.calls.length,0);
 }
});
test('same-company nested input is accepted and reaches only scoped operation',async()=>{
 const f=fixture({body:{companyId:tenant,input:{
  items:[{businessId:tenant,details:{company_id:tenant}}],
  number:17,from:'2026-11-13'
 }}});
 let supplied=null;
 f.operations.reportsRead=({input})=>{supplied=input;return {companyId:tenant,count:1};};
 await createRun5TenantRoute({enabled:true,authorizer:f.authorizer,
  operations:f.operations,origin:'https://test.invalid',clock:()=>1000})(f.req,f.res);
 assert.equal(f.res.statusCode,200);
 assert.equal(supplied.items[0].businessId,tenant);
});
test('wrong or absent transaction-bound context blocks operations',async()=>{
 for(const altered of [{companyId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'},{action:'finance:write'},null]){
  const f=fixture();let called=false;
  f.authorizer.authorize=async(_args,run)=>run({scoped:true},altered);
  f.operations.reportsRead=()=>{called=true;return {companyId:tenant};};
  await createRun5TenantRoute({enabled:true,authorizer:f.authorizer,
   operations:f.operations,origin:'https://test.invalid',clock:()=>1000})(f.req,f.res);
  assert.equal(f.res.statusCode,403);assert.equal(called,false);
 }
});
test('foreign response metadata cannot leak from an otherwise authorized operation',async()=>{
 const f=fixture();f.operations.reportsRead=()=>({
  companyId:tenant,records:[{details:{organizationId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',secret:'another business'}}]
 });
 await createRun5TenantRoute({enabled:true,authorizer:f.authorizer,
  operations:f.operations,origin:'https://test.invalid',clock:()=>1000})(f.req,f.res);
 assert.equal(f.res.statusCode,403);
 assert.ok(!JSON.stringify(f.res.body).includes('another business'));
});
test('malformed nested object cannot crash route or invoke authorizer',async()=>{
 const cyclic={};cyclic.self=cyclic;
 const accessor={};Object.defineProperty(accessor,'companyId',{enumerable:true,get(){throw Error('getter ran');}});
 for(const input of [cyclic,accessor,{quantity:NaN},{nested:{value:BigInt(1)}}]){
  const f=fixture({body:{companyId:tenant,input}});
  await createRun5TenantRoute({enabled:true,authorizer:f.authorizer,
   operations:f.operations,origin:'https://test.invalid',clock:()=>1000})(f.req,f.res);
  assert.equal(f.res.statusCode,400);assert.equal(f.calls.length,0);
 }
});
