import test from 'node:test';
import assert from 'node:assert/strict';
import { createCentralSaleUploadHandler } from '../centralSaleUploadRoute.mjs';

const token='x'.repeat(30);
function request(overrides={}) {
  const headers={origin:'https://tallybook.example',authorization:`Bearer ${token}`,...overrides.headers};
  return {socket:{encrypted:true,remoteAddress:'127.0.0.1'},body:{envelope:{id:'sale:s1'}},
    get(name){return headers[name];},is(){return 'application/json';},...overrides};
}
async function call(handler,req=request()) {
  const response={code:0,body:null,headers:{},setHeader(k,v){this.headers[k]=v;},
    status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
  await handler(req,response);return response;
}

test('signed-sale route is unavailable unless explicitly configured',async()=>{
  const r=await call(createCentralSaleUploadHandler());
  assert.equal(r.code,503);
  assert.equal(r.headers['Cache-Control'],'no-store');
});
test('signed-sale route rejects absent direct TLS, wrong origin, cookies and malformed body',async()=>{
  let invoked=0;
  const handler=createCentralSaleUploadHandler({enabled:true,allowedOrigin:'https://tallybook.example',
    service:{async ingest(){invoked++;return {status:'accepted'};}}});
  for(const req of [request({socket:{encrypted:false,remoteAddress:'127.0.0.1'}}),
    request({headers:{origin:'https://evil.example'}}),
    request({headers:{cookie:'session=stolen'}})])
    assert.equal((await call(handler,req)).code,403);
  assert.equal((await call(handler,request({body:{envelope:{},extra:true}}))).code,400);
  assert.equal(invoked,0);
});
test('signed-sale route passes only bearer token and envelope and reports conflicts',async()=>{
  const seen=[];
  const handler=createCentralSaleUploadHandler({enabled:true,allowedOrigin:'https://tallybook.example',
    service:{async ingest(input){seen.push(input);if(seen.length===2)throw Error('Central operation conflicts with an existing event');
      return {status:'accepted',operationId:'sale:s1'};}}});
  const first=await call(handler);
  assert.equal(first.code,200);
  assert.deepEqual(seen[0],{session:token,envelope:{id:'sale:s1'}});
  assert.equal((await call(handler)).code,409);
});
