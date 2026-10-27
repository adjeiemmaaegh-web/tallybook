import test from 'node:test';
import assert from 'node:assert/strict';
import {readVerifiedCloudBusinesses} from './cloudMembershipBoundary.mjs';
const owner='11111111-1111-4111-8111-111111111111';
const attendant='22222222-2222-4222-8222-222222222222';
const companyA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const companyB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const business=(id, owner_id=owner)=>({id,owner_id,name:'Company',created_at:'2026-10-27T12:00:00Z',updated_at:'2026-10-27T12:00:00Z'});
const membership=(id,user_id,role)=>({business_id:id,user_id,role});
const fixture=(opts={})=>({
 verifiedUserId:async()=>owner,
 readBusinesses:async()=>[business(companyA)],
 readMemberships:async()=>[membership(companyA,owner,'owner')],
 ...opts,
});
const rejects=async args => assert.rejects(readVerifiedCloudBusinesses(args),/could not be verified/);
test('projects only the verified owner business, without any local role grant',async()=>{
 const actual=await readVerifiedCloudBusinesses(fixture());
 assert.equal(actual.length,1); assert.equal(actual[0].role,'owner');
 assert.equal(actual[0].id,companyA);assert.equal('canWrite' in actual[0],false);
 assert.equal(Object.isFrozen(actual[0]),true);
});
test('permits verified attendant membership without owner promotion',async()=>{
 const args=fixture({verifiedUserId:async()=>attendant,
 readBusinesses:async()=>[business(companyA)],
 readMemberships:async()=>[membership(companyA,attendant,'attendant')]});
 const actual=await readVerifiedCloudBusinesses(args);
 assert.equal(actual[0].role,'attendant');
});
test('rejects owner promotion if cloud business belongs to another user',async()=>{
 await rejects(fixture({verifiedUserId:async()=>attendant,
  readMemberships:async()=>[membership(companyA,attendant,'owner')]}));
});
test('rejects attendant misclassification for an owner',async()=>{
 await rejects(fixture({readMemberships:async()=>[membership(companyA,owner,'attendant')]}));
});
test('rejects cross-company membership rows from a broken RLS response',async()=>{
 await rejects(fixture({readBusinesses:async()=>[business(companyA)],
  readMemberships:async()=>[membership(companyA,owner,'owner'),membership(companyB,owner,'attendant')]}));
});
test('rejects other-user membership rows from a broken RLS response',async()=>{
 await rejects(fixture({readMemberships:async()=>[membership(companyA,attendant,'attendant')]}));
});
test('rejects visible business lacking explicit membership',async()=>{
 await rejects(fixture({readMemberships:async()=>[]}));
});
test('rejects duplicate membership evidence',async()=>{
 await rejects(fixture({readMemberships:async()=>[membership(companyA,owner,'owner'),membership(companyA,owner,'owner')]}));
});
test('rejects duplicate cloud businesses',async()=>{
 await rejects(fixture({readBusinesses:async()=>[business(companyA),business(companyA)]}));
});
test('rejects account switch during concurrent RLS reads',async()=>{
 let count=0;
 await rejects(fixture({verifiedUserId:async()=>++count===1?owner:attendant}));
});
test('rejects offline state before queries',async()=>{
 let calls=0;
 await rejects(fixture({isOnline:()=>false,readBusinesses:async()=>{calls++;return [];}}));
 assert.equal(calls,0);
});
test('rejects offline transition after database reads',async()=>{
 let calls=0;
 await rejects(fixture({isOnline:()=>++calls===1}));
});
test('rejects invalid and unexpectedly truncated provider responses',async()=>{
 await rejects(fixture({readBusinesses:async()=>null}));
 await rejects(fixture({readMemberships:async()=>Array.from({length:101},()=>membership(companyA,owner,'owner'))}));
});
test('rejects invalid owner UUID and malformed business fields',async()=>{
 await rejects(fixture({verifiedUserId:async()=> 'someone@example.test'}));
 await rejects(fixture({readBusinesses:async()=>[{...business(companyA),owner_id:'bad'}]}));
});
test('supports two distinct businesses owned by the same verified account',async()=>{
 const actual=await readVerifiedCloudBusinesses(fixture({
  readBusinesses:async()=>[business(companyA),business(companyB)],
  readMemberships:async()=>[membership(companyA,owner,'owner'),membership(companyB,owner,'owner')],
 }));
 assert.equal(actual.length,2);
});
