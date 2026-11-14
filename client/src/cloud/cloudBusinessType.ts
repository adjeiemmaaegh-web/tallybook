import {getSupabaseClient} from "@/lib/supabase";
import {isBusinessType,type BusinessType} from "@/features/business/businessTypes";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Only the verified cloud business owner can change the cloud record.
 * This operation never changes a local/device company, ledger, or entitlement.
 */
export async function saveCloudBusinessType(companyId:string,type:BusinessType):Promise<void>{
 if(!UUID.test(companyId)||!isBusinessType(type))throw Error("Select a valid business and category.");
 const client=getSupabaseClient();
 const {data:before,error:identityError}=await client.auth.getUser();
 if(identityError||!before.user)throw Error("Sign in before editing your business type.");
 const {data,error}=await client.rpc("set_cloud_business_type",{
  p_business_id:companyId,p_business_type:type
 });
 if(error||!data||data.id!==companyId||data.owner_id!==before.user.id||data.business_type!==type)
  throw Error("Business category was not confirmed. Check your account and try again.");
 const {data:after,error:afterError}=await client.auth.getUser();
 if(afterError||after.user?.id!==before.user.id)throw Error("Account changed. Recheck this business.");
}
