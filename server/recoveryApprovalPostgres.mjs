/** Server-side PostgreSQL recovery approval adapter.
 * Requires an existing private transaction client supplied by the ownership
 * transaction service. Not available to browser clients or public API routes.
 */
export function createRecoveryApprovalTransactionMethods(client) {
  if (!client || typeof client.query !== 'function') throw Error('Private SQL transaction required');
  return Object.freeze({
    async putRecovery(proof) {
      if (!proof || proof.status !== 'unused' ||
          !['verified-restore','approved-transfer'].includes(proof.kind) ||
          !Number.isSafeInteger(proof.expiresAt) || proof.expiresAt <= 0)
        throw Error('Invalid recovery approval');
      const result = await client.query(
        'insert into public.company_recovery_approvals(id,company_id,owner_id,recipient_id,local_company_id,kind,status,expires_at) values($1,$2,$3,$4,$5,$6,$7,to_timestamp($8::double precision/1000)) returning id',
        [proof.id,proof.companyId,proof.ownerId,proof.recipientId??null,
          proof.localCompanyId??null,proof.kind,proof.status,proof.expiresAt]);
      if (result?.rowCount !== 1) throw Error('Recovery approval insert conflict');
    },
    async appendApprovalAudit(event) {
      if (event?.type !== 'recovery-approval-created' ||
          !Number.isSafeInteger(event.at) || event.at <= 0)
        throw Error('Invalid recovery audit event');
      const result = await client.query(
        'insert into public.company_recovery_approval_audit(company_id,reviewer_id,recovery_id,created_at) values($1,$2,$3,to_timestamp($4::double precision/1000)) returning id',
        [event.companyId,event.reviewerId,event.evidenceId,event.at]);
      if (result?.rowCount !== 1) throw Error('Recovery approval audit conflict');
    },
  });
}
