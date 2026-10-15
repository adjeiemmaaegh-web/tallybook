/** V19 Run 3 private, SERIALIZABLE PostgreSQL adapter.
 * This pool needs tightly scoped server-only privileges for auth.sessions,
 * auth.users, businesses, business_members, and Run 3 private tables.
 * Never supply a publishable Supabase key, browser client or RLS user pool.
 */
const fail=()=>{throw Error('Membership transaction denied');};
const one=r=>{if(r?.rowCount!==1)fail();return r.rows?.[0];};
const epoch=v=>v instanceof Date?v.getTime():Date.parse(v);
export function createRun3MembershipStore(pool){
  if(typeof pool?.connect!=='function')fail();
  return Object.freeze({async transaction(fn){
    const client=await pool.connect();let begun=false;
    try{
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      begun=true;
      const tx=Object.freeze({
        async assertActiveSession(sessionId,userId,now){
          const q=await client.query(`select id from auth.sessions where
            id=$1::uuid and user_id=$2::uuid
            and (not_after is null or not_after>to_timestamp($3::double precision/1000))
            for share`,[sessionId,userId,now]);
          return q?.rows?.length===1;
        },
        async getCompany(id){
          const q=await client.query('select id,owner_id from public.businesses where id=$1::uuid for update',[id]);
          if(q?.rows?.length!==1)return null;
          return {id:q.rows[0].id,ownerId:q.rows[0].owner_id,status:'active'};
        },
        async getMembership(companyId,userId){
          const q=await client.query(`select business_id,user_id,role from public.business_members
            where business_id=$1::uuid and user_id=$2::uuid for update`,[companyId,userId]);
          if(q?.rows?.length!==1)return null;
          const m=q.rows[0];
          return {companyId:m.business_id,userId:m.user_id,role:m.role,status:'active'};
        },
        async userExists(id){
          const q=await client.query('select id from auth.users where id=$1::uuid for share',[id]);
          return q?.rows?.length===1;
        },
        async hasUnexpiredInvitation(companyId,targetId,now){
          const q=await client.query(`select id from public.company_member_invites
            where company_id=$1::uuid and target_user_id=$2::uuid
            and status='pending' and expires_at>to_timestamp($3::double precision/1000)
            for update`,[companyId,targetId,now]);
          return Array.isArray(q?.rows)&&q.rows.length>0;
        },
        async insertInvitation(i){
          one(await client.query(`insert into public.company_member_invites
            (id,company_id,invited_by,target_user_id,token_sha256,status,created_at,expires_at)
            values ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,'pending',
              to_timestamp($6::double precision/1000),
              to_timestamp($7::double precision/1000)) returning id`,
            [i.id,i.companyId,i.invitedBy,i.targetUserId,i.tokenSha256,i.createdAt,i.expiresAt]));
        },
        async getInvitationByHash(digest){
          const q=await client.query(`select id,company_id,invited_by,target_user_id,
            status,expires_at from public.company_member_invites
            where token_sha256=$1 for update`,[digest]);
          return q?.rows?.length===1?invitation(q.rows[0]):null;
        },
        async getInvitationById(id){
          const q=await client.query(`select id,company_id,invited_by,target_user_id,
            status,expires_at from public.company_member_invites where id=$1::uuid for update`,[id]);
          return q?.rows?.length===1?invitation(q.rows[0]):null;
        },
        async insertAttendant(companyId,userId){
          one(await client.query(`insert into public.business_members(business_id,user_id,role)
            values($1::uuid,$2::uuid,'attendant') returning business_id`,[companyId,userId]));
        },
        async consumeInvitation(id){
          one(await client.query(`update public.company_member_invites
            set status='accepted',closed_at=now() where id=$1::uuid
            and status='pending' returning id`,[id]));
        },
        async revokeInvitation(id){
          one(await client.query(`update public.company_member_invites
            set status='revoked',closed_at=now() where id=$1::uuid
            and status='pending' returning id`,[id]));
        },
        async deleteAttendant(companyId,userId){
          one(await client.query(`delete from public.business_members where
            business_id=$1::uuid and user_id=$2::uuid and role='attendant'
            returning business_id`,[companyId,userId]));
        },
        async cancelTargetInvitations(companyId,userId){
          await client.query(`update public.company_member_invites set
            status='revoked',closed_at=now() where company_id=$1::uuid
            and target_user_id=$2::uuid and status='pending'`,[companyId,userId]);
        },
        async appendAudit(e){
          one(await client.query(`insert into public.company_membership_audit
            (company_id,actor_id,target_user_id,event_type,invitation_id,event_at)
            values($1::uuid,$2::uuid,$3::uuid,$4,$5::uuid,
              to_timestamp($6::double precision/1000)) returning id`,
            [e.companyId,e.actorId,e.targetUserId,e.event,e.invitationId,e.at]));
        },
        async listMembers(companyId){
          const q=await client.query(`select business_id,user_id,role from
            public.business_members where business_id=$1::uuid order by user_id
            limit 10001`,[companyId]);
          if(!Array.isArray(q?.rows))fail();
          return q.rows.map(m=>({companyId:m.business_id,userId:m.user_id,role:m.role,status:'active'}));
        }
      });
      const result=await fn(tx);
      await client.query('COMMIT');
      return result;
    }catch(e){
      if(begun)await client.query('ROLLBACK').catch(()=>{});
      throw e;
    }finally{client.release();}
  }});
}
function invitation(i){
  return {id:i.id,companyId:i.company_id,invitedBy:i.invited_by,
    targetUserId:i.target_user_id,status:i.status,expiresAt:epoch(i.expires_at)};
}
