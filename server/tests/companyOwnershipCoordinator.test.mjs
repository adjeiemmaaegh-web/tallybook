import test from 'node:test';
import assert from 'node:assert/strict';
import {createCompanyOwnershipCoordinator} from '../companyOwnershipCoordinator.mjs';
const owner='11111111-1111-4111-8111-111111111111';
const reviewer='33333333-3333-4333-8333-333333333333';
const sid='22222222-2222-4222-8222-222222222222';
const digest='a'.repeat(64);
function token(userId){
 const part=Buffer.from(JSON.stringify({sub:userId,session_id:sid,role:'authenticated',aud:'authenticated',exp:3600})).toString('base64url');
 return 'eyJhbGciOiJSUzI1NiJ9.'+part+'.'+'a'.repeat(64);
}
function harness({reviewerAllowed=true,sessionActive=true,evidenceAvailable=true,foreignEvidence=false}={}){
 const calls=[];
 const pool={
  async query(sql,params){calls.push([sql,params]);return {rows:[{active:sessionActive}]};},
  async connect(){return {
   async query(sql,params){
    calls.push([sql,params]);
    if(sql.startsWith('select id from auth.sessions'))return {rows:sessionActive?[{id:sid}]:[],rowCount:sessionActive?1:0};
    if(sql.startsWith('select user_id from public.company_recovery_reviewers'))
      return {rows:reviewerAllowed?[{user_id:reviewer}]:[],rowCount:reviewerAllowed?1:0};
    if(sql.includes('from public.company_recovery_verified_evidence where id='))
      return {rows:evidenceAvailable?[{id:'proof',company_id:foreignEvidence?'foreign':'co',owner_id:owner,reviewer_id:reviewer,
        kind:'verified-restore',recipient_id:null,local_company_id:'local',status:'verified',
        verified_at:new Date(900),backup_manifest_sha256:digest,restore_receipt_sha256:digest,
        transfer_review_sha256:null}]:[],rowCount:evidenceAvailable?1:0};
    if(sql.startsWith('select id, owner_id from public.businesses'))
      return {rows:[{id:'co',owner_id:owner}],rowCount:1};
    if(sql.startsWith('select business_id,user_id,role from public.business_members'))
      return {rows:[{business_id:'co',user_id:params[1],role:params[1]===owner?'owner':'attendant'}],rowCount:1};
    if(sql.startsWith('select id,company_id,owner_id,recipient_id,local_company_id'))
      return {rows:[],rowCount:0};
    if(sql.includes('from public.company_local_bindings'))return {rows:[],rowCount:0};
    if(sql.startsWith('insert ')||sql.startsWith('update '))return {rows:[{id:'proof'}],rowCount:1};
    return {rows:[],rowCount:0};
   },release(){calls.push(['released']);},
  };},
 };
 const authClient={auth:{async getUser(accessToken){
  const payload=JSON.parse(Buffer.from(accessToken.split('.')[1],'base64url').toString());
  return {data:{user:{id:payload.sub}},error:null};
 }}};
 return {coordinator:createCompanyOwnershipCoordinator({authClient,privatePool:pool,clock:()=>1000}),calls};
}
const request=()=>({reviewSession:token(reviewer),evidenceId:'proof',companyId:'co',kind:'verified-restore',localCompanyId:'local'});
test('transaction-bound independent recovery verification, consumption and audit commit together',async()=>{
 const {coordinator,calls}=harness();const result=await coordinator.issueRecoveryApproval(request());
 assert.equal(result.expiresAt,601000);
 const sql=calls.map(([s])=>s);
 assert.ok(sql.some(s=>s.startsWith('select id from auth.sessions')));
 assert.ok(sql.some(s=>s.includes('company_recovery_reviewers')));
 assert.ok(sql.some(s=>s.includes('company_recovery_verified_evidence where id=')));
 assert.ok(sql.some(s=>s.includes("set status='consumed'")));
 assert.ok(sql.some(s=>s.startsWith('insert into public.company_recovery_approvals')));
 assert.ok(sql.some(s=>s.startsWith('insert into public.company_recovery_approval_audit')));
 assert.equal(sql.at(-2),'COMMIT');
});
test('revoked reviewer, missing evidence and foreign company each reject before approval',async()=>{
 for(const opts of [{reviewerAllowed:false},{evidenceAvailable:false},{foreignEvidence:true},{sessionActive:false}]){
  const {coordinator,calls}=harness(opts);
  await assert.rejects(coordinator.issueRecoveryApproval(request()));
  assert.equal(calls.some(([sql])=>sql?.startsWith('insert ')),false);
 }
});
test('ownership bind still cannot occur without a preexisting server-issued recovery approval',async()=>{
 const {coordinator,calls}=harness();
 await assert.rejects(coordinator.bindExistingCompany({session:token(owner),cloudCompanyId:'co',localCompanyId:'local',recoveryId:'missing'}));
 assert.ok(calls.some(([sql])=>sql==='ROLLBACK'));
 assert.ok(!calls.some(([sql])=>sql?.startsWith('insert into public.company_local_bindings')));
});
test('coordinator refuses partial private configuration; fake injected reviewer flags give no authority',()=>{
 assert.throws(()=>createCompanyOwnershipCoordinator({}),/not configured/);
 assert.throws(()=>createCompanyOwnershipCoordinator({authClient:{auth:{getUser:async()=>{}}},privatePool:{connect:async()=>{}}}),/not configured/);
});
