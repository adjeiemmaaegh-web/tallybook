/**
 * Pure, fail-closed authenticated company-access policy.
 *
 * IMPORTANT: This module does not authenticate anyone or fetch trusted
 * membership. Its callers must obtain identity from a validated auth session
 * and membership from an authoritative tenant service / RLS-protected table.
 * Never construct membership from locally editable IndexedDB or a selected ID.
 *
 * Legacy offline workspace selection remains separate until an owner-approved
 * identity-to-local-data migration is implemented and verified.
 */
export type CompanyAccessRole = "owner" | "attendant";
export type CompanyAccessAction = "read" | "write" | "manage_members" | "delete_company";

export interface VerifiedCompanyPrincipal {
  readonly userId: string;
  readonly expiresAtEpochMs: number;
}

export interface AuthoritativeCompanyMembership {
  readonly userId: string;
  readonly companyId: string;
  readonly role: CompanyAccessRole;
  readonly status: "active" | "revoked" | "pending";
}

const roleActions: Readonly<Record<CompanyAccessRole, ReadonlySet<CompanyAccessAction>>> = {
  owner: new Set(["read", "write", "manage_members", "delete_company"]),
  // The canonical cloud role is attendant; actual domain writes are
  // independently denied by Run 5 until Run 6 staff permissions exist.
  attendant: new Set(["read"]),
};

export function canAccessCompany(
  principal: VerifiedCompanyPrincipal | null,
  membership: AuthoritativeCompanyMembership | null,
  companyId: string,
  action: CompanyAccessAction,
  nowEpochMs: number = Date.now(),
): boolean {
  if (!principal || !membership || !companyId || !companyId.trim()) return false;
  if (!principal.userId.trim() || !membership.userId.trim() || !membership.companyId.trim()) return false;
  if (!Number.isSafeInteger(principal.expiresAtEpochMs) || !Number.isSafeInteger(nowEpochMs)) return false;
  if (principal.expiresAtEpochMs <= nowEpochMs) return false;
  if (principal.userId !== membership.userId || companyId !== membership.companyId) return false;
  if (membership.status !== "active") return false;
  return Object.prototype.hasOwnProperty.call(roleActions, membership.role)
    && roleActions[membership.role].has(action);
}

export function requireCompanyAccess(
  principal: VerifiedCompanyPrincipal | null,
  membership: AuthoritativeCompanyMembership | null,
  companyId: string,
  action: CompanyAccessAction,
  nowEpochMs: number = Date.now(),
): void {
  if (!canAccessCompany(principal, membership, companyId, action, nowEpochMs))
    throw new Error("Company access is not authorized.");
}
