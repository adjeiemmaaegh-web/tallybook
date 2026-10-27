/** Private, isolated UUID-baseline adapter. Requires the reviewed candidate schema. */
const denied=()=>{throw new Error('UUID central sale ingestion database denied');};
const one=result=>{if(result?.rowCount!==1)denied();};

export function createUuidPostgresCentralSaleIngestStore(pool) {
  if(typeof pool?.connect!=='function')denied();
  return Object.freeze({
    async transaction(work) {
      if(typeof work!=='function')denied();
      const client=await pool.connect();
      if(typeof client?.query!=='function'||typeof client?.release!=='function')denied();
      let begun=false, companyId=null, localId=null;
      const scope=id=>{if(!companyId||id!==localId)denied();return companyId;};
      try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');begun=true;
        const tx=Object.freeze({
          async assertActiveSession(sessionId,userId,now) {
            const r=await client.query(`select id from auth.sessions where id=$1::uuid and user_id=$2::uuid
              and (not_after is null or not_after>to_timestamp($3::double precision/1000)) for share`,
              [sessionId,userId,now]);
            return r?.rows?.length===1;
          },
          async resolveCompany(requestedLocalId,actorId) {
            if(typeof requestedLocalId!=='string'||!/^[A-Za-z0-9:_-]{1,128}$/.test(requestedLocalId)||companyId)denied();
            const r=await client.query(`select b.id from public.company_local_bindings l
              join public.businesses b on b.id=l.company_id and b.owner_id=l.owner_id
              join public.business_members m on m.business_id=b.id and m.user_id=$2::uuid
              where l.local_company_id=$1 and m.role in ('owner','attendant') for share of l,b,m`,
              [requestedLocalId,actorId]);
            // Reused local IDs across owners are ambiguous and fail closed.
            if(r?.rows?.length!==1)return false;
            companyId=r.rows[0].id;localId=requestedLocalId;return true;
          },
          async getMembership(businessId,actorId) {
            const r=await client.query(`select m.role,s.id as staff_id from public.business_members m
              join public.company_staff_identities s on s.company_id=m.business_id and s.user_id=m.user_id
              where m.business_id=$1::uuid and m.user_id=$2::uuid for share of m,s`,
              [scope(businessId),actorId]);
            const row=r?.rows?.[0];return r?.rows?.length===1?{businessId,actorId,staffId:row.staff_id,
              role:row.role,active:true}:null;
          },
          async getDevice(businessId,deviceId) {
            const r=await client.query(`select d.id,d.store_id,d.user_id,d.staff_id,d.status,d.public_key_spki_pem
              from public.company_device_keys d join public.businesses b
                on b.id=d.company_id and b.owner_id=d.approved_by
              join public.business_members approver on approver.business_id=d.company_id
                and approver.user_id=d.approved_by and approver.role='owner'
              where d.company_id=$1::uuid and d.id=$2 for share of d,b,approver`,
              [scope(businessId),deviceId]);
            const d=r?.rows?.[0];return d?{businessId,id:d.id,shopId:d.store_id,
              actorId:d.user_id,staffId:d.staff_id,active:d.status==='active',
              publicKeySpkiPem:d.public_key_spki_pem}:null;
          },
          async getShop(businessId,shopId) {
            const r=await client.query(`select id,status from public.company_store_scopes
              where company_id=$1::uuid and id=$2 for share`,[scope(businessId),shopId]);
            const s=r?.rows?.[0];return s?{businessId,id:s.id,active:s.status==='active'}:null;
          },
          async getStaff(businessId,staffId) {
            const r=await client.query(`select id,active from public.company_staff_identities
              where company_id=$1::uuid and id=$2 for share`,[scope(businessId),staffId]);
            const s=r?.rows?.[0];return s?{businessId,id:s.id,active:s.active}:null;
          },
          async isAssigned(businessId,shopId,staffId) {
            const r=await client.query(`select active from public.company_staff_store_assignments
              where company_id=$1::uuid and store_id=$2 and staff_id=$3 for share`,
              [scope(businessId),shopId,staffId]);
            return r?.rows?.length===1&&r.rows[0].active===true;
          },
          async getEvent(businessId,operationId) {
            const r=await client.query(`select operation_id,event_id,device_id,actor_id,payload_sha256,received_at_utc
              from public.company_signed_sale_events where company_id=$1::uuid and operation_id=$2 for update`,
              [scope(businessId),operationId]);
            const e=r?.rows?.[0];return e?{businessId,operationId:e.operation_id,eventId:e.event_id,
              deviceId:e.device_id,actorId:e.actor_id,payloadDigest:e.payload_sha256.trim(),
              receivedAtUtc:new Date(e.received_at_utc).toISOString()}:null;
          },
          async insertEvent(row) {
            one(await client.query(`insert into public.company_signed_sale_events
              (company_id,local_company_id,operation_id,event_id,store_id,staff_id,device_id,actor_id,
               payload_sha256,payload,evidence_status,received_at_utc)
              values($1::uuid,$2,$3,$4,$5,$6,$7,$8::uuid,$9,$10::jsonb,'upload_claim_only',$11::timestamptz)
              returning event_id`,[scope(row.businessId),row.businessId,row.operationId,row.eventId,
                row.shopId,row.staffId,row.deviceId,row.actorId,row.payloadDigest,
                JSON.stringify(row.payload),row.receivedAtUtc]));
          },
        });
        const result=await work(tx);
        await client.query('COMMIT');return result;
      } catch(error) {
        if(begun)await client.query('ROLLBACK').catch(()=>{});
        throw error;
      } finally {client.release();}
    },
  });
}
