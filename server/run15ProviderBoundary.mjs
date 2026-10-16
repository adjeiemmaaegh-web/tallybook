/** Run 15 provider-neutral external payment adapter contract.
 * No real provider has been selected, provisioned or approved. The default
 * denies every external intent, verification, refund and chargeback.
 * Provider SDK/network integration requires a new reviewed opt-in.
 */
export const RUN15_REAL_GATEWAY_ENABLED=false;
export const RUN15_APPROVED_SANDBOX_PROVIDER=null;
export function requireRun15ApprovedProvider(configuration) {
  if(RUN15_REAL_GATEWAY_ENABLED!==true ||
     typeof RUN15_APPROVED_SANDBOX_PROVIDER!=="string" ||
     !configuration || configuration.environment!=="sandbox" ||
     configuration.providerId!==RUN15_APPROVED_SANDBOX_PROVIDER ||
     configuration.production===true || configuration.liveKeysPresent===true)
    throw Error("No external payment provider or sandbox environment is owner-approved.");
  return true;
}
export function createRun15UnconfiguredProviderAdapter() {
  const deny=()=>{throw Error("External payment provider adapter is disabled pending explicit selection and sandbox authorization.");};
  return Object.freeze({
    mode:"disabled",
    createIntent:deny,inspectIntent:deny,
    verifyCallback:deny,refund:deny,inspectDispute:deny,
  });
}
