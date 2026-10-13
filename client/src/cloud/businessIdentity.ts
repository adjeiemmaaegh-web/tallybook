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

/** The caller supplies a stable UUID so a retried creation cannot duplicate a shop. */
export async function createBusiness(name: string, requestId: string): Promise<CloudBusiness> {
  if (!name.trim() || name.trim().length > 80) throw new Error("Enter a business name of 1–80 characters.");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) throw new Error("A valid creation request ID is required.");
  const { data, error } = await getSupabaseClient().rpc("create_owned_business", { business_name: name.trim(), request_id: requestId });
  if (error || !data) throw new Error("Could not create your cloud business. Retry with the same request ID.");
  return data as CloudBusiness;
}

/** Only an existing owner can assign another authenticated user. RLS/RPC checks
 * are authoritative; possession of a business ID never grants membership. */
export async function linkUserToBusiness(businessId: string, userId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc("add_business_attendant", { target_business: businessId, target_user: userId });
  if (error) throw new Error("Only the business owner can assign an existing account to this business.");
}
