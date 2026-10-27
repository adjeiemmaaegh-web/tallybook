import test from 'node:test';
import assert from 'node:assert/strict';
import {createCentralDeviceHandler,mountCentralDeviceRoutes} from '../centralDeviceRoutes.mjs';

const token='x'.repeat(30);
function request(path,body,overrides={}) {
  const headers={origin:'https://tallybook.example',authorization:`Bearer ${token}`,...overrides.headers};
  return {path,body,socket:{encrypted:true,remoteAddress:'127.0.0.1'},
    get(name){return headers[name];},is(){return 'application/json';},...overrides};
}
async function call(handler,req) {
  const res={code:0,body:null,headers:{},setHeader(k,v){this.headers[k]=v;},
    status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
  await handler(req,res);return res;
}
const bodies={
  provision:{companyId:'c',localCompanyId:'l',staffId:'s',storeId:'shop',targetUserId:'u'},
  invite:{companyId:'c',storeId:'shop',targetUserId:'u'},
  redeem:{deviceId:'d',proofSignature:'proof',publicKeySpkiPem:'pem',staffId:'s',token:'token'},
  revoke:{companyId:'c',deviceId:'d'},
};
const routes={provision:'/api/central/staff/provision',invite:'/api/central/devices/invite',
  redeem:'/api/central/devices/redeem',revoke:'/api/central/devices/revoke'};
function services(seen) {return {staffService:{async provision(a){seen.push(['provision',a]);return {status:'active'};}},
  deviceService:{async issueInvite(a){seen.push(['invite',a]);return {inviteId:'i'};},
    async redeemKeyInvite(a){seen.push(['redeem',a]);return {publicKeyBound:true};},
    async revokeDeviceKey(a){seen.push(['revoke',a]);return {revoked:true};}}};}

test('device administration stays unavailable without all private services',async()=>{
  const r=await call(createCentralDeviceHandler(),request(routes.invite,bodies.invite));
  assert.equal(r.code,503);assert.equal(r.headers['Cache-Control'],'no-store');
  assert.equal((await call(createCentralDeviceHandler({enabled:true,allowedOrigin:'https://tallybook.example'}),
    request(routes.invite,bodies.invite))).code,503);
});
test('device administration rejects transport, cookies, extra fields and rate limit before service',async()=>{
  const seen=[];const options={enabled:true,allowedOrigin:'https://tallybook.example',...services(seen)};
  for(const req of [request(routes.invite,bodies.invite,{socket:{encrypted:false}}),
    request(routes.invite,bodies.invite,{headers:{origin:'https://evil.example'}}),
    request(routes.invite,bodies.invite,{headers:{cookie:'session=x'}}),
    request(routes.invite,bodies.invite,{headers:{authorization:'Bearer short'}})])
    assert.equal((await call(createCentralDeviceHandler(options),req)).code,403);
  assert.equal((await call(createCentralDeviceHandler(options),
    request(routes.invite,{...bodies.invite,actorId:'owner'}))).code,400);
  assert.equal((await call(createCentralDeviceHandler({...options,limiter:{allow:()=>false}}),
    request(routes.invite,bodies.invite))).code,429);
  assert.equal(seen.length,0);
});
test('every action passes only verified bearer and exact body to its private service',async()=>{
  const seen=[];const handler=createCentralDeviceHandler({enabled:true,
    allowedOrigin:'https://tallybook.example',...services(seen)});
  for(const [name,path] of Object.entries(routes))
    assert.equal((await call(handler,request(path,bodies[name]))).code,200);
  assert.deepEqual(seen,Object.keys(routes).map(name=>[name,{...bodies[name],session:token}]));
});
test('private denials are generic and mount only known paths',async()=>{
  const seen=[];const routesMounted=[];
  mountCentralDeviceRoutes({post(...args){routesMounted.push(args[0]);}},()=>()=>{},{});
  assert.deepEqual(routesMounted,Object.values(routes));
  const options={enabled:true,allowedOrigin:'https://tallybook.example',...services(seen)};
  options.deviceService.issueInvite=async()=>{throw Error('private account detail');};
  const r=await call(createCentralDeviceHandler(options),request(routes.invite,bodies.invite));
  assert.equal(r.code,403);assert.equal(r.body.error,'Device administration denied');
});
