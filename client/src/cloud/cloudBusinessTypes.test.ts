import {describe,expect,it} from "vitest";
import {businessTypes,isBusinessType} from "@/features/business/businessTypes";
import {readVerifiedCloudBusinesses} from "./cloudMembershipBoundary.mjs";
const owner="11111111-1111-4111-8111-111111111111";
const biz="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
describe("cloud and local business labels",()=>{
 it("accepts every locally supported business type in the cloud projection",async()=>{
  for(const business_type of businessTypes){
   const result=await readVerifiedCloudBusinesses({
    verifiedUserId:async()=>owner,
    isOnline:()=>true,
    readBusinesses:async()=>[{id:biz,name:"Shop",owner_id:owner,created_at:"",updated_at:"",business_type}],
    readMemberships:async()=>[{business_id:biz,user_id:owner,role:"owner"}]
   });
   expect(result[0]!.business_type).toBe(business_type);
   expect(isBusinessType(business_type)).toBe(true);
  }
 });
 it("disallows arbitrary categories without server fallback",()=>{
  expect(isBusinessType("Financial administrator")).toBe(false);
  expect(isBusinessType("")).toBe(false);
 });
});
