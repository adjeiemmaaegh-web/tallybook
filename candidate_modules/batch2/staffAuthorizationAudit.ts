/** Read-only staff authorization decision; production permission/shift services remain authoritative. */
export type StaffAccess={companyId:string;recordCompanyId:string;staffId:string;activeStaffId:string;role:'owner'|'supervisor'|'cashier'|string;permission:'sell'|'refund'|'discount'|'inventory'|'reports'|'staff'|string;grantedPermissions:readonly string[];shiftOpen:boolean;sessionExpiresAt:number;now:number;disabled:boolean};
export function auditStaffAuthorization(a:StaffAccess):{allowed:boolean;reasons:string[]}{
 const reasons:string[]=[];
 if(!a.companyId||a.companyId!==a.recordCompanyId)reasons.push('COMPANY_SCOPE');
 if(!a.staffId||a.staffId!==a.activeStaffId)reasons.push('STAFF_ID');
 if(a.disabled||!Number.isSafeInteger(a.now)||a.now<0||!Number.isSafeInteger(a.sessionExpiresAt)||a.sessionExpiresAt<=0||a.now>=a.sessionExpiresAt)reasons.push('SESSION');
 const policies:Record<string,readonly string[]>={owner:['sell','refund','discount','inventory','reports','staff'],supervisor:['sell','refund','discount','inventory','reports'],cashier:['sell']};
 if(!policies[a.role]?.includes(a.permission)||!a.grantedPermissions.includes(a.permission))reasons.push('PERMISSION');
 if(['sell','refund','discount'].includes(a.permission)&&!a.shiftOpen)reasons.push('SHIFT');
 return {allowed:reasons.length===0,reasons};
}
