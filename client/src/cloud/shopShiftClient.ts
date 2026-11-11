/** Cloud Shared Shop shift and immutable actor audit. Never acts as an offline login. */
import {callShop,type ShopRole} from "./shopClient";

export interface ShopShift {
 shiftId:string;companyId:string;storeId:string;staffId:string;
 openedAt:string;openingCashMinor:string;openingNote:string|null;
 closedAt:string|null;closedBy:string|null;forcedClose:boolean;
 closingCashMinor:string|null;closingNote:string|null;
 reviewedAt:string|null;reviewedBy:string|null;reviewDecision:"accepted"|"needs-investigation"|null;reviewNote:string|null;
}
export interface ShopAuditEvent {
 kind:string;eventKey:string;actorId:string;
 storeId:string|null;productId:string|null;delta:number|null;quantityAfter:number|null;
 detail:string;sourceId:string;amountMinor:string|null;
 serverRecordedAt:string;deviceReportedAt:string|null;
}
export interface ShopAuditCursor {beforeAt:string;beforeKey:string}
export interface ShopAuditPage {events:ShopAuditEvent[];hasMore:boolean;next:ShopAuditCursor|null}
export type ShiftRole=ShopRole;
const rpc="tallybook_shop_shifts" as const;
export const listShopShifts=(companyId:string)=>callShop<{shifts:ShopShift[]}>("listShifts",{companyId},rpc);
export const openShopShift=(companyId:string,input:{shiftId:string;storeId:string;openingCashMinor:number;note?:string})=>
 callShop<{shiftId:string;openedAt:string;closedAt:string|null;replayed:boolean}>("openShift",{companyId,...input},rpc);
export const closeShopShift=(companyId:string,input:{shiftId:string;closingCashMinor:number;note?:string},force=false)=>
 callShop<{shiftId:string;closedAt:string;replayed:boolean}>(force?"forceCloseShift":"closeShift",{companyId,...input},rpc);
export const reviewShopShift=(companyId:string,input:{shiftId:string;decision:"accepted"|"needs-investigation";note:string})=>
 callShop<{shiftId:string;reviewedAt:string;replayed:boolean}>("reviewShift",{companyId,...input},rpc);
export const getShopAudit=(companyId:string,input:{storeId?:string;limit?:number}&Partial<ShopAuditCursor>={})=>
 callShop<ShopAuditPage>("auditEvents",{companyId,...input},rpc);
