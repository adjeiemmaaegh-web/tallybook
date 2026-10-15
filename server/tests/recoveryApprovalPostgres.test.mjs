import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecoveryApprovalTransactionMethods} from '../recoveryApprovalPostgres.mjs';
const H='a'.repeat(64);
const payload={id:'proof',company_id:'co',owner_id:'owner',reviewer_id:'reviewer',kind:'verified-restore',
 recipient_id:null,local_company_id:'local',status:'verified',verified_at:new Date(900),
 backup_manifest_sha256:H,restore_receipt_sha256:H,transfer_review_sha256:null};
function fake(response=()=>({rowCount:1,rows:[payload]})){
 const calls=[];const tx=createRecoveryApprovalTransactionMethods({query:async(sql,params)=>{
  calls.push({sql,params});return response(sql,params);
 }});return{tx,calls};
}
test('reviewer/session verification is locked and entirely parameterized',async()=>{
 const f=fake((_sql)=>({rows:[{id:'id'}],rowCount:1}));
 assert.equal(await f.tx.assertReviewerSession('sid','reviewer',1000),true);
 assert.equal(await f.tx.assertAuthorizedReviewer('reviewer'),true);
 assert.match(f.calls[0].sql,/from auth\.sessions/);assert.match(f.calls[0].sql,/for share/i);
 assert.deepEqual(f.calls[0].params,['sid','reviewer',1000]);
 assert.match(f.calls[1].sql,/company_recovery_reviewers/);assert.match(f.calls[1].sql,/for share/i);
 assert.deepEqual(f.calls[1].params,['reviewer']);
});
test('reads exact evidence with FOR UPDATE, mapped time, opaque digests',async()=>{
 const f=fake();const found=await f.tx.getVerifiedEvidence('proof');
 assert.equal(found.verifiedAtEpochMs,900);assert.equal(found.status,'verified');
 assert.equal(found.backupManifestSha256,H);assert.equal(Object.isFrozen(found),true);
 assert.match(f.calls[0].sql,/where id=\$1 for update/i);assert.deepEqual(f.calls[0].params,['proof']);
});
test('duplicate evidence and revoked reviewer fail closed on cardinality',async()=>{
 for(const rows of [[],[payload,payload]]){
  const f=fake(()=>({rows,rowCount:rows.length}));
  assert.equal(await f.tx.getVerifiedEvidence('proof'),null);
  assert.equal(await f.tx.assertAuthorizedReviewer('reviewer'),false);
 }
});
test('evidence one-use consumption requires exact conditional status CAS',async()=>{
 const f=fake();await f.tx.consumeVerifiedEvidence('proof');
 assert.match(f.calls[0].sql,/status='consumed'/);assert.match(f.calls[0].sql,/status='verified'/);
 assert.deepEqual(f.calls[0].params,['proof']);
 const lost=fake(()=>({rows:[],rowCount:0}));
 await assert.rejects(lost.tx.consumeVerifiedEvidence('proof'),/denied/);
});
test('approval/audit are parameterized and reject non-exact writes',async()=>{
 const f=fake();await f.tx.putRecovery({id:'proof',companyId:'co',ownerId:'owner',kind:'verified-restore',
 localCompanyId:'local',status:'unused',expiresAt:601000});
 await f.tx.appendApprovalAudit({type:'recovery-approval-created',companyId:'co',
 reviewerId:'reviewer',evidenceId:'proof',at:1000});
 assert.equal(f.calls.length,2);assert.equal(f.calls[0].params[0],'proof');assert.equal(f.calls[1].params[2],'proof');
 const bad=fake(()=>({rowCount:0}));
 await assert.rejects(bad.tx.putRecovery({id:'proof',companyId:'co',ownerId:'owner',kind:'verified-restore',status:'unused',expiresAt:601000}),/denied/);
});
