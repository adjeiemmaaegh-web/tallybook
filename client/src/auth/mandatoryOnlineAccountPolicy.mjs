/**
 * One explicit deployment decision protects offline-first installations:
 * normal standalone use is unaffected, while strict online-account launches
 * reject cached sessions even when a prior device owner was verified.
 */
export function mayOpenCachedOfflineLedger(mandatoryOnlineAccountMode, verifiedOwner) {
  return mandatoryOnlineAccountMode === false && verifiedOwner === true;
}
