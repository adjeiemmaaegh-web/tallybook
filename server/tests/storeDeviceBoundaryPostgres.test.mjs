import test from 'node:test';
import assert from 'node:assert/strict';
import {createPostgresStoreDeviceBoundary} from '../storeDeviceBoundaryPostgres.mjs';
test('authoritative scope lookup is parameterized and returns exact device binding',async()=>{
 const calls=[];
 const reader=createPostgresStoreDeviceBoundary({query:async(sql,values)=>{
  calls.push({sql,values});return {rows:[{company_id:'co',store_id:'s1',device_id:'d1',
   owner_id:'u',role:'owner',store_status:'active',device_status:'active',
   device_company_id:'co',device_store_id:'s1',device_user_id:'u',
   device_expires_at:new Date(2000)}]};}});
 const b=await reader({companyId:'co',storeId:'s1',deviceId:'d1',userId:'u'});
 assert.equal(b.deviceExpiresAt,2000);assert.equal(b.deviceStoreId,'s1');
 assert.deepEqual(calls[0].values,['co','s1','d1','u']);
 assert.match(calls[0].sql,/for share of b,m,s,d/);
});
test('zero and duplicate authoritative rows fail closed',async()=>{
 for(const rows of [[],[{},{}]]){
  const read=createPostgresStoreDeviceBoundary({query:async()=>({rows})});
  await assert.rejects(read({companyId:'co',storeId:'s1',deviceId:'d1',userId:'u'}),/not authorized/);
 }
});
