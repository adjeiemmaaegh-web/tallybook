export const NO_SALE_REASONS:readonly ['change_requested','cash_check','drawer_inspection','other'];
export interface NoSaleDraft {operationKey:string;reason:string;note:string;storeId:string;deviceId:string;staffId:string;shiftId:string}
export function validateNoSaleRequest(input:NoSaleDraft):Readonly<NoSaleDraft>;
export function sameNoSaleRequest(existing:NoSaleDraft&{businessProfileId:string},draft:NoSaleDraft&{businessProfileId:string}):boolean;
