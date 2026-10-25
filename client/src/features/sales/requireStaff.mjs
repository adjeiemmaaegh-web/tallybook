/** Pure fail-closed checkout evidence checks; never a substitute for service authorization. */
export function assertCheckoutAttribution(actor, shift, companyId, activeStaffId) {
  if (!actor || typeof actor.id !== 'string' || !actor.id.trim() || actor.businessProfileId !== companyId || actor.disabledAt)
    throw new Error('Unlock your assigned staff account before completing a sale.');
  if (activeStaffId !== actor.id) throw new Error('Staff session changed; unlock again.');
  if (!shift || shift.staffId !== actor.id || shift.businessProfileId !== companyId || shift.closedAt ||
      !shift.id || !Number.isFinite(Date.parse(shift.openedAt)))
    throw new Error('Open your staff shift before completing a sale.');
  return { staffId: actor.id, shiftId: shift.id };
}
const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9 ._:/-]{2,119}$/;
export function normalizeMobileReference(method, providerId, value) {
  if (method !== 'mobile') {
    if (providerId?.trim() || value?.trim()) throw new Error('Mobile Money details belong only to mobile payments.');
    return undefined;
  }
  if (typeof providerId !== 'string' || !providerId.trim()) throw new Error('Select a saved Mobile Money provider.');
  if (typeof value !== 'string' || !REFERENCE.test(value.trim()))
    throw new Error('Enter the Mobile Money transaction reference (3–120 characters).');
  return value.trim();
}
export function assertUnusedMobileReference(payments, companyId, providerId, reference, excludedSaleId) {
  const key = reference.trim().toUpperCase();
  if (payments.some(row => row.businessProfileId === companyId && row.method === 'mobile' &&
      row.mobileMoneyProviderId === providerId && row.saleId !== excludedSaleId &&
      typeof row.mobileMoneyReference === 'string' && row.mobileMoneyReference.trim().toUpperCase() === key))
    throw new Error('This provider transaction reference is already recorded. Review the MoMo statement before retrying.');
}
