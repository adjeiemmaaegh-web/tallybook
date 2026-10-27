/** Read-only, RLS-scoped cloud membership evidence. Never a local permission. */
export interface CloudBusinessRow {
  id: string; owner_id: string; name: string; created_at: string; updated_at: string;
}
export interface CloudMembershipRow {
  business_id: string; user_id: string; role: 'owner' | 'attendant';
}
export interface VerifiedCloudBusiness extends CloudBusinessRow {
  role: 'owner' | 'attendant';
}
export function readVerifiedCloudBusinesses(input: {
  verifiedUserId: () => Promise<string | null>;
  readBusinesses: () => Promise<unknown>;
  readMemberships: () => Promise<unknown>;
  isOnline?: () => boolean;
}): Promise<readonly VerifiedCloudBusiness[]>;
