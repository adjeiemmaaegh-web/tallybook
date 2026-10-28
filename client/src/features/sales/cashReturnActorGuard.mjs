/**
 * Keep the refund's saved actor and shift bound to the same authorization
 * context captured when the transaction began. The service must re-read the
 * permission and shift inside its write transaction immediately before commit.
 * This is an identity check, not a replacement for requirePermission().
 */
export function assertCashReturnActorUnchanged(initialStaff, initialShift, currentStaff, currentShift) {
  const firstStaff = initialStaff?.id ?? null;
  const lastStaff = currentStaff?.id ?? null;
  const firstShift = initialShift?.id ?? null;
  const lastShift = currentShift?.id ?? null;
  if (firstStaff !== lastStaff || firstShift !== lastShift) {
    throw new Error('Refund staff or shift changed during posting; unlock and review the return again.');
  }
}
