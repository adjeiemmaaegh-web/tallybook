import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveCloudMembership} from '../client/src/features/security/cloudMembershipModel.mjs';
const m={user_id:'user-a',business_id:'business-a',role:'owner'};
const b={id:'business-a',owner_id:'user-a'};
const go=(user='user-a',company='business-a',member=m,business=b)=>
  resolveCloudMembership(user,company,member,business);
const deny=fn=>assert.throws(fn,/Company access is not authorized/);
test('valid owner and no implicit financial authorization',()=>{
  const x=go();assert.deepEqual(x,{userId:'user-a',companyId:'business-a',role:'owner'});
  assert.equal(Object.isFrozen(x),true);
  assert.equal(Object.hasOwn(x,'writeAllowed'),false);
});
test('remote attendant maps to internal staff, never admin',()=>{
  assert.equal(go('user-b','business-a',{...m,user_id:'user-b',role:'attendant'}).role,'staff');
});
test('foreign account and company fail closed',()=>{
  deny(()=>go('user-b'));deny(()=>go('user-a','business-b'));
  deny(()=>go('user-a','business-a',{...m,business_id:'business-b'}));
  deny(()=>go('user-a','business-a',m,{...b,id:'business-b'}));
});
test('unknown, admin, pending or revoked role fails closed',()=>{
  for(const role of ['admin','staff','pending','revoked','superuser','',null,undefined])
    deny(()=>go('user-a','business-a',{...m,role}));
});
test('business owner must match owner membership',()=>{
  deny(()=>go('user-a','business-a',m,{...b,owner_id:'user-b'}));
});
test('business owner cannot use an attendant membership as owner',()=>{
  deny(()=>go('user-a','business-a',{...m,role:'attendant'}));
});
test('null and malformed identities fail closed',()=>{
  for(const v of [null,undefined,'','  ',' user-a',1])
    deny(()=>resolveCloudMembership(v,'business-a',m,b));
  deny(()=>go('user-a','business-a',null));
  deny(()=>go('user-a','business-a',m,null));
  deny(()=>go('user-a','business-a',{...m,user_id:''}));
});
test('projection does not mutate trusted snapshot inputs',()=>{
  const before=JSON.stringify({m,b});
  go();assert.equal(JSON.stringify({m,b}),before);
});
