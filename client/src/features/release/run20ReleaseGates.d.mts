export type Run20GateStatus="not-run"|"pass"|"fail"|"blocked";
export interface Run20Gate {
 readonly id:string;readonly domain:string;readonly description:string;readonly mandatory:true
}
export interface Run20Evidence {
 readonly gateId:string;readonly status:Run20GateStatus;readonly sourceSha:string;
 readonly observedAt:string|null;readonly evidenceFile:string;
 readonly reviewerRole:string;readonly note:string
}
export interface Run20ReleaseDecision {
 readonly kind:"tallybook-v19-run20-release-readiness";
 readonly formatVersion:1;readonly sourceSha:string;readonly asOf:string;
 readonly pending:ReadonlyArray<string>;readonly failed:ReadonlyArray<string>;
 readonly claimsOfManualPass:ReadonlyArray<string>;readonly gateCount:number;
 readonly verifiedByIndependentReview:false;readonly acceptedByOwner:false;
 readonly allAcceptanceUnitsVerified:false;readonly externalDeploymentPermitted:false;
 readonly paymentsPermitted:false;readonly decision:"NO-GO";readonly reason:string;
 readonly policyLocks:Readonly<{
 staging:boolean;production:boolean;realPayments:boolean;
 publicCommerce:boolean;cloudFinancialSync:boolean;automaticPromotion:boolean
 }>
}
export const RUN20_EXTERNAL_STAGING_APPROVED:false;
export const RUN20_PRODUCTION_AUTHORIZED:false;
export const RUN20_REAL_PAYMENTS_AUTHORIZED:false;
export const RUN20_PUBLIC_COMMERCE_AUTHORIZED:false;
export const RUN20_CLOUD_FINANCIAL_SYNC_AUTHORIZED:false;
export const RUN20_AUTOMATIC_PROMOTION_ENABLED:false;
export const RUN20_DECISION_KIND:"tallybook-v19-run20-release-readiness";
export const RUN20_DECISION_FORMAT:1;
export const RUN20_GATES:ReadonlyArray<Run20Gate>;
export const RUN20_GATE_STATUSES:ReadonlyArray<Run20GateStatus>;
export function defaultRun20Evidence():Run20Evidence[];
export function validateRun20Evidence(value:unknown,sourceSha:string):Readonly<Run20Evidence>;
export function evaluateRun20Release(input:{sourceSha:string;asOf:string;evidence:ReadonlyArray<Run20Evidence>}):Readonly<Run20ReleaseDecision>;
export function assertRun20ExternalActionAllowed(action:string):never;
