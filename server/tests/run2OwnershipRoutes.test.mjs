import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRun2OwnershipHandler} from '../run2OwnershipRoutes.mjs';
function exchange({action='bind',tls=true,origin='https://test.invalid',contentType=true,
  token='Bearer '+'a'.repeat(32),body={cloudCompanyId:'co',localCompanyId:'local',recoveryId:'proof'}}={}){
 const response={code:0,result:null,headers:{},
  setHeader(k,v){this.headers[k]=v;},
  status(n){this.code=n;return this;},json(v){this.result=v;return this;}};
 const request={params:{action},socket:{encrypted:tls,remoteAddress:'127.0.0.1'},
  headers:{origin},get:()=>token,is:()=>contentType?'application/json':false,body};
 return {request,response};
}
const coordinator={bindExistingCompany:async()=>({bindingCreated:true}),
  transferOwner:async()=>({transferred:true}),
  issueRecoveryApproval:async()=>({id:'proof'})};
const evidence={request:async()=>({status:'pending'}),verify:async()=>({status:'verified'}),
  revoke:async()=>({status:'revoked'})};
test('unconfigured ownership HTTP route defaults to 503',async()=>{
 const x=exchange();await makeRun2OwnershipHandler({})(x.request,x.response);
 assert.equal(x.response.code,503);
});
test('TLS and exact-origin are mandatory',async()=>{
 const handler=makeRun2OwnershipHandler({enabled:true,allowedOrigin:'https://test.invalid',
  coordinator,evidence});
 for(const config of [{tls:false},{origin:'https://foreign.invalid'},{contentType:false}]){
  const x=exchange(config);await handler(x.request,x.response);
  assert.equal(x.response.code,403);
 }
});
test('extraneous fields and spoofed operation reject before mutation',async()=>{
 const handler=makeRun2OwnershipHandler({enabled:true,allowedOrigin:'https://test.invalid',
  coordinator,evidence});
 for(const config of [{action:'delete'}, {body:{companyId:'co',role:'owner'}}]){
  const x=exchange(config);await handler(x.request,x.response);
  assert.ok([400,404].includes(x.response.code));
 }
});
test('valid bind runs only the trusted ownership coordinator',async()=>{
 const x=exchange(),handler=makeRun2OwnershipHandler({
  enabled:true,allowedOrigin:'https://test.invalid',coordinator,evidence});
 await handler(x.request,x.response);
 assert.equal(x.response.code,200);assert.equal(x.response.result.bindingCreated,true);
});
test('request and verify route to dedicated evidence lifecycle',async()=>{
 const handler=makeRun2OwnershipHandler({
  enabled:true,allowedOrigin:'https://test.invalid',coordinator,evidence});
 for(const [action,body,status] of [
  ['request',{companyId:'co',kind:'verified-restore',reviewerId:'reviewer'},'pending'],
  ['verify',{evidenceId:'proof'},'verified']]){
  const x=exchange({action,body});await handler(x.request,x.response);
  assert.equal(x.response.code,200);assert.equal(x.response.result.status,status);
 }
});
