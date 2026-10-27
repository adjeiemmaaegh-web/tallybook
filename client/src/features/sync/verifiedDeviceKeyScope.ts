/** Production-facing scope checks for device-key vault operations. The server
 * still independently authorizes every enrollment and financial upload.
 */
import {getSupabaseClient} from '@/lib/supabase';
import {getActiveBusinessProfileId} from '@/features/business/activeCompany';
import {currentStaffId} from '@/features/staff/staff';
import type {DeviceKeyScope} from './deviceKeyVault';

export function verifiedDeviceKeyGuards(scope:DeviceKeyScope) {
  return {
    resolveUserId:async()=>{
      const {data:{user},error}=await getSupabaseClient().auth.getUser();
      if(error||!user?.id)throw Error('Cloud sign-in required for device key.');
      return user.id;
    },
    currentLocalScope:()=>({companyId:getActiveBusinessProfileId(),
      staffId:currentStaffId(scope.localCompanyId)}),
  };
}
