/** Private PostgreSQL adapter for the UUID staff/shop binding candidate. */
const denied=()=>{throw Error('Staff/shop provisioning database denied');};
const one=result=>{if(result?.rowCount!==1)denied();};
export function createUuidStaffShopProvisioningStore(pool) {
  if(typeof pool?.connect!=='function')denied();
  return Object.freeze({async transaction(work) {
    if(typeof work!=='function')denied();
    const client=await pool.connect();
    if(typeof client?.query!=='function'||typeof client?.release!=='function')denied();
    let begun=false;
    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');begun=true;
      const tx=Object.freeze({
        async assertActiveSession(sessionId,userId,now) {
          const r=await client.query(`select id from auth.sessions where id=$1::uuid
            and user_id=$2::uuid and (not_after is null or not_after>to_timestamp($3::double precision/1000))
            for share`,[sessionId,userId,now]);
          return r?.rows?.length===1;
        },
        async getCompany(companyId) {
          const r=await client.query('select id,owner_id from public.businesses where id=$1::uuid for share',[companyId]);
          const v=r?.rows?.[0];return v?{id:v.id,ownerId:v.owner_id}:null;
        },
        async getBinding(companyId) {
          const r=await client.query(`select company_id,local_company_id,owner_id
            from public.company_local_bindings where company_id=$1::uuid for share`,[companyId]);
          const v=r?.rows?.[0];return v?{companyId:v.company_id,localCompanyId:v.local_company_id,
            ownerId:v.owner_id}:null;
        },
        async getMembership(companyId,userId) {
          const r=await client.query(`select user_id,role from public.business_members
            where business_id=$1::uuid and user_id=$2::uuid for share`,[companyId,userId]);
          const v=r?.rows?.[0];return v?{userId:v.user_id,role:v.role}:null;
        },
        async getStore(companyId,storeId) {
          const r=await client.query(`select status from public.company_store_scopes
            where company_id=$1::uuid and id=$2 for share`,[companyId,storeId]);
          const v=r?.rows?.[0];return v?{status:v.status}:null;
        },
        async insertStore(companyId,storeId) {
          one(await client.query(`insert into public.company_store_scopes(company_id,id,status)
            values($1::uuid,$2,'active') returning id`,[companyId,storeId]));
        },
        async getStaff(companyId,staffId) {
          const r=await client.query(`select user_id,active from public.company_staff_identities
            where company_id=$1::uuid and id=$2 for share`,[companyId,staffId]);
          const v=r?.rows?.[0];return v?{userId:v.user_id,active:v.active}:null;
        },
        async insertStaff(companyId,staffId,userId) {
          one(await client.query(`insert into public.company_staff_identities(company_id,id,user_id,active)
            values($1::uuid,$2,$3::uuid,true) returning id`,[companyId,staffId,userId]));
        },
        async getAssignment(companyId,storeId,staffId) {
          const r=await client.query(`select active from public.company_staff_store_assignments
            where company_id=$1::uuid and store_id=$2 and staff_id=$3 for share`,
            [companyId,storeId,staffId]);
          const v=r?.rows?.[0];return v?{active:v.active}:null;
        },
        async insertAssignment(companyId,storeId,staffId) {
          one(await client.query(`insert into public.company_staff_store_assignments
            (company_id,store_id,staff_id,active) values($1::uuid,$2,$3,true) returning staff_id`,
            [companyId,storeId,staffId]));
        },
        async appendAudit(a) {
          one(await client.query(`insert into public.company_staff_store_binding_audit
            (company_id,local_company_id,store_id,staff_id,target_user_id,actor_id,event_at)
            values($1::uuid,$2,$3,$4,$5::uuid,$6::uuid,to_timestamp($7::double precision/1000))
            returning id`,[a.companyId,a.localCompanyId,a.storeId,a.staffId,
              a.targetUserId,a.actorId,a.at]));
        },
      });
      const result=await work(tx);
      await client.query('COMMIT');return result;
    } catch(error) {
      if(begun)await client.query('ROLLBACK').catch(()=>{});
      throw error;
    } finally {client.release();}
  }});
}
