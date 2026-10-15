import test from 'node:test';
import assert from 'node:assert/strict';
import {createPostgresStoreDeviceEnrollmentStore} from '../storeDeviceEnrollmentPostgres.mjs';

const ID='44444444-4444-4444-8444-444444444444';
const U='55555555-5555-4555-8555-555555555555';
const INV='11111111-1111-4111-8111-111111111111';
const GRANT='22222222-2222-4222-8222-222222222222';
const currentTime = 100_000;
function fixture(override) {
 const calls=[];let released=false;
 const query=async (sql,values)=> {
  calls.push({sql:sql.trim(),values});
  if(typeof override === 'function') return override(sql,values);
  if (/^select id,owner_id/.test(sql.trim())) return {rows:[{id:ID,owner_id:U}],rowCount:1};
  if (/^select business_id,user_id/.test(sql.trim())) return {rows:[{business_id:ID,user_id:U,role:'owner'}],rowCount:1};
  if (/^select id,company_id,status/.test(sql.trim())) return {rows:[{id:'store1',company_id:ID,status:'active'}],rowCount:1};
  if (/^select id,company_id,store_id,target_user_id/.test(sql.trim())) return {rows:[{id:INV,company_id:ID,store_id:'store1',target_user_id:U,issued_by:U,token_digest:'a'.repeat(64),status:'unused',expires_at:new Date(currentTime+600_000)}],rowCount:1};
  if (/^select id,company_id,store_id,user_id,status/.test(sql.trim())) return {rows:[{id:GRANT,company_id:ID,store_id:'store1',user_id:U,status:'active'}],rowCount:1};
  return {rows:[{id:GRANT}],rowCount:1};
 };
 const pool={connect:async()=>({query,release:()=>{released=true;}})};
 return {store:createPostgresStoreDeviceEnrollmentStore(pool),calls,released:()=>released};
}

test('transaction uses SERIALIZABLE, exact parameterized reads and COMMIT + release',async()=>{
 const f=fixture();
 await f.store.transaction(async tx=>{
  assert.deepEqual(await tx.getCompany(ID),{id:ID,ownerId:U});
  assert.deepEqual(await tx.getMembership(ID,U),{companyId:ID,userId:U,role:'owner',status:'active'});
  assert.deepEqual(await tx.getStore(ID,'store1'),{id:'store1',companyId:ID,status:'active'});
  const i=await tx.getInvitation('a'.repeat(64));assert.equal(i.expiresAt,currentTime+600_000);
  const grant=await tx.getGrant(ID,GRANT);assert.equal(grant.status,'active');
 });
 assert.match(f.calls[0].sql,/BEGIN ISOLATION LEVEL SERIALIZABLE/);
 assert.equal(f.calls.at(-1).sql,'COMMIT');assert.equal(f.released(),true);
 const q=f.calls.find(x=>x.sql.includes('company_device_enrollment_invites where token_digest'));
 assert.match(q.sql,/for update/i);assert.deepEqual(q.values,['a'.repeat(64)]);
 const g=f.calls.find(x=>x.sql.includes('company_device_grants where company_id'));
 assert.match(g.sql,/id=\$2 for update/);assert.deepEqual(g.values,[ID,GRANT]);
});
test('invite redemption and grant issuance are transaction-local writes with required audit',async()=>{
 const f=fixture();await f.store.transaction(async tx=>{
  await tx.insertInvitation({id:INV,companyId:ID,storeId:'store1',targetUserId:U,issuedBy:U,tokenDigest:'a'.repeat(64),createdAt:currentTime,expiresAt:currentTime+600_000});
  await tx.consumeInvitation(INV);
  await tx.insertGrant({id:GRANT,companyId:ID,storeId:'store1',userId:U,createdAt:currentTime,expiresAt:currentTime+8*60*60*1000});
  await tx.revokeGrant(ID,GRANT);
  await tx.appendAudit({action:'device.grant.revoked',companyId:ID,storeId:'store1',actorId:U,targetUserId:U,grantId:GRANT,inviteId:null,at:currentTime});
 });
 const sql=f.calls.map(c=>c.sql).join('\n');
 for(const text of ['company_device_enrollment_invites','company_device_grants','company_device_enrollment_audit',"status='unused'","status='active'"])assert.ok(sql.includes(text),text);
 assert.ok(f.calls.some(x=>x.sql.includes('company_device_grants')&&x.values?.[0]===GRANT));
 assert.equal(f.calls.at(-1).sql,'COMMIT');
});
test('failed write rolls back and always releases private connection',async()=>{
 const f=fixture((sql)=>{
  if(sql.startsWith('update public.company_device_grants'))return {rows:[],rowCount:0};
  return {rows:[{id:ID}],rowCount:1};
 });
 await assert.rejects(f.store.transaction(tx=>tx.revokeGrant(ID,GRANT)),/operation denied/);
 assert.equal(f.calls.at(-1).sql,'ROLLBACK');assert.equal(f.released(),true);
});
test('missing private pool, invalid SQL response, and failed transaction initialization deny',async()=>{
 assert.throws(()=>createPostgresStoreDeviceEnrollmentStore({}),/operation denied/);
 const f=fixture(()=>({rows:[],rowCount:0}));
 await assert.rejects(f.store.transaction(async tx=>{const i=await tx.getCompany(ID);assert.equal(i,null);await tx.consumeInvitation(INV);}),/operation denied/);
 assert.equal(f.calls.at(-1).sql,'ROLLBACK');
});
test('review SQL must not cast TEXT device-grant IDs as UUID and never inline caller values',async()=>{
 const f=fixture();await f.store.transaction(async tx=>{
  await tx.getGrant(ID,GRANT);await tx.revokeGrant(ID,GRANT);
 });
 const q=f.calls.filter(x=>x.sql.includes('company_device_grants'));
 assert.equal(q.length,2);
 for(const item of q){assert.ok(!item.sql.includes('id=$2::uuid'));assert.ok(item.sql.includes('id=$2'));assert.deepEqual(item.values,[ID,GRANT]);}
});
