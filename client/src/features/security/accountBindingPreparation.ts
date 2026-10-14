/**
 * Safe activation boundary for an offline-to-account company link.
 * A locally selected workspace and a completed backup are not ownership proof.
 * This pure check performs no writes and does not mint memberships.
 */
import { requireCompanyAccess, type AuthoritativeCompanyMembership, type VerifiedCompanyPrincipal } from "./companyAccessPolicy";
import { prepareOfflineBindingReview, type OfflineCompanyCandidate } from "./offlineBindingReview";

export interface BindingRecoveryEvidence {
  readonly companyId: string;
  readonly backupCompletedAt: string;
  readonly backupCompanyId: string;
  readonly restoreDrillPassed: boolean;
}
export interface AccountBindingAuthorization {
  readonly localCompanyId: string;
  readonly authenticatedUserId: string;
  readonly authoritativeCloudCompanyId: string;
  readonly backupCompletedAt: string;
  readonly authorizedForProvisioning: true;
  readonly cloudAccessGranted: false;
}
export function authorizeBindingPreparation(input: {
  companies: readonly OfflineCompanyCandidate[];
  selectedLocalCompanyId: string;
  typedLocalCompanyName: string;
  principal: VerifiedCompanyPrincipal | null;
  membership: AuthoritativeCompanyMembership | null;
  cloudCompanyId: string;
  recovery: BindingRecoveryEvidence;
  nowEpochMs?: number;
}): AccountBindingAuthorization {
  const now = input.nowEpochMs ?? Date.now();
  const review = prepareOfflineBindingReview(input.companies, input.selectedLocalCompanyId, input.principal?.userId ?? null, input.typedLocalCompanyName);
  if (!input.cloudCompanyId.trim() || input.recovery.companyId !== review.companyId ||
      input.recovery.backupCompanyId !== review.companyId ||
      input.recovery.restoreDrillPassed !== true)
    throw new Error("Verified backup and recovery evidence are required.");
  const timestamp = Date.parse(input.recovery.backupCompletedAt);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.recovery.backupCompletedAt) ||
      !Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== input.recovery.backupCompletedAt ||
      timestamp > now || now - timestamp > 24 * 60 * 60 * 1000)
    throw new Error("A recent, valid backup is required.");
  // The backend, not the local company list, establishes the authenticated
  // account's role in the destination tenant. This check cannot create it.
  requireCompanyAccess(input.principal, input.membership, input.cloudCompanyId, "manage_members", now);
  return {
    localCompanyId: review.companyId,
    authenticatedUserId: review.accountUserId,
    authoritativeCloudCompanyId: input.cloudCompanyId,
    backupCompletedAt: input.recovery.backupCompletedAt,
    authorizedForProvisioning: true,
    cloudAccessGranted: false,
  };
}
