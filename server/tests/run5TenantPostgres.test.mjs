import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun5TenantPostgresStore} from '../run5TenantPostgres.mjs';
const co='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const owner='11111111-1111-4111-8111-111111111111';
const sid='22222222-2222-4222-8222-222222222222';
function fixture({failOn='',missingRows=false}={}){
 const queries=[],released=[];
 const client={
  async query(sql,params){
   queries.push({sql,params});
   if(failOn&&sql.includes(failOn))throw Error('SQL simulated error');
   if(sql.includes("set_config("))return {rowCount:1,rows:[{
     actor_id:params[0],company_id:params[1]}]};
   if(sql.includes('auth.sessions'))return {rows:[{id:sid}],rowCount:1};
   if(sql.includes('from public.businesses'))return {rows:[{id:co,owner_id:owner}],rowCount:1};
   if(sql.includes('from public.business_members'))return {rows:[{
     business_id:co,user_id:owner,role:'owner'}],rowCount:1};
   if(sql.includes('from public.company_tenant_records')&&sql.includes('select'))
     return {rows:[{company_id:co,collection:'assistant',record_id:'r1',
       revision:1,payload:{companyId:co}}],rowCount:1};
   if(sql.includes('returning')){
    if(missingRows)return {rowCount:0,rows:[]};
    return {rowCount:1,rows:[{company_id:co,collection:'assistant',
      record_id:'r1',revision:1,payload:{companyId:co},id:1}]};
   }
   return {rows:[],rowCount:0};
  },
  release(){released.push(true);}
 };
 return {store:createRun5TenantPostgresStore({connect:async()=>client}),
   queries,released};
}
test('all SQL tenant operations run inside a serializable transaction',async()=>{
 const f=fixture();
 const result=await f.store.transaction(async tx=>{
  assert.equal(await tx.assertActiveSession(sid,owner,1000),true);
  assert.equal((await tx.getCompany(co)).ownerId,owner);
  assert.equal((await tx.getMembership(co,owner)).role,'owner');
  assert.equal(await tx.activateTenantScope(owner,co),true);
  return await tx.getRow(co,'assistant','r1');
 });
 assert.equal(result.companyId,co);
 assert.equal(f.queries[0].sql,'BEGIN ISOLATION LEVEL SERIALIZABLE');
 assert.equal(f.queries.at(-1).sql,'COMMIT');
 assert.equal(f.released.length,1);
});
test('session row is FOR SHARE locked before any data table read',async()=>{
 const f=fixture();await f.store.transaction(tx=>tx.assertActiveSession(sid,owner,1000));
 assert.ok(f.queries.find(x=>x.sql.includes('auth.sessions')&&x.sql.includes('for share')));
});
test('private tenant RLS role is activated only after explicit scoped GUC set',async()=>{
 const f=fixture();
 await f.store.transaction(tx=>tx.activateTenantScope(owner,co));
 const scopeIndex=f.queries.findIndex(x=>x.sql.includes('set_config('));
 const roleIndex=f.queries.findIndex(x=>x.sql.includes('SET LOCAL ROLE'));
 assert.ok(scopeIndex>0&&roleIndex>scopeIndex);
 assert.ok(f.queries[roleIndex].sql.includes('tallybook_run5_private'));
});
test('tenant records SQL always contains exact company predicates and bound params',async()=>{
 const f=fixture();
 await f.store.transaction(async tx=>{
  await tx.getRow(co,'assistant','r1');
  await tx.listRows(co,'assistant',10,null);
  await tx.putRow({companyId:co,collection:'assistant',id:'r1',
    payload:{companyId:co},expectedRevision:0});
  await tx.deleteRow(co,'assistant','r1',1);
 });
 const lines=f.queries.filter(q=>/company_tenant_records/.test(q.sql));
 assert.equal(lines.length,4);
 assert.ok(lines.every(q=>q.sql.includes('company_id=$1::uuid')||
   (q.sql.includes('insert into public.company_tenant_records')&&
    q.sql.includes('values($1::uuid'))));
 assert.ok(lines.every(q=>q.params[0]===co));
});
test('missing CAS write acknowledgement aborts and rolls back the transaction',async()=>{
 const f=fixture({missingRows:true});
 await assert.rejects(f.store.transaction(tx=>tx.putRow({companyId:co,
   collection:'assistant',id:'r1',payload:{companyId:co},expectedRevision:0})));
 assert.equal(f.queries.at(-1).sql,'ROLLBACK');
 assert.equal(f.released.length,1);
});
test('audit insert failure rolls back and connection is always released',async()=>{
 const f=fixture({failOn:'company_tenant_data_audit'});
 await assert.rejects(f.store.transaction(tx=>tx.appendAudit({
  companyId:co,actorId:owner,action:'read',collection:'assistant',at:1000
 })),/SQL simulated error/);
 assert.equal(f.queries.at(-1).sql,'ROLLBACK');assert.equal(f.released.length,1);
});
