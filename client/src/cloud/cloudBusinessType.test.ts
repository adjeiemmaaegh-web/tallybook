import {beforeEach,expect,it,vi} from "vitest";
import {saveCloudBusinessType} from "./cloudBusinessType";
const mock=vi.hoisted(()=>({getUser:vi.fn(),rpc:vi.fn()}));
vi.mock("@/lib/supabase",()=>({getSupabaseClient:()=>({auth:{getUser:mock.getUser},rpc:mock.rpc})}));
const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const owner="11111111-1111-4111-8111-111111111111";
beforeEach(()=>{
 vi.clearAllMocks();
 mock.getUser.mockResolvedValue({data:{user:{id:owner}},error:null});
 mock.rpc.mockResolvedValue({data:{id,owner_id:owner,business_type:"Retail shop"},error:null});
});
it("writes category only through the owner-verified server RPC",async()=>{
 await saveCloudBusinessType(id,"Retail shop");
 expect(mock.rpc).toHaveBeenCalledWith("set_cloud_business_type",{p_business_id:id,p_business_type:"Retail shop"});
 expect(mock.getUser).toHaveBeenCalledTimes(2);
});
it("rejects malformed category or ID before sending a mutation",async()=>{
 await expect(saveCloudBusinessType("not-a-business","Retail shop")).rejects.toThrow(/valid business/);
 await expect(saveCloudBusinessType(id,"owner" as never)).rejects.toThrow(/valid business/);
 expect(mock.rpc).not.toHaveBeenCalled();
});
it("rejects another owner's apparent receipt and an account switch",async()=>{
 mock.rpc.mockResolvedValueOnce({data:{id,owner_id:"22222222-2222-4222-8222-222222222222",business_type:"Retail shop"},error:null});
 await expect(saveCloudBusinessType(id,"Retail shop")).rejects.toThrow(/not confirmed/);
 mock.rpc.mockResolvedValue({data:{id,owner_id:owner,business_type:"Retail shop"},error:null});
 mock.getUser.mockResolvedValueOnce({data:{user:{id:owner}},error:null})
   .mockResolvedValueOnce({data:{user:{id:"22222222-2222-4222-8222-222222222222"}},error:null});
 await expect(saveCloudBusinessType(id,"Retail shop")).rejects.toThrow(/Account changed/);
});
