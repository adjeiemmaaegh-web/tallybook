/** Private transactional PostgreSQL recovery approval and evidence adapter.
 * All methods use the SAME client from BEGIN ISOLATION LEVEL SERIALIZABLE.
 * The proposed evidence/reviewer tables are review-only and are NOT deployed.
 */
const denied=()=>{throw Error('Trusted recovery evidence access denied');};
const exactlyOne=result=>{if(result?.rowCount!==1)denied();};
const epoch=value=>value instanceof Date?value.getTime():Date.parse(value);
export function createRecoveryApprovalTransactionMethods(client) {
  if(typeof client?.query!=='function')denied();
  return Object.freeze({
    async assertReviewerSession(sessionId,userId,now) {
      const result=await client.query(`select id from auth.sessions where id=$1::uuid and user_id=$2::uuid
        and (not_after is null or not_after>to_timestamp($3::double precision/1000)) for share`,
        [sessionId,userId,now]);
      return result?.rows?.length===1;
    },
    async assertAuthorizedReviewer(userId) {
      const result=await client.query(`select user_id from public.company_recovery_reviewers
        where user_id=$1::uuid and status='active' for share`,[userId]);
      return result?.rows?.length===1;
    },
    async getVerifiedEvidence(id) {
      const result=await client.query(`select id,company_id,owner_id,reviewer_id,kind,
        recipient_id,local_company_id,status,verified_at,backup_manifest_sha256,
        restore_receipt_sha256,transfer_review_sha256
        from public.company_recovery_verified_evidence where id=$1 for update`,[id]);
      if(result?.rows?.length!==1)return null;
      const row=result.rows[0];
      return Object.freeze({id:row.id,companyId:row.company_id,ownerId:row.owner_id,
        reviewerId:row.reviewer_id,kind:row.kind,recipientId:row.recipient_id,
        localCompanyId:row.local_company_id,status:row.status,
        verifiedAtEpochMs:epoch(row.verified_at),
        backupManifestSha256:row.backup_manifest_sha256,
        restoreReceiptSha256:row.restore_receipt_sha256,
        transferReviewSha256:row.transfer_review_sha256});
    },
    async consumeVerifiedEvidence(id) {
      exactlyOne(await client.query(`update public.company_recovery_verified_evidence
        set status='consumed' where id=$1 and status='verified' returning id`,[id]));
    },
    async putRecovery(proof) {
      if (!proof || proof.status !== 'unused' ||
          !['verified-restore','approved-transfer'].includes(proof.kind) ||
          !Number.isSafeInteger(proof.expiresAt) || proof.expiresAt <= 0)
        throw Error('Invalid recovery approval');
      exactlyOne(await client.query(
        'insert into public.company_recovery_approvals(id,company_id,owner_id,recipient_id,local_company_id,kind,status,expires_at) values($1,$2,$3,$4,$5,$6,$7,to_timestamp($8::double precision/1000)) returning id',
        [proof.id,proof.companyId,proof.ownerId,proof.recipientId??null,
          proof.localCompanyId??null,proof.kind,proof.status,proof.expiresAt]));
    },
    async appendApprovalAudit(event) {
      if (event?.type !== 'recovery-approval-created' ||
          !Number.isSafeInteger(event.at) || event.at <= 0)
        throw Error('Invalid recovery audit event');
      exactlyOne(await client.query(
        'insert into public.company_recovery_approval_audit(company_id,reviewer_id,recovery_id,created_at) values($1,$2,$3,to_timestamp($4::double precision/1000)) returning id',
        [event.companyId,event.reviewerId,event.evidenceId,event.at]));
    },
  });
}
