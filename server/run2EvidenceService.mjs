import {randomUUID,createHash} from 'node:crypto';
const ID=/^[A-Za-z0-9:_-]{1,128}$/;
const ok=x=>typeof x==='string'&&ID.test(x);
const fail=()=>{throw Error('Recovery evidence operation denied');};
const hash=x=>createHash('sha256').update(x).digest('hex');
/** All identities and approvals use private live-session SQL reads. */
export function createRun2EvidenceService({resolveSession,store,restoreDrill,clock=Date.now}){
  if(typeof resolveSession!=='function'||typeof store?.transaction!=='function'||typeof clock!=='function')fail();
  async function principal(token){
    const actor=await resolveSession(token);
    if(!ok(actor?.userId)||!ok(actor?.sessionId)||actor?.active!==true||
       !Number.isSafeInteger(actor?.expiresAtEpochMs))fail();
    return actor;
  }
  async function guard(tx,actor){
    const now=clock();
    if(!Number.isSafeInteger(now)||now<=0||now>=actor.expiresAtEpochMs||
       await tx.assertActiveSession(actor.sessionId,actor.userId,now)!==true)fail();
    return now;
  }
  async function owner(tx,companyId,userId){
    const company=await tx.getCompany(companyId);
    const member=await tx.getMembership(companyId,userId);
    if(company?.ownerId!==userId||company?.status!=='active'||
       member?.userId!==userId||member?.role!=='owner'||member?.status!=='active')fail();
  }
  return Object.freeze({
    async request({session,companyId,reviewerId,kind,localCompanyId=null,recipientId=null,backupArtifactId=null}){
      if(!ok(companyId)||!ok(reviewerId)||!['verified-restore','approved-transfer'].includes(kind)||
        (kind==='verified-restore'&&(!ok(localCompanyId)||!ok(backupArtifactId)||recipientId!==null))||
        (kind==='approved-transfer'&&(!ok(recipientId)||localCompanyId!==null||backupArtifactId!==null)))fail();
      const actor=await principal(session);
      if(actor.userId===reviewerId||recipientId===reviewerId||recipientId===actor.userId)fail();
      const id=randomUUID();
      return store.transaction(async tx=>{
        const now=await guard(tx,actor);
        await owner(tx,companyId,actor.userId);
        if(await tx.assertAuthorizedReviewer(reviewerId)!==true)fail();
        if(kind==='approved-transfer'){
          const next=await tx.getMembership(companyId,recipientId);
          if(next?.userId!==recipientId||next?.role!=='attendant'||next?.status!=='active')fail();
        }
        await tx.insertPendingEvidence({id,companyId,ownerId:actor.userId,reviewerId,
          kind,localCompanyId,recipientId,backupArtifactId,requestedAt:now});
        await tx.appendEvidenceAudit({id,companyId,actorId:actor.userId,action:'requested',at:now});
        return Object.freeze({id,companyId,kind,status:'pending'});
      });
    },
    async verify({reviewSession,evidenceId}){
      if(!ok(evidenceId))fail();
      const reviewer=await principal(reviewSession);
      // Drill is performed by the configured isolated verifier, never by a
      // browser-supplied restorePassed flag. No verifier means fail-closed.
      const prepared=typeof restoreDrill==='function'
        ? await restoreDrill(evidenceId) : null;
      return store.transaction(async tx=>{
        const now=await guard(tx,reviewer);
        if(await tx.assertAuthorizedReviewer(reviewer.userId)!==true)fail();
        const e=await tx.getPendingEvidence(evidenceId);
        if(e?.status!=='pending'||e.reviewerId!==reviewer.userId||
           reviewer.userId===e.ownerId||reviewer.userId===e.recipientId||
           !Number.isSafeInteger(e.requestedAt)||e.requestedAt>now||
           now-e.requestedAt>24*60*60*1000)fail();
        await owner(tx,e.companyId,e.ownerId);
        let backupManifestSha256=null,restoreReceiptSha256=null,transferReviewSha256=null;
        if(e.kind==='verified-restore'){
          if(prepared?.companyId!==e.localCompanyId||
             prepared?.backupArtifactId!==e.backupArtifactId||
             !/^[a-f0-9]{64}$/.test(prepared?.backupManifestSha256??'')||
             !/^[a-f0-9]{64}$/.test(prepared?.restoreReceiptSha256??''))fail();
          backupManifestSha256=prepared.backupManifestSha256;
          restoreReceiptSha256=prepared.restoreReceiptSha256;
        }else if(e.kind==='approved-transfer'){
          const target=await tx.getMembership(e.companyId,e.recipientId);
          if(target?.status!=='active'||target?.role!=='attendant')fail();
          transferReviewSha256=hash(JSON.stringify([e.id,e.companyId,e.ownerId,e.recipientId,e.requestedAt]));
        }else fail();
        await tx.verifyEvidence({id:e.id,reviewerId:reviewer.userId,at:now,
          backupManifestSha256,restoreReceiptSha256,transferReviewSha256});
        await tx.appendEvidenceAudit({id:e.id,companyId:e.companyId,actorId:reviewer.userId,
          action:'verified',at:now});
        return Object.freeze({id:e.id,status:'verified',companyId:e.companyId});
      });
    },
    async revoke({session,evidenceId}){
      if(!ok(evidenceId))fail();
      const actor=await principal(session);
      return store.transaction(async tx=>{
        const now=await guard(tx,actor);
        const e=await tx.getPendingEvidence(evidenceId);
        if(!e||!['pending','verified'].includes(e.status)||
           actor.userId!==e.ownerId&&actor.userId!==e.reviewerId)fail();
        if(actor.userId===e.reviewerId &&
           await tx.assertAuthorizedReviewer(actor.userId)!==true)fail();
        await tx.revokeEvidence(e.id);
        await tx.appendEvidenceAudit({id:e.id,companyId:e.companyId,actorId:actor.userId,
          action:'revoked',at:now});
        return Object.freeze({id:e.id,status:'revoked'});
      });
    }
  });
}
