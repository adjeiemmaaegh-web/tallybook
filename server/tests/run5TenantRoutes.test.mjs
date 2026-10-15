import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun5TenantRoutes} from '../run5TenantRoutes.mjs';
function setup(changes={}){
 const calls=[];
 const service={async list(args){calls.push(args);return {companyId:args.companyId,rows:[]};}};
 const res={code:0,data:null,headers:{},setHeader(k,v){this.headers[k]=v;},
  status(n){this.code=n;return this;},json(d){this.data=d;return this;}};
 const req={params:{action:'list'},socket:{encrypted:true,remoteAddress:'127.0.0.1'},
   body:{companyId:'co',collection:'products'},
   get:k=>({origin:'https://test.invalid',authorization:'Bearer '+'x'.repeat(32),
     cookie:null})[k],is:()=> 'application/json',...changes};
 return {service,req,res,calls};
}
const enabled={enabled:true,allowedOrigin:'https://test.invalid',clock:()=>1000};
test('unconfigured tenant routes fail closed and do not inspect records',async()=>{
 const x=setup();await createRun5TenantRoutes({})(x.req,x.res);
 assert.equal(x.res.code,503);assert.equal(x.calls.length,0);
});
test('authorized request routes only to service with authenticated token',async()=>{
 const x=setup();await createRun5TenantRoutes({...enabled,service:x.service})(x.req,x.res);
 assert.equal(x.res.code,200);assert.equal(x.calls.length,1);
 assert.equal(x.calls[0].session,'x'.repeat(32));
 assert.equal(x.res.headers['Cache-Control'],'no-store');
});
test('foreign Origin, missing direct TLS and cookies never call service',async()=>{
 for(const props of [
  {socket:{encrypted:false,remoteAddress:'127.0.0.1'}},
  {get:k=>({origin:'https://other.invalid',authorization:'Bearer '+'x'.repeat(32),
    cookie:null})[k]},
  {get:k=>({origin:'https://test.invalid',authorization:'Bearer '+'x'.repeat(32),
    cookie:'session=bad'})[k]}
 ]){
  const x=setup(props);
  await createRun5TenantRoutes({...enabled,service:x.service})(x.req,x.res);
  assert.equal(x.res.code,403);assert.equal(x.calls.length,0);
 }
});
test('unknown methods, fields and malformed bearer input are rejected',async()=>{
 for(const props of [
  {params:{action:'executeSQL'}},
  {body:{companyId:'co',collection:'products',admin:true}},
  {get:k=>k==='authorization'?'Bearer weak':k==='origin'?'https://test.invalid':null}
 ]){
  const x=setup(props);
  await createRun5TenantRoutes({...enabled,service:x.service})(x.req,x.res);
  assert.ok([400,403,404].includes(x.res.code));
  assert.equal(x.calls.length,0);
 }
});
test('service authorization errors never leak company or SQL details',async()=>{
 const x=setup();
 x.service.list=async()=>{throw Error('secret database connection and cross-tenant row');};
 await createRun5TenantRoutes({...enabled,service:x.service})(x.req,x.res);
 assert.equal(x.res.code,403);
 assert.equal(JSON.stringify(x.res.data).includes('database'),false);
});
test('per-address rate limit rejects calls after twenty-five requests',async()=>{
 const x=setup(),h=createRun5TenantRoutes({...enabled,service:x.service});
 for(let i=0;i<26;i++)await h(x.req,x.res);
 assert.equal(x.res.code,429);assert.equal(x.calls.length,25);
});
