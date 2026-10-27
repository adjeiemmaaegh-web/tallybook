import {describe,it,expect,vi} from 'vitest';
import type {DeviceKeyScope} from './deviceKeyVault';
const {session}=vi.hoisted(()=>({session:{userId:'11111111-1111-4111-8111-111111111111',
  companyId:'localA',staffId:'staffA'}}));
vi.mock('@/lib/supabase',()=>({getSupabaseClient:()=>({auth:{getUser:async()=>({
  data:{user:session.userId?{id:session.userId}:null},error:null})}})}));
vi.mock('@/features/business/activeCompany',()=>({getActiveBusinessProfileId:()=>session.companyId}));
vi.mock('@/features/staff/staff',()=>({currentStaffId:()=>session.staffId}));
import {verifiedDeviceKeyGuards} from './verifiedDeviceKeyScope';

const scope={supabaseOrigin:'https://test.supabase.co',userId:session.userId,
  cloudCompanyId:'22222222-2222-4222-8222-222222222222',localCompanyId:'localA',
  staffId:'staffA',shopId:'shopA',deviceId:'deviceA'} as DeviceKeyScope;

describe('verified device-key scope',()=>{
  it('reads the current cloud account and local staff session',async()=>{
    const guard=verifiedDeviceKeyGuards(scope);
    expect(await guard.resolveUserId()).toBe(scope.userId);
    expect(guard.currentLocalScope()).toEqual({companyId:'localA',staffId:'staffA'});
    session.userId='';
    await expect(guard.resolveUserId()).rejects.toThrow();
    session.userId=scope.userId;
  });
});
