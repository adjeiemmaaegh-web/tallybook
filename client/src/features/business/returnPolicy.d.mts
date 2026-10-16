export interface ReturnPolicySettings {
 enabled:boolean;allowFullReversal:boolean;allowCashPartial:boolean;maxAgeDays:number;
}
export interface ReturnPolicySnapshot extends ReturnPolicySettings {
 revision:number;effectiveAt:string;
}
export interface ReturnPolicyRevision extends ReturnPolicySnapshot {
 reason:string;actorStaffId?:string;
}
export interface ReturnPolicyEvidence {
 salePolicy:ReturnPolicySnapshot;decisionPolicy:ReturnPolicySnapshot;
 kind:'full'|'partialCash';authorizedAt:string;
}
export interface ReturnPolicyRecord {
 createdAt:string;
 returnPolicyAtSale?:ReturnPolicySnapshot;
}
export const validateReturnPolicyHistory:(history:ReturnPolicyRevision[]|undefined)=>ReturnPolicyRevision|null;
export const currentCompanyReturnPolicy:(history:ReturnPolicyRevision[]|undefined)=>ReturnPolicySnapshot & {reason?:string;actorStaffId?:string};
export function appendCompanyReturnPolicy(
 history:ReturnPolicyRevision[]|undefined,
 settings:ReturnPolicySettings,
 now:string,reason:string,actorStaffId?:string
):readonly ReturnPolicyRevision[];
export function saleReturnPolicySnapshot(history:ReturnPolicyRevision[]|undefined):ReturnPolicySnapshot;
export function checkSaleReturnPolicySnapshot(
 history:ReturnPolicyRevision[]|undefined,saved:ReturnPolicySnapshot|undefined
):ReturnPolicySnapshot;
export function authorizeReturnPolicy(
 history:ReturnPolicyRevision[]|undefined,
 sale:ReturnPolicyRecord,kind:'full'|'partialCash',now:string
):ReturnPolicyEvidence;
export function validateRecordedReturnPolicy(
 history:ReturnPolicyRevision[]|undefined,
 sale:ReturnPolicyRecord,
 event:{createdAt:string;policyEvidence?:ReturnPolicyEvidence},
 kind:'full'|'partialCash'
):{verified:boolean;legacy:boolean};
