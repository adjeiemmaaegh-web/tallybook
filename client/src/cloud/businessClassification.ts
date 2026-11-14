import {getSupabaseClient} from "@/lib/supabase";

/** Informational industry labels; never confer a different role, subscription or refund policy. */
export const BUSINESS_TYPES=[
  {id:"retail",label:"Retail shop"},
  {id:"wholesale",label:"Wholesale / distribution"},
  {id:"food",label:"Food and hospitality"},
  {id:"services",label:"Services"},
  {id:"manufacturing",label:"Manufacturing"},
  {id:"mixed",label:"Multiple business types"},
  {id:"other",label:"Other business"},
] as const;
export type BusinessType=(typeof BUSINESS_TYPES)[number]["id"];
const allowed=new Set<string>(BUSINESS_TYPES.map(t=>t.id));
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseBusinessType(value:unknown):BusinessType|null {
  return typeof value==="string"&&allowed.has(value)?value as BusinessType:null;
}
export async function readBusinessType(companyId:string):Promise<BusinessType|null>{
  if(!uuid.test(companyId))throw Error("Invalid company identifier.");
  const client=getSupabaseClient();
  const identity=await client.auth.getUser();
  if(identity.error||!identity.data.user)throw Error("Sign in to view this business.");
  const result=await client.from("businesses").select("id,owner_id,business_type").eq("id",companyId).maybeSingle();
  if(result.error||!result.data||result.data.owner_id!==identity.data.user.id)
    throw Error("Business classification is unavailable or you are not the verified owner.");
  if(result.data.business_type!==null&&!parseBusinessType(result.data.business_type))
    throw Error("The server returned an unsupported business classification.");
  return parseBusinessType(result.data.business_type);
}
export async function saveBusinessType(companyId:string,type:BusinessType|null):Promise<void>{
  if(!uuid.test(companyId)||(type!==null&&!parseBusinessType(type)))throw Error("Choose a supported business type.");
  const client=getSupabaseClient();
  const first=await client.auth.getUser();
  const userId=first.data?.user?.id;
  if(first.error||!userId)throw Error("Sign in again to change your business type.");
  // This preflight is informational; PostgreSQL grants UPDATE(business_type)
  // only and the owner_id RLS policy is the actual authorization boundary.
  const row=await client.from("businesses").select("id,owner_id").eq("id",companyId).maybeSingle();
  if(row.error||row.data?.owner_id!==userId)throw Error("Only the verified business owner may update its type.");
  const updated=await client.from("businesses").update({business_type:type})
    .eq("id",companyId).eq("owner_id",userId)
    .select("id,owner_id,business_type").maybeSingle();
  if(updated.error||updated.data?.id!==companyId||updated.data?.owner_id!==userId||updated.data?.business_type!==type)
    throw Error("Business type was not confirmed by the server. Check the owner account and retry.");
  const final=await client.auth.getUser();
  if(final.error||final.data?.user?.id!==userId)throw Error("The account changed while saving. Sign in again.");
}
