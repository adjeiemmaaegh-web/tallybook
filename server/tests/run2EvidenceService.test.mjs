import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun2EvidenceService} from '../run2EvidenceService.mjs';
const ids={owner:'11111111-1111-4111-8111-111111111111',
  reviewer:'33333333-3333-4333-8333-333333333333',
  recipient:'44444444-4444-4444-8444-444444444444',
  company:'55555555-5555-4555-8555-555555555555'};
function harness(config={}){
  const cases=new Map(),audit=[],sessions=[];
  let failAudit=false,sessionActive=true;
  const service=createRun2EvidenceService({
    resolveSession:async token=>({userId:ids[token],sessionId:'sid-'+token,
      active:true,expiresAtEpochMs:300000}),
    clock:()=>1000,
    restoreDrill:async id=>config.noDrill?null:{
      companyId:'local',backupArtifactId:'vault-1',
      backupManifestSha256:'a'.repeat(64),restoreReceiptSha256:'b'.repeat(64)},
    store:{async transaction(fn){
      const staged=new Map([...cases].map(([k,v])=>[k,{...v}])),events=[];
      const tx={
        assertActiveSession:async(s,u)=>{sessions.push([s,u]);return sessionActive;},
        assertAuthorizedReviewer:async u=>u===ids.reviewer,
        getCompany:async c=>({id:c,status:'active',ownerId:ids.owner}),
        getMembership:async(c,u)=>({companyId:c,userId:u,status:'active',
          role:u===ids.owner?'owner':'attendant'}),
        insertPendingEvidence:async e=>{staged.set(e.id,{...e,status:'pending'});},
        getPendingEvidence:async id=>staged.get(id)||null,
        verifyEvidence:async e=>{if(staged.get(e.id)?.status!=='pending')throw Error('conflict');
          Object.assign(staged.get(e.id),e,{status:'verified'});},
        revokeEvidence:async id=>{staged.get(id).status='revoked';},
        appendEvidenceAudit:async e=>{if(failAudit)throw Error('audit failure');events.push(e);}
      };
      const result=await fn(tx);cases.clear();for(const [k,v] of staged)cases.set(k,v);
      audit.push(...events);return result;
    }}
  });
  return {service,cases,audit,sessions,denySessions:()=>sessionActive=false,
    failAudit:()=>failAudit=true};
}
const request=h=>h.service.request({session:'owner',companyId:ids.company,
  reviewerId:ids.reviewer,kind:'verified-restore',localCompanyId:'local',
  backupArtifactId:'vault-1'});
test('owner creates pending record with audit, not a verified grant',async()=>{
  const h=harness(),result=await request(h);
  assert.equal(result.status,'pending');
  assert.equal(h.cases.get(result.id).status,'pending');
  assert.equal(h.audit[0].action,'requested');
});
test('independent reviewer verifies trusted disposable restore receipt once',async()=>{
  const h=harness(),p=await request(h);
  const result=await h.service.verify({reviewSession:'reviewer',evidenceId:p.id});
  assert.equal(result.status,'verified');
  assert.equal(h.cases.get(p.id).restoreReceiptSha256,'b'.repeat(64));
  await assert.rejects(h.service.verify({reviewSession:'reviewer',evidenceId:p.id}));
});
test('never verify from absent isolated restore adapter',async()=>{
  const h=harness({noDrill:true}),p=await request(h);
  await assert.rejects(h.service.verify({reviewSession:'reviewer',evidenceId:p.id}));
  assert.equal(h.cases.get(p.id).status,'pending');
});
test('owner may revoke pending or verified evidence with audit',async()=>{
  const h=harness(),p=await request(h);
  const r=await h.service.revoke({session:'owner',evidenceId:p.id});
  assert.equal(r.status,'revoked');
  assert.equal(h.audit.at(-1).action,'revoked');
  await assert.rejects(h.service.verify({reviewSession:'reviewer',evidenceId:p.id}));
});
test('revoked sessions cannot request, verify or revoke evidence',async()=>{
  const h=harness(),p=await request(h);h.denySessions();
  await assert.rejects(request(h));
  await assert.rejects(h.service.verify({reviewSession:'reviewer',evidenceId:p.id}));
  await assert.rejects(h.service.revoke({session:'owner',evidenceId:p.id}));
  assert.equal(h.cases.get(p.id).status,'pending');
});
test('audit failure rolls back pending request in transactional store',async()=>{
  const h=harness();h.failAudit();await assert.rejects(request(h),/audit/);
  assert.equal(h.cases.size,0);assert.equal(h.audit.length,0);
});
test('owner and recipient may never become their own independent reviewer',async()=>{
  const h=harness();
  await assert.rejects(h.service.request({session:'owner',companyId:ids.company,
    reviewerId:ids.owner,kind:'verified-restore',localCompanyId:'local',backupArtifactId:'vault-1'}));
  await assert.rejects(h.service.request({session:'owner',companyId:ids.company,
    reviewerId:ids.recipient,recipientId:ids.recipient,kind:'approved-transfer'}));
  assert.equal(h.cases.size,0);
});
test('verified transfer binds old owner and recipient to an immutable case digest',async()=>{
  const h=harness();
  const p=await h.service.request({session:'owner',companyId:ids.company,
    reviewerId:ids.reviewer,kind:'approved-transfer',recipientId:ids.recipient});
  const r=await h.service.verify({reviewSession:'reviewer',evidenceId:p.id});
  assert.equal(r.status,'verified');
  assert.match(h.cases.get(p.id).transferReviewSha256,/^[a-f0-9]{64}$/);
});
