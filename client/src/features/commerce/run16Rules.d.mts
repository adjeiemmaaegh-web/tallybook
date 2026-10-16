export interface Run16CommerceHold {
 id:string;businessProfileId:string;orderId:string;productId:string;
 storeId?:string;quantity:number;unitPriceMinor:number;submissionKey:string;
 createdAt:string;expiresAt:string;updatedAt:string;
 status:"active"|"consumed"|"released";
 reason:"owner-confirmed"|"pos-consumed"|"order-cancelled"|"hold-expired";
}
export interface Run16OrderEvent {
 id:string;businessProfileId:string;orderId:string;actorStaffId:string;submissionKey:string;sequence:number;
 action:"reserve"|"release"|"pos-consume"|"pack"|"dispatch"|"deliver"|"return-request"|"cancel";
 fromStatus:string;toStatus:string;createdAt:string;note:string;financialPostingPerformed:false;
}
export const RUN16_PUBLIC_NETWORK_ENABLED:false;
export const RUN16_LOCAL_COMMERCE_STATES:ReadonlyArray<string>;
export function validateRun16Hold(value:unknown):Readonly<Run16CommerceHold>;
export function reservationBalance(holds:Run16CommerceHold[],company:string,productId:string,
 storeId:string|undefined,now:string,excludeOrderId?:string):number;
export function allowedRun16DeliveryTransition(status:string,action:string,hasSale:boolean):string;
export function validateRun16DeliveryEvidence(value:unknown):Readonly<Run16OrderEvent>;
export function auditRun16PortableCommerce(orders:unknown[],holds:Run16CommerceHold[],
 events:Run16OrderEvent[],products:unknown[],company:string):Readonly<{
 orders:number;holds:number;events:number;financialPostingPerformed:false;publiclyPublished:false
}>;
