import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrustedRecoveryIssuer} from '../trustedRecoveryIssuer.mjs';
const H='a'.repeat(64),J='b'.repeat(64),K='c'.repeat(64);
const input=()=>({reviewSession:'reviewer-token',evidenceId:'proof',companyId:'co',kind:'verified-restore',localCompanyId:'local'});
const error=/Recovery approval issuance denied/;
function harness(options={}) {
  const approvals=new Map(),events=[],calls=[];
  let reviewerAuthorized=true,sessionActive=true,ownerId='owner';
  const reviewer={userId:'reviewer',sessionId:'session',active:true,expiresAtEpochMs:2000};
  const proof={id:'proof',companyId:'co',ownerId:'owner',reviewerId:'reviewer',kind:'verified-restore',
    recipientId:null,localCompanyId:'local',status:'verified',verifiedAtEpochMs:900,
    backupManifestSha256:H,restoreReceiptSha256:J,transferReviewSha256:null};
  const issuer=createTrustedRecoveryIssuer({
    resolveReviewer:async()=>reviewer,clock:()=>options.clock??1000,
    store:{async transaction(fn){
      calls.push('BEGIN');const pending=new Map(approvals),audit=[...events],proofBefore={...proof};
      const tx={
        assertReviewerSession:async()=>{calls.push('session-read');return sessionActive;},
        assertAuthorizedReviewer:async()=>{calls.push('reviewer-read');return reviewerAuthorized;},
        getVerifiedEvidence:async()=>{calls.push('proof-lock');return {...proof};},
        consumeVerifiedEvidence:async()=>{calls.push('consume');if(proof.status!=='verified')throw Error('conflict');proof.status='consumed';},
        getCompany:async id=>({id,ownerId,status:'active'}),
        getMembership:async(id,u)=>({companyId:id,userId:u,role:u===ownerId?'owner':'attendant',status:'active'}),
        getRecovery:async id=>pending.get(id)??null,
        putRecovery:async p=>{calls.push('insert');if(options.failInsert)throw Error('insert failed');pending.set(p.id,p);},
        appendApprovalAudit:async a=>{calls.push('audit');if(options.failAudit)throw Error('audit failed');audit.push(a);},
      };
      try{const result=await fn(tx);approvals.clear();for(const [k,v] of pending)approvals.set(k,v);events.splice(0,events.length,...audit);calls.push('COMMIT');return result;}
      catch(e){Object.assign(proof,proofBefore);calls.push('ROLLBACK');throw e;}
    }},
  });
  return {issuer,proof,reviewer,approvals,events,calls,
    authorizeReviewer:x=>reviewerAuthorized=x,authorizeSession:x=>sessionActive=x,
    setOwner:x=>ownerId=x};
}
test('verified restore drill, independent reviewer and live session issue 10-minute approval atomically',async()=>{
  const h=harness(),result=await h.issuer.issue(input());
  assert.equal(result.expiresAt,601000);
  assert.equal(h.proof.status,'consumed');assert.equal(h.approvals.get('proof').status,'unused');
  assert.deepEqual(h.events.map(e=>e.type),['recovery-approval-created']);
  assert.deepEqual(h.calls.slice(0,4),['BEGIN','session-read','reviewer-read','proof-lock']);
  assert.equal(h.calls.at(-1),'COMMIT');await assert.rejects(h.issuer.issue(input()),error);
});
test('revoked reviewer authorization and revoked Supabase session deny inside transaction',async()=>{
  for(const kind of ['reviewer','session']){const h=harness();
    if(kind==='reviewer')h.authorizeReviewer(false);else h.authorizeSession(false);
    await assert.rejects(h.issuer.issue(input()),error);
    assert.equal(h.calls.includes('insert'),false);assert.equal(h.calls.at(-1),'ROLLBACK');}
});
test('only verified independent restore evidence with actual digest receipts is usable',async()=>{
 for(const variant of [
  {status:'pending'},{status:'revoked'},{status:'used'},{ownerId:'reviewer'},{reviewerId:'elsewhere'},
  {localCompanyId:'wrong'},{backupManifestSha256:null},{restoreReceiptSha256:'bad'},
  {verifiedAtEpochMs:1001},{verifiedAtEpochMs:-999999999},
  {companyId:'foreign'},{kind:'approved-transfer'},{recipientId:'foreign'},
 ]){
  const h=harness();Object.assign(h.proof,variant);await assert.rejects(h.issuer.issue(input()),error);
  assert.equal(h.approvals.size,0);assert.equal(h.proof.status,variant.status??'verified');
 }
});
test('owner reassignment during review invalidates stale ownership proof',async()=>{
  const h=harness();h.setOwner('former');await assert.rejects(h.issuer.issue(input()),error);
  assert.equal(h.events.length,0);
});
test('approved owner transfer needs exact recipient and transfer review digest',async()=>{
 const h=harness(),req={reviewSession:'x',evidenceId:'proof',companyId:'co',kind:'approved-transfer',recipientId:'recipient'};
 Object.assign(h.proof,{kind:'approved-transfer',recipientId:'recipient',localCompanyId:null,
  transferReviewSha256:K});
 const result=await h.issuer.issue(req);assert.equal(result.expiresAt,601000);
});
test('missing, invalid or ambiguous inputs reject without database mutation',async()=>{
 const h=harness();for(const bad of [
  {...input(),localCompanyId:'different'}, {...input(),recipientId:'recipient'},
  {...input(),evidenceId:'!!!'}, {...input(),kind:'extra'},
 ])await assert.rejects(h.issuer.issue(bad),error);
 assert.equal(h.calls.includes('insert'),false);
 h.reviewer.sessionId='';await assert.rejects(h.issuer.issue(input()),error);
});
test('failed approval insertion and failed audit roll back evidence consumption and writes',async()=>{
 for(const opts of [{failInsert:true},{failAudit:true}]){
  const h=harness(opts);await assert.rejects(h.issuer.issue(input()),/failed/);
  assert.equal(h.proof.status,'verified');assert.equal(h.approvals.size,0);
  assert.equal(h.events.length,0);assert.equal(h.calls.at(-1),'ROLLBACK');
 }
});
test('old external verifyRecovery callback cannot substitute for locked DB evidence',async()=>{
 const h=harness();const service=createTrustedRecoveryIssuer({
  resolveReviewer:async()=>({userId:'reviewer',sessionId:'session',active:true,expiresAtEpochMs:2000}),
  verifyRecovery:async()=>({...h.proof,verified:true}),
  store:{transaction:fn=>fn({getCompany:async()=>({id:'co',ownerId:'owner',status:'active'})})},clock:()=>1000});
 await assert.rejects(service.issue(input()),error);
});
test('requires trusted reviewer resolver and transactional provider',()=>{
 assert.throws(()=>createTrustedRecoveryIssuer({}),error);
});

test('expired or missing reviewer JWT deadline denies before database evidence inspection',async()=>{
  for(const expiresAtEpochMs of [1000,0,null]){
    const h=harness();h.reviewer.expiresAtEpochMs=expiresAtEpochMs;
    await assert.rejects(h.issuer.issue(input()),error);
    assert.equal(h.calls.includes('proof-lock'),false);
    assert.equal(h.approvals.size,0);
  }
});

test('transfer recipient cannot act as their own independent recovery reviewer',async()=>{
  const h=harness();
  const req={reviewSession:'reviewer-token',evidenceId:'proof',companyId:'co',
    kind:'approved-transfer',recipientId:'reviewer'};
  Object.assign(h.proof,{kind:'approved-transfer',recipientId:'reviewer',localCompanyId:null,
    transferReviewSha256:K,backupManifestSha256:null,restoreReceiptSha256:null});
  await assert.rejects(h.issuer.issue(req),error);
  assert.equal(h.approvals.size,0);
  assert.equal(h.proof.status,'verified');
  assert.equal(h.events.length,0);
});
