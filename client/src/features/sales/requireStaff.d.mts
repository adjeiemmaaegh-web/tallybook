export interface CheckoutActor { id:string;businessProfileId:string;disabledAt?:string }
export interface CheckoutShift { id:string;staffId:string;businessProfileId:string;openedAt:string;closedAt?:string }
export function assertCheckoutAttribution(actor:CheckoutActor|null|undefined,shift:CheckoutShift|null|undefined,companyId:string,activeStaffId:string|null):{staffId:string;shiftId:string};
export function normalizeMobileReference(method:string,providerId?:string,value?:string):string|undefined;
export function assertUnusedMobileReference(payments:readonly {businessProfileId:string;method:string;mobileMoneyProviderId?:string;mobileMoneyReference?:string;saleId:string}[],companyId:string,providerId:string,reference:string,excludedSaleId?:string):void;
