import { beforeEach, expect, it, vi } from "vitest";
import { createBusiness, getCurrentBusiness, linkUserToBusiness, listAccessibleCloudBusinesses } from "./businessIdentity";
const mock=vi.hoisted(()=>({getUser:vi.fn(),rpc:vi.fn(),maybeSingle:vi.fn(),eq:vi.fn(),listBusinesses:vi.fn()}));
vi.mock("@/lib/supabase",()=>({getSupabaseClient:()=>({auth:{getUser:mock.getUser},rpc:mock.rpc,from:()=>({select:()=>{const q={eq:mock.eq,order:()=>({limit:(count:number)=>count===100?mock.listBusinesses():({maybeSingle:mock.maybeSingle})})};mock.eq.mockReturnValue(q);return q;}})})}));
beforeEach(()=>{vi.clearAllMocks();mock.getUser.mockResolvedValue({data:{user:{id:"owner"}},error:null});mock.maybeSingle.mockResolvedValue({data:null,error:null});mock.listBusinesses.mockResolvedValue({data:[],error:null});mock.rpc.mockResolvedValue({data:{id:"business"},error:null});});
it("handles an authenticated account without a business",async()=>{expect(await getCurrentBusiness()).toBeNull();});
it("retrieves the selected business through the authenticated client",async()=>{mock.maybeSingle.mockResolvedValue({data:{id:"business"},error:null});expect(await getCurrentBusiness("business")).toEqual({id:"business"});expect(mock.eq).toHaveBeenCalledWith("id","business");});
it("rejects unauthenticated lookups",async()=>{mock.getUser.mockResolvedValue({data:{user:null},error:null});await expect(getCurrentBusiness()).rejects.toThrow(/Sign in/);expect(mock.maybeSingle).not.toHaveBeenCalled();});
it("creates through an atomic retry-safe RPC without a caller-selected owner",async()=>{await createBusiness(" Shop ","11111111-1111-4111-8111-111111111111");expect(mock.rpc).toHaveBeenCalledWith("create_owned_business",{business_name:"Shop",request_id:"11111111-1111-4111-8111-111111111111"});});
it("rejects invalid creation requests before contacting Supabase",async()=>{await expect(createBusiness("", "invalid")).rejects.toThrow();expect(mock.rpc).not.toHaveBeenCalled();});
it("blocks legacy direct assignments without calling the privileged RPC",async()=>{await expect(linkUserToBusiness("foreign","user")).rejects.toThrow(/Direct membership assignment is disabled/);expect(mock.rpc).not.toHaveBeenCalled();});

it("lists RLS-visible cloud companies for explicit multi-company selection",async()=>{
  mock.listBusinesses.mockResolvedValue({data:[
    {id:"co-a",name:"A",owner_id:"owner"},
    {id:"co-b",name:"B",owner_id:"owner"}],error:null});
  const businesses=await listAccessibleCloudBusinesses();
  expect(businesses.map(x=>x.id)).toEqual(["co-a","co-b"]);
});
