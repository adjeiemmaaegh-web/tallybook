export interface StaffAuthorityMember {
  id:string;
  businessProfileId:string;
  role:'owner'|'supervisor'|'cashier';
  pinHash:string;
  salt:string;
  permissions?:Array<'sell'|'refund'|'discount'|'inventory'|'reports'|'staff'>;
  disabledAt?:string;
}
export interface StaffAuthorityShift {
  id:string;businessProfileId:string;staffId:string;openedAt:string;
  openingFloatMinor:number;closedAt?:string;
}
export function staffCredentialBinding(member:StaffAuthorityMember):string;
export function assertStaffAuthority(args:{
  member:StaffAuthorityMember|undefined|null;companyId:string;
  action:'sell'|'refund'|'discount'|'inventory'|'reports'|'staff';
  sessionId:string|null|undefined;credentialBinding:string|undefined;
}):{readonly companyId:string;readonly staffId:string;readonly role:string;readonly action:string};
export function assertStaffShift(args:{
  staff:{id:string;businessProfileId:string}|null|undefined;
  shift:StaffAuthorityShift|null|undefined;companyId:string;now?:number;
}):{readonly companyId:string;readonly staffId:string;readonly shiftId:string};
export function assertExactSupervisorApproval(args:{
  approval:{company:string;approverId:string;cashierId:string;
    cashierGeneration:number;expiresAt:number;amountMinor:number;subtotalMinor:number}
    |null|undefined;
  companyId:string;cashierId:string|null;cashierGeneration:number;
  amountMinor:number;subtotalMinor:number;now?:number;
}):string;
export const STAFF_ACTIONS:readonly string[];
