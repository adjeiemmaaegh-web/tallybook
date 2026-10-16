/**
 * Independent read-only integrity checks for local Stage 9 store metadata.
 * Observations and transfer REQUESTS are not authoritative stock balances.
 * Only inspect the selected company's records; foreign references are reported
 * as missing/foreign without leaking other company records.
 */
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 200;
const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const quantity = value => Number.isSafeInteger(value) && value >= 0 && value <= 9_999_999;
const sameCompany = (row, companyId) => row?.businessProfileId === companyId;

export function auditStoreRecords(companyId, stores, assignments, observations, requests, products, staff) {
  if (!id(companyId) || ![stores, assignments, observations, requests, products, staff].every(Array.isArray))
    throw new Error('Store integrity snapshot is unavailable.');
  const findings = [];
  const report = (code, recordId) => findings.push({ code, recordId: id(recordId) ? recordId : undefined });
  const referenceIndex = (rows, kind) => {
    const index = new Map();
    for (const row of rows) {
      if (!id(row?.id) || index.has(row.id) || !sameCompany(row, companyId)) {
        report(kind, row?.id);
        continue;
      }
      index.set(row.id, row);
    }
    return index;
  };
  const storeIndex = referenceIndex(stores, 'store-location-invalid');
  const productIndex = referenceIndex(products, 'store-reference-invalid');
  const staffIndex = referenceIndex(staff, 'store-reference-invalid');
  const uniqueNames = new Set();
  for (const store of storeIndex.values()) {
    const name = typeof store.name === 'string' ? store.name.trim().replace(/\s+/g, ' ') : '';
    const normalizedName = name.toLocaleLowerCase();
    if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name) || store.normalizedName !== normalizedName ||
        uniqueNames.has(normalizedName) || !['active', 'closed'].includes(store.status) || !date(store.createdAt) || !date(store.updatedAt))
      report('store-location-invalid', store.id);
    uniqueNames.add(normalizedName);
  }
  const assignmentIds = new Set();
  const assignmentKeys = new Set();
  for (const row of assignments) {
    const key = `${row?.storeId}:${row?.staffId}`;
    if (!id(row?.id) || assignmentIds.has(row.id) || assignmentKeys.has(key) || !sameCompany(row, companyId) ||
        !storeIndex.has(row.storeId) || !staffIndex.has(row.staffId) || !date(row.assignedAt))
      report('store-assignment-invalid', row?.id);
    if (id(row?.id)) assignmentIds.add(row.id);
    assignmentKeys.add(key);
  }
  const observationIds = new Set();
  for (const row of observations) {
    if (!id(row?.id) || observationIds.has(row.id) || !sameCompany(row, companyId) ||
        !storeIndex.has(row.storeId) || !productIndex.has(row.productId) || !staffIndex.has(row.recordedByStaffId) ||
        !quantity(row.observedQuantity) || !date(row.observedAt) ||
        (row.note !== undefined && (typeof row.note !== 'string' || row.note.length > 240 || /[\u0000-\u001f\u007f]/.test(row.note))))
      report('store-observation-invalid', row?.id);
    if (id(row?.id)) observationIds.add(row.id);
  }
  const transferIds = new Set();
  for (const row of requests) {
    if (!id(row?.id) || transferIds.has(row.id) || !sameCompany(row, companyId) ||
        !storeIndex.has(row.sourceStoreId) || !storeIndex.has(row.destinationStoreId) || row.sourceStoreId === row.destinationStoreId ||
        !productIndex.has(row.productId) || !staffIndex.has(row.requestedByStaffId) || !quantity(row.quantity) || row.quantity === 0 ||
        !['requested', 'dispatched', 'cancelled', 'completed'].includes(row.status) || !date(row.createdAt) ||
        (row.status === 'cancelled' ? !date(row.cancelledAt) : row.cancelledAt !== undefined) ||
        (row.status === 'completed' ? (!id(row.transferId) || !id(row.completionKey) || !date(row.completedAt)) : row.completedAt !== undefined) ||
        ((row.status === 'dispatched'||row.status === 'completed'||(row.status === 'cancelled'&&row.dispatchedAt)) ? (!id(row.dispatchKey)||!date(row.dispatchedAt)||!id(row.dispatchedByStaffId)) : row.dispatchedAt!==undefined))
      report('store-transfer-invalid', row?.id);
    if (id(row?.id)) transferIds.add(row.id);
  }
  return findings;
}
