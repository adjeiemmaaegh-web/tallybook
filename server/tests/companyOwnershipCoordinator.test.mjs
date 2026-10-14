import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompanyOwnershipCoordinator } from '../companyOwnershipCoordinator.mjs';

const owner='11111111-1111-4111-8111-111111111111';
const reviewer='33333333-3333-4333-8333-333333333333';
const sid='22222222-2222-4222-8222-222222222222';
function token(userId){
  const part=Buffer.from(JSON.stringify({sub:userId,session_id:sid,role:'authenticated',aud:'authenticated',exp:3600})).toString('base64url');
  return 'eyJhbGciOiJSUzI1NiJ9.'+part+'.'+'a'.repeat(64);
}
function harness({reviewerAllowed=true,sessionActive=true}={}){
  const calls=[];
  const pool={
    async query(sql,params){calls.push([sql,params]);return {rows:[{active:sessionActive}]};},
    async connect(){return {
      async query(sql,params){
        calls.push([sql,params]);
        if(sql.startsWith('select id, owner_id from public.businesses'))
          return {rows:[{id:'co',owner_id:owner}],rowCount:1};
        if(sql.startsWith('select business_id,user_id,role from public.business_members'))
          return {rows:[{business_id:'co',user_id:params[1],role:params[1]===owner?'owner':'attendant'}],rowCount:1};
        if(sql.startsWith('select id,company_id,owner_id,recipient_id,local_company_id'))
          return {rows:[],rowCount:0};
        if(sql.includes('from public.company_local_bindings'))
          return {rows:[],rowCount:0};
        if(sql.startsWith('insert ')||sql.startsWith('update '))
          return {rows:[{id:'ok'}],rowCount:1};
        return {rows:[],rowCount:0};
      },
      release(){calls.push(['released']);},
    };},
  };
  const authClient={auth:{async getUser(accessToken){
    const payload=JSON.parse(Buffer.from(accessToken.split('.')[1],'base64url').toString());
    return {data:{user:{id:payload.sub}},error:null};
  }}};
  const coordinator=createCompanyOwnershipCoordinator({
    authClient,privatePool:pool,
    reviewerDirectory:{async isAuthorizedReviewer(id){return reviewerAllowed&&id===reviewer;}},
    evidenceDirectory:{async getVerifiedRecovery(id){return {
      id,companyId:'co',ownerId:owner,reviewerId:reviewer,
      kind:'verified-restore',localCompanyId:'local',verified:true,
    };}},
    clock:()=>1000,
  });
  return {coordinator,calls};
}
test('independent reviewer with live authenticated session can write approval and audit in one transaction',async()=>{
  const {coordinator,calls}=harness();
  const result=await coordinator.issueRecoveryApproval({
    reviewSession:token(reviewer),evidenceId:'proof',companyId:'co',
    kind:'verified-restore',localCompanyId:'local',
  });
  assert.equal(result.expiresAt,601000);
  assert.ok(calls.some(([sql])=>sql.startsWith('insert into public.company_recovery_approvals')));
  assert.ok(calls.some(([sql])=>sql.startsWith('insert into public.company_recovery_approval_audit')));
  assert.ok(calls.some(([sql])=>sql==='COMMIT'));
});
test('reviewer permission and revoked Supabase session fail before mutation',async()=>{
  for(const options of [{reviewerAllowed:false},{sessionActive:false}]){
    const {coordinator,calls}=harness(options);
    await assert.rejects(coordinator.issueRecoveryApproval({
      reviewSession:token(reviewer),evidenceId:'proof',companyId:'co',
      kind:'verified-restore',localCompanyId:'local',
    }));
    assert.equal(calls.some(([sql])=>sql?.startsWith('insert ')),false);
  }
});
test('owner cannot bind without a server-issued unused recovery approval',async()=>{
  const {coordinator,calls}=harness();
  await assert.rejects(coordinator.bindExistingCompany({
    session:token(owner),cloudCompanyId:'co',localCompanyId:'local',recoveryId:'unissued',
  }));
  assert.equal(calls.some(([sql])=>sql==='ROLLBACK'),true);
  assert.equal(calls.some(([sql])=>sql?.startsWith('insert into public.company_local_bindings')),false);
});
test('refuses to initialize with absent private reviewer and recovery directory',()=>{
  assert.throws(()=>createCompanyOwnershipCoordinator({}),/not configured/);
  assert.throws(()=>createCompanyOwnershipCoordinator({
    authClient:{auth:{getUser:async()=>{}}},privatePool:{connect:async()=>{},query:async()=>{}},
    reviewerDirectory:{},evidenceDirectory:{},
  }),/not configured/);
});
