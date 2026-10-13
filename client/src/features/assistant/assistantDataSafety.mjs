/** Pure, dependency-free guards for assistant data stored per company.
 * Keeping these checks separate permits native regression testing when the
 * IndexedDB/Vitest browser toolchain is unavailable.
 */
export function assertAssistantCompanyScope(requestedId, activeId) {
  if (typeof requestedId !== 'string' || !requestedId.trim() ||
      typeof activeId !== 'string' || requestedId !== activeId)
    throw new Error('Switch to the company that owns this assistant record before changing or reading it.');
}

/** A bounded recent-history UI must not accidentally expose the entire store. */
export function validateAssistantHistoryLimit(limit) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000)
    throw new Error('Assistant history limit must be a positive integer of at most 1000.');
  return limit;
}

/** Stable newest-first order, including records sharing a timestamp. */
export function orderAssistantHistoryNewest(entries) {
  return [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}

/** IDs to prune, calculated from entries read inside the SAME audit write
 * transaction as append and deletion. This policy remains a bounded local
 * activity diary, not a permanent cryptographically secure audit trail.
 */
export function selectAssistantAuditPruneIds(entries, maxEntries) {
  if (!Array.isArray(entries) || !Number.isSafeInteger(maxEntries) || maxEntries < 1)
    throw new Error('Invalid assistant audit retention input.');
  const ids = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry.id !== 'string' || !entry.id ||
        typeof entry.createdAt !== 'string' || Number.isNaN(Date.parse(entry.createdAt)) || ids.has(entry.id))
      throw new Error('Invalid or duplicate assistant audit record.');
    ids.add(entry.id);
  }
  if (entries.length <= maxEntries) return [];
  return [...entries]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    .slice(0, entries.length - maxEntries)
    .map(entry => entry.id);
}
