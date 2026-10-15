/**
 * Private PostgreSQL adapter for Stage 9 device enrollment. This is NOT a
 * browser Supabase client. The database schema is review-only until migrated.
 * A SERIALIZABLE transaction contains each proof consumption and grant write.
 */
const deny = () => { throw Error('Store/device enrollment database operation denied'); };
const one = result => { if (result?.rowCount !== 1) deny(); };
const dateMs = date => date instanceof Date ? date.getTime() : Date.parse(date);

export function createPostgresStoreDeviceEnrollmentStore(pool) {
  if (typeof pool?.connect !== 'function') deny();
  return Object.freeze({
    async transaction(work) {
      if (typeof work !== 'function') deny();
      const client = await pool.connect();
      if (typeof client?.query !== 'function' || typeof client?.release !== 'function') deny();
      let started = false;
      try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        started = true;
        const tx = Object.freeze({
          async getCompany(id) {
            const rows = await client.query('select id,owner_id from public.businesses where id=$1::uuid for share', [id]);
            if (rows?.rows?.length !== 1) return null;
            return {id:rows.rows[0].id,ownerId:rows.rows[0].owner_id};
          },
          async getMembership(companyId,userId) {
            const rows = await client.query('select business_id,user_id,role from public.business_members where business_id=$1::uuid and user_id=$2::uuid for share', [companyId,userId]);
            if (rows?.rows?.length !== 1) return null;
            const m = rows.rows[0];
            return {companyId:m.business_id,userId:m.user_id,role:m.role,status:'active'};
          },
          async getStore(companyId,storeId) {
            const rows = await client.query('select id,company_id,status from public.company_store_scopes where company_id=$1::uuid and id=$2 for share', [companyId,storeId]);
            if (rows?.rows?.length !== 1) return null;
            const s = rows.rows[0];
            return {id:s.id,companyId:s.company_id,status:s.status};
          },
          async getInvitation(tokenDigest) {
            const rows = await client.query(`select id,company_id,store_id,target_user_id,issued_by,token_digest,status,expires_at
              from public.company_device_enrollment_invites where token_digest=$1 for update`,[tokenDigest]);
            if (rows?.rows?.length !== 1) return null;
            const p = rows.rows[0];
            return {id:p.id,companyId:p.company_id,storeId:p.store_id,targetUserId:p.target_user_id,
              issuedBy:p.issued_by,tokenDigest:p.token_digest,status:p.status,expiresAt:dateMs(p.expires_at)};
          },
          async insertInvitation(i) {
            one(await client.query(`insert into public.company_device_enrollment_invites
              (id,company_id,store_id,target_user_id,issued_by,token_digest,status,created_at,expires_at)
              values($1::uuid,$2::uuid,$3,$4::uuid,$5::uuid,$6,'unused',to_timestamp($7::double precision/1000),to_timestamp($8::double precision/1000)) returning id`,
              [i.id,i.companyId,i.storeId,i.targetUserId,i.issuedBy,i.tokenDigest,i.createdAt,i.expiresAt]));
          },
          async consumeInvitation(id) {
            one(await client.query(`update public.company_device_enrollment_invites
              set status='used' where id=$1::uuid and status='unused' returning id`,[id]));
          },
          async insertGrant(g) {
            one(await client.query(`insert into public.company_device_grants
              (id,company_id,store_id,user_id,status,created_at,expires_at)
              values($1,$2::uuid,$3,$4::uuid,'active',to_timestamp($5::double precision/1000),to_timestamp($6::double precision/1000)) returning id`,
              [g.id,g.companyId,g.storeId,g.userId,g.createdAt,g.expiresAt]));
          },
          async getGrant(companyId, grantId) {
            const rows = await client.query('select id,company_id,store_id,user_id,status from public.company_device_grants where company_id=$1::uuid and id=$2 for update',[companyId,grantId]);
            if(rows?.rows?.length !== 1) return null;
            const g=rows.rows[0];return {id:g.id,companyId:g.company_id,storeId:g.store_id,userId:g.user_id,status:g.status};
          },
          async revokeGrant(companyId,grantId) {
            one(await client.query(`update public.company_device_grants set status='revoked'
              where company_id=$1::uuid and id=$2 and status='active' returning id`,[companyId,grantId]));
          },
          async appendAudit(a) {
            one(await client.query(`insert into public.company_device_enrollment_audit
              (action,company_id,store_id,actor_id,target_user_id,grant_id,invite_id,event_at)
              values($1,$2::uuid,$3,$4::uuid,$5::uuid,$6::uuid,$7::uuid,to_timestamp($8::double precision/1000)) returning id`,
              [a.action,a.companyId,a.storeId,a.actorId,a.targetUserId,a.grantId,a.inviteId,a.at]));
          },
        });
        const result = await work(tx);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        if (started) await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally { client.release(); }
    },
  });
}
