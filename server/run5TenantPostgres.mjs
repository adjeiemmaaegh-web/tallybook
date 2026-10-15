/** Run 5 private PostgreSQL adapter; tenant scope is a composite primary key.
 * Must be injected with independently approved server-only pool. No RLS bypass
 * or Supabase service key is supplied by this module.
 */
const deny=()=>{throw Error('Tenant data transaction denied');};
const one=q=>{if(q?.rowCount!==1||q?.rows?.length!==1)deny();return q.rows[0];};
const map=row=>row?{companyId:row.company_id,collection:row.collection,
  id:row.record_id,revision:Number(row.revision),payload:row.payload}:null;
const roleSet=new Set(['owner','attendant']);
export function createRun5TenantPostgresStore(pool){
  if(typeof pool?.connect!=='function')deny();
  return Object.freeze({async transaction(fn){
    if(typeof fn!=='function')deny();
    const client=await pool.connect();
    let begun=false;
    try{
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      begun=true;
      const tx=Object.freeze({
        async assertActiveSession(sessionId,userId,now){
          const q=await client.query(`select id from auth.sessions
            where id=$1::uuid and user_id=$2::uuid
            and (not_after is null or not_after > to_timestamp($3::double precision/1000))
            for share`,[sessionId,userId,now]);
          return q?.rows?.length===1;
        },
        async getCompany(companyId){
          const q=await client.query(`select id,owner_id from public.businesses
            where id=$1::uuid for share`,[companyId]);
          if(q?.rows?.length!==1)return null;
          return {id:q.rows[0].id,ownerId:q.rows[0].owner_id,status:'active'};
        },
        async getMembership(companyId,userId){
          const q=await client.query(`select business_id,user_id,role
            from public.business_members where business_id=$1::uuid
            and user_id=$2::uuid for share`,[companyId,userId]);
          if(q?.rows?.length!==1)return null;
          const m=q.rows[0];
          if(!roleSet.has(m.role))deny();
          return {companyId:m.business_id,userId:m.user_id,role:m.role,status:'active'};
        },
        async getRow(companyId,collection,id){
          const q=await client.query(`select company_id,collection,record_id,revision,payload
            from public.company_tenant_records
            where company_id=$1::uuid and collection=$2 and record_id=$3
            for share`,[companyId,collection,id]);
          return q?.rows?.length===1?map(q.rows[0]):null;
        },
        async listRows(companyId,collection,limit,after){
          const q=await client.query(`select company_id,collection,record_id,revision,payload
            from public.company_tenant_records where company_id=$1::uuid
            and collection=$2 and ($3::text is null or record_id>$3)
            order by record_id asc limit $4`,[companyId,collection,after,limit]);
          if(!Array.isArray(q?.rows))deny();
          return q.rows.map(map);
        },
        async putRow({companyId,collection,id,payload,expectedRevision}){
          let q;
          if(expectedRevision===0){
            q=await client.query(`insert into public.company_tenant_records
              (company_id,collection,record_id,revision,payload)
              values($1::uuid,$2,$3,1,$4::jsonb)
              on conflict do nothing
              returning company_id,collection,record_id,revision,payload`,
              [companyId,collection,id,JSON.stringify(payload)]);
          }else{
            q=await client.query(`update public.company_tenant_records
              set payload=$5::jsonb,revision=revision+1,updated_at=now()
              where company_id=$1::uuid and collection=$2 and record_id=$3
              and revision=$4
              returning company_id,collection,record_id,revision,payload`,
              [companyId,collection,id,expectedRevision,JSON.stringify(payload)]);
          }
          return map(one(q));
        },
        async deleteRow(companyId,collection,id,expectedRevision){
          one(await client.query(`delete from public.company_tenant_records
            where company_id=$1::uuid and collection=$2
            and record_id=$3 and revision=$4
            returning company_id`,[companyId,collection,id,expectedRevision]));
        },
        async appendAudit(event){
          if(!['read','write','delete','import'].includes(event.action))deny();
          one(await client.query(`insert into public.company_tenant_data_audit
            (company_id,actor_id,operation,collection,record_id,at)
            values($1::uuid,$2::uuid,$3,$4,$5,
              to_timestamp($6::double precision/1000)) returning id`,
            [event.companyId,event.actorId,event.action,
              event.collection,event.recordId,event.at]));
        }
      });
      const value=await fn(tx);
      await client.query('COMMIT');
      return value;
    }catch(error){
      if(begun)await client.query('ROLLBACK').catch(()=>{});
      throw error;
    }finally{client.release();}
  }});
}
