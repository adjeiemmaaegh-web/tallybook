/** Read-only cloud identity projection. Never grants a local staff unlock or write capability. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const denied = () => { throw Error('Cloud business membership could not be verified.'); };
const isUuid = value => typeof value === 'string' && UUID.test(value);
const isRole = role => role === 'owner' || role === 'attendant';
/**
 * Caller MUST use Supabase getUser (server-validated identity) and RLS-scoped
 * Data API reads, never user-supplied raw membership or cached JWT claims.
 * Deliberately caps result sizes: silent truncation is an authorization error.
 */
export async function readVerifiedCloudBusinesses({verifiedUserId,readBusinesses,readMemberships,isOnline = () => true} = {}) {
  if (typeof verifiedUserId !== 'function' || typeof readBusinesses !== 'function' ||
      typeof readMemberships !== 'function' || typeof isOnline !== 'function') denied();
  if (!isOnline()) denied();
  const initialUser = await verifiedUserId();
  if (!isUuid(initialUser)) denied();
  const [businesses, members] = await Promise.all([readBusinesses(),readMemberships()]);
  if (!isOnline() || !Array.isArray(businesses) || !Array.isArray(members) ||
      businesses.length > 100 || members.length > 100) denied();
  // Auth may switch between the two RLS queries; never render mixed identities.
  const finalUser = await verifiedUserId();
  if (finalUser !== initialUser || !isOnline()) denied();
  const membershipByCompany = new Map();
  for (const member of members) {
    if (!member || !isUuid(member.business_id) || member.user_id !== initialUser ||
        !isRole(member.role) || membershipByCompany.has(member.business_id)) denied();
    membershipByCompany.set(member.business_id, member.role);
  }
  const seen = new Set();
  const verified = [];
  for (const business of businesses) {
    if (!business || !isUuid(business.id) || !isUuid(business.owner_id) ||
        typeof business.name !== 'string' || business.name.trim().length < 1 ||
        business.name.length > 80 || seen.has(business.id)) denied();
    seen.add(business.id);
    const role = membershipByCompany.get(business.id);
    if (!isRole(role) || (role === 'owner') !== (business.owner_id === initialUser)) denied();
    verified.push(Object.freeze({
      id:business.id,name:business.name,owner_id:business.owner_id,
      created_at:business.created_at,updated_at:business.updated_at,role,
    }));
  }
  if (seen.size !== membershipByCompany.size) denied();
  return Object.freeze(verified);
}
