import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun2ReviewerProvisioner} from '../run2ReviewerProvisioning.mjs';
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'];
function setup({approved=true,throwAudit=false}={}){
 const calls=[],client={
  async query(sql,args){calls.push(sql);
   if(sql.startsWith('select id from auth.users'))return {rows:ids.map(id=>({id})),rowCount:3};
   if(throwAudit&&sql.includes('company_recovery_reviewer_approvals'))throw Error('audit failed');
   return {rows:[{id:'ok'}],rowCount:1};
  },release(){calls.push('RELEASE');}
 };
 const service=createRun2ReviewerProvisioner({privatePool:{connect:async()=>client},
  verifyOperatorApprovals:async()=>approved,clock:()=>1000});
 return {service,calls};
}
const args={reviewerId:ids[0],operatorA:ids[1],operatorB:ids[2],
 approvalId:'44444444-4444-4444-8444-444444444444',approvalDigest:'a'.repeat(64)};
test('two distinct approved operators atomically provision reviewer and audit',async()=>{
 const h=setup(),r=await h.service.provision(args);
 assert.equal(r.status,'active');assert.ok(h.calls.includes('COMMIT'));
 assert.ok(h.calls.some(s=>s.includes('company_recovery_reviewer_approvals')));
});
test('candidate and operator cannot be the same account',async()=>{
 const h=setup();await assert.rejects(h.service.provision({...args,operatorB:ids[0]}));
 assert.equal(h.calls.length,0);
});
test('operator approvals must be independently verified',async()=>{
 const h=setup({approved:false});await assert.rejects(h.service.provision(args));
 assert.equal(h.calls.length,0);
});
test('missing reviewer audit rolls back provisioning',async()=>{
 const h=setup({throwAudit:true});await assert.rejects(h.service.provision(args));
 assert.ok(h.calls.includes('ROLLBACK'));assert.ok(h.calls.includes('RELEASE'));
});
