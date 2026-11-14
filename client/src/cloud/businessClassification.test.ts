import {beforeEach,expect,it,vi} from "vitest";
import {BUSINESS_TYPES,parseBusinessType,readBusinessType,saveBusinessType} from "./businessClassification";
const fake=vi.hoisted(()=>({getUser:vi.fn(),select:vi.fn(),update:vi.fn(),first:vi.fn(),updated:vi.fn()}));
vi.mock("@/lib/supabase",()=>({getSupabaseClient:()=>({
  auth:{getUser:fake.getUser},
  from:(table:string)=>{
    if(table!=="businesses")throw Error("Unexpected table");
    return {
      select:fake.select,
      update:fake.update,
    };
  }
})}));
beforeEach(()=>{
  vi.resetAllMocks();
  fake.getUser.mockResolvedValue({data:{user:{id:"owner"}},error:null});
  const lookup={eq:()=>({maybeSingle:fake.first})};
  const confirm={eq:()=>({eq:()=>({select:()=>({maybeSingle:fake.updated})})})};
  fake.select.mockReturnValue(lookup);
  fake.update.mockReturnValue(confirm);
  fake.first.mockResolvedValue({data:{id:"11111111-1111-4111-8111-111111111111",owner_id:"owner",business_type:"retail"},error:null});
  fake.updated.mockResolvedValue({data:{id:"11111111-1111-4111-8111-111111111111",owner_id:"owner",business_type:"retail"},error:null});
});
const company="11111111-1111-4111-8111-111111111111";
it("recognizes only the allowed informational types",()=>{
 expect(BUSINESS_TYPES).toHaveLength(7);
 expect(parseBusinessType("retail")).toBe("retail");
 expect(parseBusinessType("owner")).toBeNull();
 expect(parseBusinessType("__proto__")).toBeNull();
});
it("reads only a company owned by the verified account",async()=>{
 expect(await readBusinessType(company)).toBe("retail");
 fake.first.mockResolvedValue({data:{id:company,owner_id:"someone-else",business_type:"retail"},error:null});
 await expect(readBusinessType(company)).rejects.toThrow(/verified owner/);
});
it("saves only the classification column and checks the server receipt",async()=>{
 await saveBusinessType(company,"retail");
 expect(fake.update).toHaveBeenCalledWith({business_type:"retail"});
 expect(fake.getUser).toHaveBeenCalledTimes(2);
});
it("refuses a failed server receipt and an identity change",async()=>{
 fake.updated.mockResolvedValue({data:null,error:null});
 await expect(saveBusinessType(company,"retail")).rejects.toThrow(/not confirmed/);
 fake.updated.mockResolvedValue({data:{id:company,owner_id:"owner",business_type:"retail"},error:null});
 fake.getUser.mockResolvedValueOnce({data:{user:{id:"owner"}},error:null})
   .mockResolvedValueOnce({data:{user:{id:"different"}},error:null});
 await expect(saveBusinessType(company,"retail")).rejects.toThrow(/account changed/);
});
it("rejects malformed IDs and unsupported types without a write",async()=>{
 await expect(saveBusinessType("foreign","retail")).rejects.toThrow();
 await expect(saveBusinessType(company,"administrator" as never)).rejects.toThrow();
 expect(fake.update).not.toHaveBeenCalled();
});
