/**
 * Ensure a company-bound operation has not changed tenants while awaiting
 * local IndexedDB operations. Call after the final await and before returning
 * a sensitive read or committing a business write. This supplements (and does
 * not replace) transactional staff permission checks.
 */
export function assertCompanyScope(expected, active) {
  if (typeof expected !== 'string' || !expected.trim() ||
      typeof active !== 'string' || expected !== active) {
    throw new Error('Company changed during the operation. Retry under the active company.');
  }
  return expected;
}
