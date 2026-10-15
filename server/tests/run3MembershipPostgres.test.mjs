import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun3MembershipStore} from '../run3MembershipPostgres.mjs';
const co='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',owner='11111111-1111-4111-8111-111111111111';
function harness({failure='',zeroRows=false}={}){
  const queries=[],released=[];
  const pool={async connect(){return {
    async query(sql,values){
      queries.push({sql,values});
      if(failure&&sql.includes(failure))throw Error('simulated SQL failure');
      if(sql.startsWith('select id from auth.sessions'))return {rows:[{id:'s'}],rowCount:1};
      if(sql.startsWith('select id,owner_id'))return {rows:[{id:co,owner_id:owner}],rowCount:1};
      if(sql.includes('from public.business_members')&&sql.includes('for update'))
        return {rows:[{business_id:co,user_id:owner,role:'owner'}],rowCount:1};
      if(sql.includes('from public.company_member_invites')&&sql.includes('token_sha256=$1'))
        return {rows:[],rowCount:0};
      if(sql.includes('returning')&&!zeroRows)return {rows:[{id:'ok'}],rowCount:1};
      return {rows:[],rowCount:0};
    },release(){released.push(true);}
  };}};
  return {store:createRun3MembershipStore(pool),queries,released};
}
test('private store opens serializable and commits only after callback returns',async()=>{
  const h=harness();
  const result=await h.store.transaction(async tx=>{
    assert.equal(await tx.assertActiveSession('sid',owner,1000),true);
    assert.equal((await tx.getCompany(co)).ownerId,owner);
    assert.equal((await tx.getMembership(co,owner)).role,'owner');
    return 'accepted';
  });
  assert.equal(result,'accepted');
  assert.equal(h.queries[0].sql,'BEGIN ISOLATION LEVEL SERIALIZABLE');
  assert.equal(h.queries.at(-1).sql,'COMMIT');
  assert.equal(h.released.length,1);
  assert.ok(h.queries.some(x=>x.sql.includes('auth.sessions')&&x.sql.includes('for share')));
});
test('all tenant and identity lookups use bound values, not string interpolation',async()=>{
  const h=harness();await h.store.transaction(async tx=>{
    await tx.getCompany(co);await tx.getMembership(co,owner);
    await tx.hasUnexpiredInvitation(co,owner,1000);
    await tx.getInvitationByHash('a'.repeat(64));
  });
  for(const q of h.queries.filter(x=>Array.isArray(x.values))){
    assert.ok(q.sql.includes('$1'));
    assert.ok(!q.sql.includes(co)&&!q.sql.includes(owner));
  }
});
test('write requires exactly one returned row and rollback on missing row',async()=>{
  const h=harness({zeroRows:true});
  await assert.rejects(h.store.transaction(tx=>tx.insertAttendant(co,owner)));
  assert.equal(h.queries.at(-1).sql,'ROLLBACK');
  assert.equal(h.released.length,1);
});
test('audit exception always rolls back and releases connection',async()=>{
  const h=harness({failure:'company_membership_audit'});
  await assert.rejects(h.store.transaction(tx=>tx.appendAudit({
    companyId:co,actorId:owner,targetUserId:owner,event:'invited',
    invitationId:null,at:1000
  })),/simulated SQL failure/);
  assert.equal(h.queries.at(-1).sql,'ROLLBACK');
  assert.equal(h.released.length,1);
});
test('explicitly forbids construction from a browser-style client',()=>{
  assert.throws(()=>createRun3MembershipStore({}),/denied/);
});
