import { getSupabaseClient } from "@/lib/supabase";

export interface CloudBusiness { id: string; name: string; owner_id: string; created_at: string; updated_at: string; }

/** Membership, never a local company ID, determines the cloud business. */
export async function getCurrentBusiness(businessId?: string): Promise<CloudBusiness | null> {
  const client = getSupabaseClient();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) throw new Error("Sign in before opening a cloud business.");
  let query = client.from("businesses").select("id,name,owner_id,created_at,updated_at");
  if (businessId) query = query.eq("id", businessId);
  const { data, error } = await query.order("created_at").limit(1).maybeSingle();
  if (error) throw new Error("Could not load your cloud business. Please try again.");
  return data as CloudBusiness | null;
}

/** Read only the businesses exposed by canonical membership RLS.
 * Choosing a cloud business never switches or binds a local IndexedDB company.
 */
export async function listAccessibleCloudBusinesses(): Promise<CloudBusiness[]> {
  const client = getSupabaseClient();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) throw new Error("Sign in before listing cloud businesses.");
  const { data, error } = await client.from("businesses")
    .select("id,name,owner_id,created_at,updated_at").order("created_at").limit(100);
  if (error || !Array.isArray(data)) throw new Error("Could not list your cloud businesses.");
  if (data.some(row => typeof row?.id !== "string" ||
      typeof row?.name !== "string" || typeof row?.owner_id !== "string"))
    throw new Error("Invalid cloud membership list.");
  return data as CloudBusiness[];
}

/** The caller supplies a stable UUID so a retried creation cannot duplicate a shop. */
export async function createBusiness(name: string, requestId: string): Promise<CloudBusiness> {
  if (!name.trim() || name.trim().length > 80) throw new Error("Enter a business name of 1–80 characters.");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) throw new Error("A valid creation request ID is required.");
  const { data, error } = await getSupabaseClient().rpc("create_owned_business", { business_name: name.trim(), request_id: requestId });
  if (error || !data) throw new Error("Could not create your cloud business. Retry with the same request ID.");
  return data as CloudBusiness;
}

/** Deprecated insecure direct assignment route. Run 3 requires a targeted
 * invitation, authenticated recipient redemption and audit in one SQL txn.
 * Never revive add_business_attendant from client code.
 */
export async function linkUserToBusiness(_businessId: string, _userId: string): Promise<void> {
  throw new Error("Direct membership assignment is disabled. Use a targeted Run 3 invitation.");
}
