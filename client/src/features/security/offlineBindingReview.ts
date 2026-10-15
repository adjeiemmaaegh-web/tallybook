/**
 * Non-mutating preparation for binding a legacy offline workspace to an
 * authenticated account. This is a REVIEW CHECK, not an ownership grant.
 * A server must verify account/company membership independently before any
 * protected cloud access or migration is enabled.
 */
export interface OfflineCompanyCandidate {
  readonly id: string;
  readonly name: string;
}
export interface OfflineBindingReview {
  readonly companyId: string;
  readonly accountUserId: string;
  readonly confirmationRequired: true;
  readonly cloudAccessGranted: false;
}
export function prepareOfflineBindingReview(
  companies: readonly OfflineCompanyCandidate[],
  companyId: string,
  verifiedUserId: string | null,
  typedCompanyName: string,
): OfflineBindingReview {
  if (!verifiedUserId || !verifiedUserId.trim() || !companyId.trim())
    throw new Error("Account and company verification required.");
  const matches = companies.filter(company => company.id === companyId);
  if (matches.length !== 1 || !matches[0].name.trim() ||
      matches[0].name !== typedCompanyName.trim())
    throw new Error("Confirm the exact existing company name before continuing.");
  return {
    companyId,
    accountUserId: verifiedUserId,
    confirmationRequired: true,
    cloudAccessGranted: false,
  };
}
