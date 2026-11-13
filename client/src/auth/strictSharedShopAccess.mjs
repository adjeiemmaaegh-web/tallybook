/** A strict launch never accepts a cached JWT as evidence of active shop access. */
export function mayMountSharedShop(strictMode, online, status, expiresAtEpochMs, nowEpochMs) {
  if (strictMode !== true) return true;
  return online === true &&
    status === 'signed-in' &&
    Number.isSafeInteger(expiresAtEpochMs) &&
    Number.isSafeInteger(nowEpochMs) &&
    expiresAtEpochMs > nowEpochMs;
}
