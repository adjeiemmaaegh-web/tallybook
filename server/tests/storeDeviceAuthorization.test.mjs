import test from 'node:test';
import assert from 'node:assert/strict';
import {createStoreDeviceAuthorizer} from '../storeDeviceAuthorization.mjs';
const data=()=>({companyId:'co',storeId:'s1',deviceId:'d1',userId:'alice',
 companyOwnerId:'alice',role:'owner',membershipStatus:'active',storeStatus:'active',
 deviceStatus:'active',deviceUserId:'alice',deviceCompanyId:'co',deviceStoreId:'s1',deviceExpiresAt:2000});
const req=()=>({session:'valid',companyId:'co',storeId:'s1',deviceId:'d1',action:'store.stock'});
function fixture(override={}){let n=0;const authorize=createStoreDeviceAuthorizer({
 resolveSession:async()=>({userId:'alice',active:true}),
 readBoundary:async()=>{n++;return {...data(),...override};},clock:()=>1000});
 return {authorize,reads:()=>n};}
test('owner with active same-company, same-store device can be authorized',async()=>{
 const f=fixture(),v=await f.authorize(req());assert.equal(v.role,'owner');assert.equal(f.reads(),1);
 assert.equal(Object.isFrozen(v),true);
});
test('deny wrong store, device, user, company, owner, expired or revoked grant',async()=>{
 for(const override of [{storeId:'s2'},{deviceId:'other'},{userId:'bob'},
  {companyId:'foreign'},{companyOwnerId:'bob'},{deviceExpiresAt:1000},
  {membershipStatus:'revoked'},{storeStatus:'disabled'},{deviceStatus:'revoked'},
  {deviceUserId:'bob'},{deviceStoreId:'s2'},{deviceCompanyId:'other'},
  {role:'admin'}]){
  await assert.rejects(fixture(override).authorize(req()),/not authorized/);
 }
});
test('attendant cannot transfer stock or manage store, but can perform scoped sale',async()=>{
 const f=fixture({role:'attendant',companyOwnerId:'bob'});
 await assert.rejects(f.authorize(req()),/not authorized/);
 assert.equal((await f.authorize({...req(),action:'store.sale'})).action,'store.sale');
});
test('no identity or trust provider fails closed, unknown actions denied before read',async()=>{
 assert.throws(()=>createStoreDeviceAuthorizer({}),/not authorized/);
 const f=fixture();await assert.rejects(f.authorize({...req(),action:'root'}),/not authorized/);
 assert.equal(f.reads(),0);
});
test('authorization is re-read for every operation, not cached',async()=>{
 const f=fixture();await f.authorize(req());await f.authorize(req());assert.equal(f.reads(),2);
});
