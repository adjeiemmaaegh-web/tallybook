import test from 'node:test';
import assert from 'node:assert/strict';
import {createPostgresCompanyOwnershipStore} from '../trustedCompanyOwnershipPostgres.mjs';

function mockPool() {
  const calls=[];
  let released=0;
  const client={
    async query(sql,params=[]) {
      calls.push({sql,params});
      if(sql.includes('returning')) return {rows:[{id:'ok'}],rowCount:1};
      return {rows:[],rowCount:0};
    },
    release(){released++;},
  };
  return {pool:{async connect(){return client;}},calls,released:()=>released,client};
}
test('ownership database adapter commits and releases one serialized transaction',async()=>{
  const x=mockPool(),store=createPostgresCompanyOwnershipStore(x.pool);
  const result=await store.transaction(async tx=>{
    assert.equal(await tx.getBinding('cloud','local'),null);
    await tx.putBinding({companyId:'cloud',localCompanyId:'local',ownerId:'owner',createdAt:1000});
    await tx.appendAudit({type:'company-binding-created',companyId:'cloud',actorId:'owner',localCompanyId:'local',recoveryId:'proof',at:1000});
    return 'success';
  });
  assert.equal(result,'success');
  assert.equal(x.calls[0].sql,'BEGIN ISOLATION LEVEL SERIALIZABLE');
  assert.equal(x.calls.at(-1).sql,'COMMIT');
  assert.equal(x.released(),1);
});
test('database adapter rolls back and releases on failure',async()=>{
  const x=mockPool(),store=createPostgresCompanyOwnershipStore(x.pool);
  await assert.rejects(store.transaction(async tx=>{
    await tx.putCompanyOwner('co','owner','prior');
    throw Error('audit failure');
  }),/audit failure/);
  assert.equal(x.calls.at(-1).sql,'ROLLBACK');
  assert.equal(x.released(),1);
});
test('user-supplied identifiers are parameterized and forbidden roles fail before writes',async()=>{
  const x=mockPool(),store=createPostgresCompanyOwnershipStore(x.pool);
  const malicious="co' OR 1=1 --";
  await store.transaction(async tx=>{
    assert.equal(await tx.getCompany(malicious),null);
    await assert.rejects(tx.putMembership({companyId:malicious,userId:'u',role:'root'}),/Unsupported/);
  });
  const read=x.calls.find(c=>c.sql.includes('from public.businesses'));
  assert.ok(read.sql.includes('id=$1'));
  assert.deepEqual(read.params,[malicious]);
  assert.equal(x.calls.at(-1).sql,'COMMIT');
});
test('zero-row database mutation rolls back as a conflict',async()=>{
  const x=mockPool();
  x.client.query=async function(sql,params=[]) {
    x.calls.push({sql,params});
    return {rows:[],rowCount:0};
  };
  await assert.rejects(createPostgresCompanyOwnershipStore(x.pool).transaction(
    tx=>tx.putCompanyOwner('missing','u','prior')),/conflict/);
  assert.equal(x.calls.at(-1).sql,'ROLLBACK');
  assert.equal(x.released(),1);
});
test('transfer updates existing local binding owner in the same transaction',async()=>{
  const x=mockPool();
  await createPostgresCompanyOwnershipStore(x.pool).transaction(async tx=>{
    await tx.putCompanyOwner('company','next-owner','prior');
    await tx.updateBindingOwner('company','next-owner');
  });
  const update=x.calls.find(c=>c.sql.includes('update public.company_local_bindings'));
  assert.deepEqual(update.params,['company','next-owner']);
  assert.equal(x.calls.at(-1).sql,'COMMIT');
});
test('transfer tolerates cloud-only company without local binding',async()=>{
  const x=mockPool();
  x.client.query=async function(sql,params=[]){
    x.calls.push({sql,params});
    if(sql.includes('update public.company_local_bindings'))return {rowCount:0,rows:[]};
    return {rowCount:1,rows:[{id:'ok'}]};
  };
  await createPostgresCompanyOwnershipStore(x.pool).transaction(
    tx=>tx.updateBindingOwner('cloud-only','next-owner'));
  assert.equal(x.calls.at(-1).sql,'COMMIT');
});
test('a private transaction pool is mandatory',()=>{
  assert.throws(()=>createPostgresCompanyOwnershipStore(null));
  assert.throws(()=>createPostgresCompanyOwnershipStore({}));
});

test('existing cloud-company binding is detected even for a different local ID',async()=>{
  const x=mockPool();
  x.client.query=async function(sql,params=[]){
    x.calls.push({sql,params});
    if(sql.includes('from public.company_local_bindings') && sql.startsWith('select'))
      return {rows:[{company_id:'cloud',local_company_id:'original-local'}],rowCount:1};
    return {rows:[],rowCount:0};
  };
  await createPostgresCompanyOwnershipStore(x.pool).transaction(async tx=>{
    assert.deepEqual(await tx.getBinding('cloud','attempted-rebind'),
      {companyId:'cloud',localCompanyId:'original-local'});
  });
  const lookup=x.calls.find(c=>c.sql.startsWith('select')&&c.sql.includes('company_local_bindings'));
  assert.deepEqual(lookup.params,['cloud']);
  assert.equal(x.calls.at(-1).sql,'COMMIT');
});

test('conditional owner change uses prior owner as a database predicate', async () => {
 const x=mockPool();
 await createPostgresCompanyOwnershipStore(x.pool).transaction(async tx=>{
  await assert.rejects(tx.putCompanyOwner('co','new'),/Expected owner required/);
  await tx.putCompanyOwner('co','new','old');
 });
 const writes=x.calls.filter(c=>c.sql.startsWith('update public.businesses'));
 assert.equal(writes.length,1);
 assert.match(writes[0].sql,/where id=\$1 and owner_id=\$3/);
 assert.deepEqual(writes[0].params,['co','new','old']);
});

test('binding and transfer services can lock the live Supabase session in the same SQL transaction',async()=>{
 const x=mockPool();
 x.client.query=async function(sql,params=[]){
   x.calls.push({sql,params});
   if(sql.includes('from auth.sessions'))return {rows:[{id:'sid'}],rowCount:1};
   return {rows:[],rowCount:0};
 };
 await createPostgresCompanyOwnershipStore(x.pool).transaction(async tx=>{
   assert.equal(await tx.assertActiveSession('sid','actor',1000),true);
 });
 const lookup=x.calls.find(({sql})=>sql.includes('from auth.sessions'));
 assert.ok(lookup);
 assert.match(lookup.sql,/for share/i);
 assert.deepEqual(lookup.params,['sid','actor',1000]);
 assert.equal(x.calls[0].sql,'BEGIN ISOLATION LEVEL SERIALIZABLE');
 assert.equal(x.calls.at(-1).sql,'COMMIT');
});
test('missing or duplicate private session rows fail closed',async()=>{
 for(const rows of [[],[{id:'s'},{id:'s'}]]){
   const x=mockPool();
   x.client.query=async function(sql,params=[]){
     x.calls.push({sql,params});
     if(sql.includes('from auth.sessions'))return {rows,rowCount:rows.length};
     return {rows:[],rowCount:0};
   };
   await createPostgresCompanyOwnershipStore(x.pool).transaction(
     async tx=>assert.equal(await tx.assertActiveSession('sid','actor',1000),false));
   assert.equal(x.calls.at(-1).sql,'COMMIT');
 }
});
