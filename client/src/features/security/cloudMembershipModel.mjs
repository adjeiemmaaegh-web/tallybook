/** Active Supabase schema contract (identity only; not ledger authorization).
 * This does not create cloud membership or bind old offline companies.
 * Rows MUST come from independently authenticated RLS-protected queries.
 */
const isId = x => typeof x === 'string' && x.trim() === x && x.length > 0 && x.length <= 200;
const deny = () => { throw new Error('Company access is not authorized.'); };
export function resolveCloudMembership(userId, companyId, member, business) {
  if (!isId(userId) || !isId(companyId) ||
    !member || typeof member !== 'object' ||
    !business || typeof business !== 'object' ||
    !isId(member.user_id) || !isId(member.business_id) ||
    !isId(business.id) || !isId(business.owner_id) ||
    member.user_id !== userId || member.business_id !== companyId ||
    business.id !== companyId) deny();
  // Live business_members.role CHECK allows owner or attendant, not admin/staff.
  if (member.role === 'owner') {
    if (business.owner_id !== userId) deny();
    return Object.freeze({userId, companyId, role:'owner'});
  }
  if (member.role === 'attendant') {
    if (business.owner_id === userId) deny();
    return Object.freeze({userId, companyId, role:'attendant'});
  }
  deny();
}
