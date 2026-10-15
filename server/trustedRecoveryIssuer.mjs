/** Server-only recovery approval issuer. Review/evidence facts MUST be read and
 * consumed under the SAME serializable private SQL transaction as the approval.
 * An earlier Supabase getUser is not a replacement for the locked session read.
 * Never expose this service to browsers or assume an IndexedDB backup is proof.
 */
const ID=/^[A-Za-z0-9:_-]{1,128}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const valid=x=>typeof x==='string'&&ID.test(x);
const denied=()=>{throw Error('Recovery approval issuance denied');};
export function createTrustedRecoveryIssuer({resolveReviewer,store,clock=Date.now}) {
  if(typeof resolveReviewer!=='function'||typeof store?.transaction!=='function'||typeof clock!=='function')denied();
  return Object.freeze({
    async issue({reviewSession,evidenceId,companyId,kind,recipientId=null,localCompanyId=null}) {
      if(!valid(evidenceId)||!valid(companyId)||!['verified-restore','approved-transfer'].includes(kind)||
        (kind==='verified-restore'&&(!valid(localCompanyId)||recipientId!==null))||
        (kind==='approved-transfer'&&(!valid(recipientId)||localCompanyId!==null)))denied();
      const reviewer=await resolveReviewer(reviewSession);
      if(!valid(reviewer?.userId)||!valid(reviewer?.sessionId)||reviewer?.active!==true)denied();
      return store.transaction(async tx=>{
        if(!tx||!['assertReviewerSession','assertAuthorizedReviewer','getVerifiedEvidence',
          'consumeVerifiedEvidence','getCompany','getMembership','getRecovery','putRecovery',
          'appendApprovalAudit'].every(k=>typeof tx[k]==='function'))denied();
        const now=clock();
        if(!Number.isSafeInteger(now)||now<=0||now>Number.MAX_SAFE_INTEGER-600000)denied();
        // These are locked database reads, never claims in reviewer/session JSON.
        if(await tx.assertReviewerSession(reviewer.sessionId,reviewer.userId,now)!==true ||
           await tx.assertAuthorizedReviewer(reviewer.userId)!==true)denied();
        const evidence=await tx.getVerifiedEvidence(evidenceId);
        if(evidence?.id!==evidenceId||evidence?.companyId!==companyId||
          evidence?.kind!==kind||evidence?.status!=='verified'||
          evidence?.reviewerId!==reviewer.userId||!valid(evidence?.ownerId)||
          reviewer.userId===evidence.ownerId||
          (kind==='verified-restore' && (evidence.localCompanyId!==localCompanyId ||
            evidence.recipientId!==null || !DIGEST.test(evidence.backupManifestSha256??'') ||
            !DIGEST.test(evidence.restoreReceiptSha256??''))) ||
          (kind==='approved-transfer' && (evidence.recipientId!==recipientId ||
            evidence.localCompanyId!==null || !DIGEST.test(evidence.transferReviewSha256??''))) ||
          !Number.isSafeInteger(evidence.verifiedAtEpochMs)||evidence.verifiedAtEpochMs<=0||
          evidence.verifiedAtEpochMs>now||now-evidence.verifiedAtEpochMs>24*60*60*1000)denied();
        const company=await tx.getCompany(companyId);
        if(company?.id!==companyId||company?.ownerId!==evidence.ownerId||company?.status!=='active')denied();
        const owner=await tx.getMembership(companyId,evidence.ownerId);
        if(owner?.companyId!==companyId||owner?.userId!==evidence.ownerId||
           owner?.status!=='active'||owner?.role!=='owner')denied();
        if(kind==='approved-transfer'){
          const recipient=await tx.getMembership(companyId,recipientId);
          if(recipient?.companyId!==companyId||recipient?.userId!==recipientId||
             recipient?.status!=='active'||recipient?.role!=='attendant')denied();
        }
        if(await tx.getRecovery(evidenceId))denied();
        const approval=Object.freeze({id:evidenceId,companyId,ownerId:evidence.ownerId,
          kind,recipientId,localCompanyId,status:'unused',expiresAt:now+10*60*1000});
        await tx.putRecovery(approval);
        // Compare-and-set from 'verified' to 'consumed', same transaction.
        // A failure anywhere (including audit) MUST roll back both updates.
        await tx.consumeVerifiedEvidence(evidenceId);
        await tx.appendApprovalAudit(Object.freeze({type:'recovery-approval-created',companyId,
          reviewerId:reviewer.userId,evidenceId,at:now}));
        return Object.freeze({id:evidenceId,companyId,expiresAt:approval.expiresAt});
      });
    },
  });
}
