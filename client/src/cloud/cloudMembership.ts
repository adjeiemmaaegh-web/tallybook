import {getSupabaseClient} from '@/lib/supabase';
import {readVerifiedCloudBusinesses, type VerifiedCloudBusiness}
  from './cloudMembershipBoundary.mjs';

/** Read only Supabase RLS-scoped account membership, not local POS authority.
 * Fail closed if identity rotates, a listing is truncated, or owner and member
 * roles disagree. Data API policies are still the actual security boundary.
 */
export async function listVerifiedCloudBusinesses(): Promise<readonly VerifiedCloudBusiness[]> {
  const client=getSupabaseClient();
  return readVerifiedCloudBusinesses({
    isOnline:()=>typeof navigator!=='undefined' && navigator.onLine,
    verifiedUserId:async()=>{
      const {data,error}=await client.auth.getUser();
      if(error||!data?.user)return null;
      return data.user.id;
    },
    readBusinesses:async()=>{
      const {data,error}=await client.from('businesses')
        .select('id,name,owner_id,created_at,updated_at')
        .order('created_at').limit(101);
      if(error||!Array.isArray(data))throw Error('Cloud business lookup failed.');
      return data;
    },
    readMemberships:async()=>{
      const {data,error}=await client.from('business_members')
        .select('business_id,user_id,role').limit(101);
      if(error||!Array.isArray(data))throw Error('Cloud membership lookup failed.');
      return data;
    },
  });
}
