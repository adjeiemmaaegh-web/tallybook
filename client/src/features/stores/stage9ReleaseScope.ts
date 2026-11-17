/** Stage 9 limited local-release boundary.
 * These flags are product availability declarations, not server authorization.
 * Every financial/inventory write still requires independent service-level checks.
 * Do not enable deferred capabilities without completing Stage 8/9 integration QA.
 */
export const STAGE9_RELEASE_SCOPE = Object.freeze({
  storeDirectory: true,
  staffStoreAssignments: true,
  physicalStockObservations: true,
  transferRequestsOnly: false,
  localActivityReport: true,
  authoritativeStoreStock: true,
  executeStoreTransfer: true,
  multiDeviceAttendantCheckout: false,
  remoteEventReplication: false,
  consolidatedStoreFinancials: false,
} as const);

export type Stage9Capability = keyof typeof STAGE9_RELEASE_SCOPE;

export function isStage9CapabilityAvailable(capability: Stage9Capability): boolean {
  return STAGE9_RELEASE_SCOPE[capability];
}

/** Fail closed when a caller attempts a feature not authorized for this release. */
export function requireStage9Capability(capability: Stage9Capability): void {
  if (!isStage9CapabilityAvailable(capability)) {
    throw new Error(`Stage 9 feature unavailable pending integration and QA: ${capability}`);
  }
}
