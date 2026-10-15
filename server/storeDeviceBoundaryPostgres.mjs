/** Server-only authoritative store/device read inside an existing transaction.
 * Schema provided by docs/security/STAGE9_ROUND1_STORE_DEVICE_SCHEMA.sql.
 * The pool must be privileged, never a browser or bearer-controlled connection.
 */
const denied=()=>{throw Error('Store/device access is not authorized');};
export function createPostgresStoreDeviceBoundary(client){
 if(typeof client?.query!=='function')denied();
 return async function readBoundary({companyId,storeId,deviceId,userId}){
  const result=await client.query(`
    select b.id as company_id,b.owner_id, m.role, s.id as store_id,
           s.status as store_status, d.id as device_id,
           d.user_id as device_user_id,d.company_id as device_company_id,
           d.store_id as device_store_id,d.status as device_status,
           d.expires_at as device_expires_at
    from public.businesses b
    join public.business_members m
      on m.business_id=b.id and m.user_id=$4::uuid
    join public.company_store_scopes s
      on s.company_id=b.id and s.id=$2
    join public.company_device_grants d
      on d.company_id=b.id and d.store_id=s.id and d.user_id=$4::uuid
      and d.id=$3
    where b.id=$1::uuid
    for share of b,m,s,d`,[companyId,storeId,deviceId,userId]);
  if(result?.rows?.length!==1)denied();
  const row=result.rows[0];
  const expires=row.device_expires_at instanceof Date?
    row.device_expires_at.getTime():Date.parse(row.device_expires_at);
  if(!Number.isSafeInteger(expires))denied();
  return Object.freeze({
   companyId:row.company_id,storeId:row.store_id,deviceId:row.device_id,
   userId,companyOwnerId:row.owner_id,role:row.role,
   membershipStatus:'active',storeStatus:row.store_status,deviceStatus:row.device_status,
   deviceCompanyId:row.device_company_id,deviceStoreId:row.device_store_id,
   deviceUserId:row.device_user_id,deviceExpiresAt:expires,
  });
 };
}
