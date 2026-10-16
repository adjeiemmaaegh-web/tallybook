export interface Run13Staff {id:string;businessProfileId:string;role:"owner"|"supervisor"|"cashier";disabledAt?:string;permissions?:string[]}
export interface Run13Store {id:string;businessProfileId:string;status:"active"|"closed"}
export interface Run13Assignment {id:string;businessProfileId:string;staffId:string;storeId:string}
export type Run13StoreAction="sell"|"receive"|"inventory"|"transfer"|"refund";
export function reviewStoreAttendantScope(input:{
 companyId:string;storeId:string;actorId:string;staff:Run13Staff[];
 stores:Run13Store[];assignments:Run13Assignment[];
 action:Run13StoreAction
}): Readonly<{companyId:string;storeId:string;actorId:string;action:Run13StoreAction;
 assigned:boolean;readOnlyDecision:true;postingAuthorized:false}>;
