/** Fail-closed company-context verification for integration at service boundaries. */
export type CompanyContext={expectedCompanyId:string; activeCompanyId:string; recordCompanyId:string};
export function assertCompanyIsolation(ctx:CompanyContext):void{
 if(!ctx.expectedCompanyId||!ctx.activeCompanyId||!ctx.recordCompanyId||ctx.expectedCompanyId!==ctx.activeCompanyId||ctx.recordCompanyId!==ctx.expectedCompanyId)throw new Error('COMPANY_SCOPE_MISMATCH');
}
/** Caller must recapture activeCompanyId after awaited operations. */
export async function companyScopedRead<T>(expectedCompanyId:string,getActiveCompanyId:()=>string,read:()=>Promise<{businessProfileId:string;value:T}>):Promise<T>{
 if(!expectedCompanyId||getActiveCompanyId()!==expectedCompanyId)throw new Error('COMPANY_SCOPE_MISMATCH');
 const result=await read();
 assertCompanyIsolation({expectedCompanyId,activeCompanyId:getActiveCompanyId(),recordCompanyId:result.businessProfileId});
 return result.value;
}
