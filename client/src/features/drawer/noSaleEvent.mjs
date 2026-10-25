export const NO_SALE_REASONS = Object.freeze(['change_requested','cash_check','drawer_inspection','other']);
export function validateNoSaleRequest(input) {
  if (!input || !/^[A-Za-z0-9:_-]{8,100}$/.test(input.operationKey ?? '')) throw new Error('Invalid drawer event operation key.');
  if (!NO_SALE_REASONS.includes(input.reason)) throw new Error('Select a valid drawer opening reason.');
  if (typeof input.note !== 'string' || input.note.length > 200 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(input.note))
    throw new Error('Drawer note must be at most 200 printable characters.');
  if (!input.storeId?.trim() || !input.deviceId?.trim() || !input.staffId?.trim() || !input.shiftId?.trim())
    throw new Error('Drawer event needs store, device, staff and shift evidence.');
  return Object.freeze({ operationKey:input.operationKey, reason:input.reason, note:input.note.trim(), storeId:input.storeId,
    deviceId:input.deviceId,staffId:input.staffId,shiftId:input.shiftId });
}
export function sameNoSaleRequest(existing, draft) {
  return existing.businessProfileId === draft.businessProfileId && existing.operationKey === draft.operationKey &&
    existing.storeId === draft.storeId && existing.deviceId === draft.deviceId && existing.staffId === draft.staffId &&
    existing.shiftId === draft.shiftId && existing.reason === draft.reason && existing.note === draft.note;
}
