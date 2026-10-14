import { createRecoveryApprovalTransactionMethods } from './recoveryApprovalPostgres.mjs';
/** PostgreSQL transaction adapter for trustedCompanyOwnership.
 * Requires a PRIVATE server-side connection pool with connect()/query()/release().
 * Never instantiate in a browser or with a publishable Supabase key.
 * Requires reviewed 20261014_company_binding_recovery_review.sql migration.
 * Not connected to application routes or deployed.
 */
export function createPostgresCompanyOwnershipStore(pool) {
  if (!pool || typeof pool.connect !== 'function') throw Error('Private transaction pool required');
  return Object.freeze({
    async transaction(fn) {
      const client = await pool.connect();
      let started = false;
      try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        started = true;
        const exactlyOne = result => {
          if (result?.rowCount !== 1) throw Error('Company ownership update conflict');
        };
        const approvalMethods = createRecoveryApprovalTransactionMethods(client);
        const tx = Object.freeze({
          ...approvalMethods,
          async getCompany(id) {
            const q = await client.query('select id, owner_id from public.businesses where id=$1 for update',[id]);
            return q.rows.length === 1
              ? {id:q.rows[0].id,ownerId:q.rows[0].owner_id,status:'active'} : null;
          },
          async getMembership(companyId,userId) {
            const q=await client.query('select business_id,user_id,role from public.business_members where business_id=$1 and user_id=$2 for update',[companyId,userId]);
            return q.rows.length === 1
              ? {companyId:q.rows[0].business_id,userId:q.rows[0].user_id,role:q.rows[0].role,status:'active'} : null;
          },
          async putMembership(m) {
            if (!['owner','attendant'].includes(m?.role)) throw Error('Unsupported membership role');
            const q=await client.query('update public.business_members set role=$3 where business_id=$1 and user_id=$2 returning business_id',[m.companyId,m.userId,m.role]);
            exactlyOne(q);
          },
          async putCompanyOwner(companyId,userId) {
            const q=await client.query('update public.businesses set owner_id=$2, updated_at=now() where id=$1 returning id',[companyId,userId]);
            exactlyOne(q);
          },
          async getRecovery(id) {
            const q=await client.query('select id,company_id,owner_id,recipient_id,local_company_id,kind,status,expires_at from public.company_recovery_approvals where id=$1 for update',[id]);
            if(q.rows.length!==1)return null;
            const p=q.rows[0];
            return {id:p.id,companyId:p.company_id,ownerId:p.owner_id,recipientId:p.recipient_id,
              localCompanyId:p.local_company_id,kind:p.kind,status:p.status,
              expiresAt:p.expires_at instanceof Date?p.expires_at.getTime():Date.parse(p.expires_at)};
          },
          async consumeRecovery(id) {
            const q=await client.query("update public.company_recovery_approvals set status='consumed' where id=$1 and status='unused' returning id",[id]);
            exactlyOne(q);
          },
          async getBinding(companyId,localCompanyId) {
            const q=await client.query('select company_id from public.company_local_bindings where company_id=$1 and local_company_id=$2 for update',[companyId,localCompanyId]);
            return q.rows.length?{companyId,localCompanyId}:null;
          },
          async putBinding(binding) {
            const q=await client.query('insert into public.company_local_bindings(company_id,local_company_id,owner_id,created_at) values($1,$2,$3,to_timestamp($4::double precision/1000)) returning company_id',
              [binding.companyId,binding.localCompanyId,binding.ownerId,binding.createdAt]);
            exactlyOne(q);
          },
          async appendAudit(event) {
            const q=await client.query('insert into public.company_ownership_audit(event_type,company_id,actor_id,recipient_id,local_company_id,recovery_id,event_at) values($1,$2,$3,$4,$5,$6,to_timestamp($7::double precision/1000)) returning id',
              [event.type,event.companyId,event.actorId,event.recipientId??null,event.localCompanyId??null,event.recoveryId,event.at]);
            exactlyOne(q);
          },
        });
        const result=await fn(tx);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        if (started) await client.query('ROLLBACK').catch(()=>{});
        throw error;
      } finally {
        client.release();
      }
    },
  });
}
