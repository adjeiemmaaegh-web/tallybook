export type Run19Status="not-run"|"pass"|"fail"|"blocked"|"not-applicable";
export type Run19Platform="Windows"|"Android"|"Both";
export interface Run19Case {readonly id:string;readonly area:string;readonly description:string;readonly platform:Run19Platform;readonly critical:boolean}
export interface Run19Result {
 readonly caseId:string;readonly status:Run19Status;readonly note:string;
 readonly evidenceFile:string;readonly observedAt:string|null
}
export interface Run19Summary{
 readonly counts:Readonly<Record<Run19Status,number>>;
 readonly criticalUnverified:number;
 readonly developerMayDeclareAccepted:false;
 readonly ownerAcceptanceRecorded:false;readonly productionAuthorized:false;
 readonly releaseDecision:"NO-GO";readonly note:string
}
export interface Run19EvidencePayload{
 readonly kind:"tallybook-run19-real-device-evidence";
 readonly formatVersion:1;
 readonly sourceSha:string;readonly createdAt:string;readonly devicePlatform:"Windows"|"Android";
 readonly deviceClass:string;readonly browser:string;readonly os:string;
 readonly operatorLabel:string;readonly sampleDataOnly:true;
 readonly noLivePayments:true;readonly noExternalDeployment:true;
 readonly results:ReadonlyArray<Run19Result>;
 readonly summary:Run19Summary
}
export const RUN19_RELEASE_AUTHORIZED:false;
export const RUN19_KIND:"tallybook-run19-real-device-evidence";
export const RUN19_FORMAT:1;
export const RUN19_CASES:ReadonlyArray<Run19Case>;
export const RUN19_STATUS:ReadonlyArray<Run19Status>;
export const RUN19_PLATFORMS:ReadonlyArray<Run19Platform>;
export const RUN19_DEVICE_PLATFORMS:ReadonlyArray<"Windows"|"Android">;
export function run19DefaultResults():Run19Result[];
export function validateRun19Result(value:unknown,devicePlatform:"Windows"|"Android"):Readonly<Run19Result>;
export function run19Summary(rows:ReadonlyArray<Run19Result>,devicePlatform:"Windows"|"Android"):Readonly<Run19Summary>;
export function createRun19EvidencePayload(input:{
 sourceSha:string;createdAt:string;devicePlatform:"Windows"|"Android";deviceClass:string;browser:string;os:string;
 operatorLabel:string;sampleDataOnly:true;noLivePayments:true;noExternalDeployment:true;
 results:ReadonlyArray<Run19Result>;
}):Readonly<Run19EvidencePayload>;
export function verifyRun19EvidencePayload(value:unknown):Readonly<Run19EvidencePayload>;
