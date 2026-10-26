/** Private PostgreSQL adapter for the isolated draft tb_* central schema. */
const denied=()=>{throw new Error('Central sale ingestion database denied');};
const one=result=>{if(result?.rowCount!==1)denied();};

export function createPostgresCentralSaleIngestStore(pool) {
  if(typeof pool?.connect!=='function')denied();
  return Object.freeze({
    async transaction(work) {
      if(typeof work!=='function')denied();
      const client=await pool.connect();
      if(typeof client?.query!=='function'||typeof client?.release!=='function')denied();
      let begun=false;
      try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');begun=true;
        const tx=Object.freeze({
          async assertActiveSession(sessionId,userId,now) {
            const result=await client.query(`select id from auth.sessions
              where id=$1::uuid and user_id=$2::uuid
                and (not_after is null or not_after>to_timestamp($3::double precision/1000)) for share`,[sessionId,userId,now]);
            return result?.rows?.length===1;
          },
          async getMembership(businessId,actorId) {
            const result=await client.query(`select business_id,auth_user_id,staff_id,role,active
              from public.tb_memberships where business_id=$1 and auth_user_id=$2::uuid for share`,[businessId,actorId]);
            const r=result?.rows?.[0];return r?{businessId:r.business_id,actorId:r.auth_user_id,
              staffId:r.staff_id,role:r.role,active:r.active}:null;
          },
          async getDevice(businessId,deviceId) {
            const result=await client.query(`select business_id,id,shop_id,auth_user_id,active,public_key_spki_pem
              from public.tb_devices where business_id=$1 and id=$2 for share`,[businessId,deviceId]);
            const r=result?.rows?.[0];return r?{businessId:r.business_id,id:r.id,shopId:r.shop_id,
              actorId:r.auth_user_id,active:r.active,publicKeySpkiPem:r.public_key_spki_pem}:null;
          },
          async getShop(businessId,shopId) {
            const result=await client.query('select business_id,id,active from public.tb_shops where business_id=$1 and id=$2 for share',[businessId,shopId]);
            const r=result?.rows?.[0];return r?{businessId:r.business_id,id:r.id,active:r.active}:null;
          },
          async getStaff(businessId,staffId) {
            const result=await client.query('select business_id,id,active from public.tb_staff where business_id=$1 and id=$2 for share',[businessId,staffId]);
            const r=result?.rows?.[0];return r?{businessId:r.business_id,id:r.id,active:r.active}:null;
          },
          async isAssigned(businessId,shopId,staffId) {
            const result=await client.query(`select active from public.tb_shop_assignments
              where business_id=$1 and shop_id=$2 and staff_id=$3 for share`,[businessId,shopId,staffId]);
            return result?.rows?.length===1 && result.rows[0].active===true;
          },
          async getEvent(businessId,operationId) {
            const result=await client.query(`select business_id,operation_id,event_id,device_id,actor_id,
                payload_sha256,received_at_utc from public.tb_signed_sale_events
                where business_id=$1 and operation_id=$2 for update`,[businessId,operationId]);
            const r=result?.rows?.[0];return r?{businessId:r.business_id,operationId:r.operation_id,
              eventId:r.event_id,deviceId:r.device_id,actorId:r.actor_id,
              payloadDigest:r.payload_sha256.trim(),receivedAtUtc:new Date(r.received_at_utc).toISOString()}:null;
          },
          async insertEvent(row) {
            one(await client.query(`insert into public.tb_signed_sale_events
              (business_id,operation_id,event_id,shop_id,staff_id,device_id,actor_id,payload_sha256,payload,evidence_status,received_at_utc)
              values($1,$2,$3,$4,$5,$6,$7::uuid,$8,$9::jsonb,'upload_claim_only',$10::timestamptz) returning event_id`,
              [row.businessId,row.operationId,row.eventId,row.shopId,row.staffId,row.deviceId,row.actorId,
                row.payloadDigest,JSON.stringify(row.payload),row.receivedAtUtc]));
          },
        });
        const result=await work(tx);
        await client.query('COMMIT');
        return result;
      } catch(error) {
        if(begun)await client.query('ROLLBACK').catch(()=>{});
        throw error;
      } finally {client.release();}
    },
  });
}
