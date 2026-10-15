/**
 * Authenticated company access lookup for a future opt-in cloud authorization
 * boundary. It is NOT enabled by the offline-first local application.
 *
 * Identity is obtained from Supabase Auth getUser() (server-validated), not
 * a locally decoded Google token or the browser's selected company ID.
 * Membership is read through a database table that MUST have deny-by-default
 * RLS configured before this service is used.
 *
 * Do not bind existing local business IDs automatically to cloud companies.
 */
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import { resolveCloudMembership } from "./cloudMembershipModel.mjs";
import {
  requireCompanyAccess,
  type AuthoritativeCompanyMembership,
  type CompanyAccessAction,
  type VerifiedCompanyPrincipal,
} from "./companyAccessPolicy";

export interface CheckedCompanyAccess {
  readonly userId: string;
  readonly companyId: string;
  readonly role: "owner" | "admin" | "staff";
}

export async function verifyCloudCompanyAccess(companyId: string, action: CompanyAccessAction): Promise<CheckedCompanyAccess> {
  if (!isSupabaseConfigured || !companyId.trim()) throw new Error("Company access is not authorized.");
  const client = getSupabaseClient();
  // getUser performs an authentication-server validation; getSession alone
  // only returns the locally cached session.
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user || !userData.user.id.trim())
    throw new Error("Company access is not authorized.");
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  const session = sessionData.session;
  if (sessionError || !session || session.user.id !== userData.user.id || typeof session.expires_at !== "number" || !Number.isSafeInteger(session.expires_at))
    throw new Error("Company access is not authorized.");
  if (session.expires_at <= 0 || session.expires_at > Math.floor(Number.MAX_SAFE_INTEGER / 1000))
    throw new Error("Company access is not authorized.");
  if (session.expires_at * 1000 <= Date.now()) throw new Error("Company access is not authorized.");
  const initiatingToken = session.access_token;
  if (typeof initiatingToken !== "string" || initiatingToken.length < 20)
    throw new Error("Company access is not authorized.");
  const principal: VerifiedCompanyPrincipal = {
    userId: userData.user.id,
    expiresAtEpochMs: session.expires_at * 1000,
  };
  // The actual Tallybook Supabase schema is businesses + business_members.
  // RLS on business_members allows users to see only their own membership.
  const { data: memberships, error: membershipError } = await client.from("business_members")
    .select("user_id,business_id,role")
    .eq("business_id", companyId)
    .eq("user_id", principal.userId)
    .limit(2);
  if (membershipError || !memberships || memberships.length !== 1)
    throw new Error("Company access is not authorized.");
  const row = memberships[0] as Record<string, unknown>;
  const { data: businesses, error: businessError } = await client.from("businesses")
    .select("id,owner_id")
    .eq("id", companyId)
    .limit(2);
  if (businessError || !businesses || businesses.length !== 1)
    throw new Error("Company access is not authorized.");
  const verified = resolveCloudMembership(principal.userId, companyId, row, businesses[0]);
  const membership: AuthoritativeCompanyMembership = {
    ...verified,
    status: "active", // revocation removes the authoritative row
  };
  requireCompanyAccess(principal, membership, companyId, action);
  // A sign-out or user change may occur while membership is being fetched.
  // Recheck the current authenticated account before returning this snapshot.
  // Callers must still repeat authorization at each sensitive service write.
  const { data: finalUser, error: finalUserError } = await client.auth.getUser();
  const { data: finalSession, error: finalSessionError } = await client.auth.getSession();
  if (finalUserError || finalUser.user?.id !== principal.userId ||
      finalSessionError || !finalSession.session ||
      finalSession.session.access_token !== initiatingToken ||
      finalSession.session.user.id !== principal.userId ||
      typeof finalSession.session.expires_at !== "number" ||
      !Number.isSafeInteger(finalSession.session.expires_at) ||
      finalSession.session.expires_at <= 0 ||
      finalSession.session.expires_at > Math.floor(Number.MAX_SAFE_INTEGER / 1000) ||
      finalSession.session.expires_at * 1000 <= Date.now())
    throw new Error("Company access is not authorized.");
  return { userId: principal.userId, companyId, role: membership.role };
}
