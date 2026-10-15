import test from 'node:test';
import assert from 'node:assert/strict';
import {createStoreDeviceEnrollmentCoordinator} from '../storeDeviceEnrollmentCoordinator.mjs';

test('private device enrollment coordinator refuses partial or anonymous configuration',()=>{
 for(const config of [{},{authClient:{auth:{getUser(){}}}},{privatePool:{connect(){},query(){}}},
  {authClient:{auth:{getUser(){}}},privatePool:{connect(){}}}])
  assert.throws(()=>createStoreDeviceEnrollmentCoordinator(config),/not configured/);
});
test('private coordinator composes a fail-closed service, never a public route',async()=>{
 const s=createStoreDeviceEnrollmentCoordinator({authClient:{auth:{getUser:async()=>({error:'denied'})}},
   privatePool:{query:async()=>({rows:[]}),connect:async()=>({query:async()=>({rows:[]}),release(){}})},clock:()=>100000});
 assert.equal(typeof s.issueInvite,'function');assert.equal(typeof s.redeemInvite,'function');assert.equal(typeof s.revokeGrant,'function');
 assert.equal(Object.isFrozen(s),true);
 await assert.rejects(s.issueInvite({session:'not-jwt',companyId:'44444444-4444-4444-8444-444444444444',storeId:'store',targetUserId:'55555555-5555-4555-8555-555555555555'}),/authorized|denied/);
});
