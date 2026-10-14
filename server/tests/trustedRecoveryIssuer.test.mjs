import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrustedRecoveryIssuer} from '../trustedRecoveryIssuer.mjs';
function setup() {
  const approvals=new Map(), audits=[];
  const reviewer={userId:'reviewer',active:true,canApproveRecovery:true};
  const evidence={id:'proof',companyId:'co',ownerId:'owner',reviewerId:'reviewer',
    kind:'verified-restore',localCompanyId:'local',verified:true};
  const issuer=createTrustedRecoveryIssuer({
    resolveReviewer:async()=>reviewer,
    verifyRecovery:async()=>evidence,
    clock:()=>1000,
    store:{async transaction(fn){
      const pending=new Map(approvals), logged=[];
      const result=await fn({
        getCompany:async()=>({ownerId:'owner',status:'active'}),
        getMembership:async(_c,u)=>({userId:u,status:'active',role:u==='owner'?'owner':'attendant'}),
        getRecovery:async id=>pending.get(id),
        putRecovery:async p=>{if(pending.has(p.id))throw Error('duplicate');pending.set(p.id,p);},
        appendApprovalAudit:async a=>logged.push(a),
      });
      approvals.clear();for(const [k,v] of pending)approvals.set(k,v);
      audits.push(...logged);return result;
    }},
  });
  return {issuer,reviewer,evidence,approvals,audits};
}
test('independently reviewed restore evidence creates a single time-limited approval',async()=>{
  const f=setup(),input={reviewSession:'reviewer',evidenceId:'proof',companyId:'co',
    kind:'verified-restore',localCompanyId:'local'};
  const result=await f.issuer.issue(input);
  assert.equal(result.expiresAt,601000);
  assert.equal(f.approvals.get('proof').status,'unused');
  assert.equal(f.audits.length,1);
  await assert.rejects(f.issuer.issue(input));
});
test('rejects unverified evidence and inactive reviewers without writing',async()=>{
  const f=setup();
  f.evidence.verified=false;
  await assert.rejects(f.issuer.issue({reviewSession:'reviewer',evidenceId:'proof',companyId:'co',
    kind:'verified-restore',localCompanyId:'local'}));
  assert.equal(f.approvals.size,0);
  f.evidence.verified=true;f.reviewer.canApproveRecovery=false;
  await assert.rejects(f.issuer.issue({reviewSession:'reviewer',evidenceId:'proof',companyId:'co',
    kind:'verified-restore',localCompanyId:'local'}));
});
test('rejects forged evidence target or recipient',async()=>{
  const f=setup();
  await assert.rejects(f.issuer.issue({reviewSession:'reviewer',evidenceId:'proof',
    companyId:'other',kind:'verified-restore',localCompanyId:'local'}));
  await assert.rejects(f.issuer.issue({reviewSession:'reviewer',evidenceId:'proof',
    companyId:'co',kind:'verified-restore',localCompanyId:'foreign'}));
  await assert.rejects(f.issuer.issue({reviewSession:'reviewer',evidenceId:'proof',
    companyId:'co',kind:'approved-transfer',recipientId:'attendant'}));
  assert.equal(f.approvals.size,0);
});
test('requires trusted callbacks and a transactional store',()=>{
  assert.throws(()=>createTrustedRecoveryIssuer({}));
});
