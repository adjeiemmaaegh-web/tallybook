/** Server-only approval issuance. Never call from a browser route directly.
 * The verification callbacks must use independently obtained evidence, not
 * claimed booleans or company IDs supplied by a caller.
 */
const ID=/^[A-Za-z0-9:_-]{1,128}$/;
const valid=x=>typeof x==='string'&&ID.test(x);
const denied=()=>{throw Error('Recovery approval issuance denied');};
export function createTrustedRecoveryIssuer({resolveReviewer,verifyRecovery,store,clock=Date.now}) {
  if(typeof resolveReviewer!=='function'||typeof verifyRecovery!=='function'||
     typeof store?.transaction!=='function'||typeof clock!=='function')denied();
  return Object.freeze({
    async issue({reviewSession,evidenceId,companyId,kind,recipientId=null,localCompanyId=null}) {
      if(!valid(evidenceId)||!valid(companyId)||!['verified-restore','approved-transfer'].includes(kind)||
        (kind==='verified-restore'&&(!valid(localCompanyId)||recipientId!==null))||
        (kind==='approved-transfer'&&(!valid(recipientId)||localCompanyId!==null)))denied();
      const reviewer=await resolveReviewer(reviewSession);
      if(!valid(reviewer?.userId)||reviewer?.active!==true||reviewer?.canApproveRecovery!==true)denied();
      // Fetch facts afresh from the trusted evidence provider; never accept
      // caller-supplied restore-success flags or an unchecked owner claim.
      const evidence=await verifyRecovery(evidenceId);
      if(evidence?.id!==evidenceId||evidence?.companyId!==companyId||
        evidence?.kind!==kind||evidence?.verified!==true||
        !valid(evidence?.ownerId)||evidence?.reviewerId!==reviewer.userId||
        (kind==='verified-restore'&&evidence?.localCompanyId!==localCompanyId)||
        (kind==='approved-transfer'&&evidence?.recipientId!==recipientId))denied();
      const now=clock();
      if(!Number.isSafeInteger(now)||now<0)denied();
      return store.transaction(async tx=>{
        if(!tx||!['getCompany','getMembership','getRecovery','putRecovery','appendApprovalAudit'].every(k=>typeof tx[k]==='function'))denied();
        const company=await tx.getCompany(companyId);
        if(company?.ownerId!==evidence.ownerId||company?.status!=='active')denied();
        const owner=await tx.getMembership(companyId,evidence.ownerId);
        if(owner?.status!=='active'||owner?.role!=='owner'||owner?.userId!==evidence.ownerId)denied();
        if(kind==='approved-transfer'){
          const recipient=await tx.getMembership(companyId,recipientId);
          if(recipient?.userId!==recipientId||recipient?.status!=='active'||recipient?.role!=='attendant')denied();
        }
        if(await tx.getRecovery(evidenceId))denied();
        const approval=Object.freeze({id:evidenceId,companyId,ownerId:evidence.ownerId,
          kind,recipientId,localCompanyId,status:'unused',expiresAt:now+10*60*1000});
        await tx.putRecovery(approval);
        await tx.appendApprovalAudit(Object.freeze({type:'recovery-approval-created',companyId,
          reviewerId:reviewer.userId,evidenceId,at:now}));
        return Object.freeze({id:evidenceId,companyId,expiresAt:approval.expiresAt});
      });
    },
  });
}
