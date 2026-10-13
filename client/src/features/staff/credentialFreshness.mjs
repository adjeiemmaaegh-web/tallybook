/** Pure post-verification checks; do not rely on a credential snapshot captured
 * before PBKDF2/WebAuthn awaits. Actual record reads happen at the service
 * boundary, under its write transaction where a counter must be persisted. */
export function assertAuthenticatorCredentialFresh(initial, latest, company, count) {
  const before = initial?.webAuthn;
  const current = latest?.webAuthn;
  if (!initial || !latest || latest.id !== initial.id ||
      latest.businessProfileId !== company || initial.businessProfileId !== company ||
      latest.disabledAt || !before || !current ||
      current.credentialId !== before.credentialId ||
      current.publicKey !== before.publicKey ||
      current.algorithm !== before.algorithm ||
      !Number.isSafeInteger(current.signCount) || current.signCount < 0 ||
      !Number.isSafeInteger(before.signCount) || before.signCount < 0 ||
      current.signCount < before.signCount ||
      !Number.isSafeInteger(count) || count < 0 ||
      (current.signCount > 0 && count <= current.signCount)) {
    throw new Error('Authenticator or staff credentials changed during unlock. Use PIN and review this device.');
  }
  return current;
}

export function assertSupervisorApprovalFresh(before, latest, company, originalCashierId, currentCashierId, activeCashier, stillAllowed) {
  if (!before || !latest || before.id !== latest.id ||
      before.businessProfileId !== company || latest.businessProfileId !== company ||
      latest.disabledAt || before.pinHash !== latest.pinHash || before.salt !== latest.salt ||
      before.role !== latest.role ||
      JSON.stringify(before.permissions ?? null) !== JSON.stringify(latest.permissions ?? null) ||
      !stillAllowed || !activeCashier || activeCashier.id !== originalCashierId ||
      currentCashierId !== originalCashierId || activeCashier.role !== 'cashier') {
    throw new Error('Supervisor approval or cashier session changed. Request a new approval.');
  }
}
