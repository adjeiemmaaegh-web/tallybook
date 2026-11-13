/** Full-history saved recorded tax amounts; not a statutory tax filing. */
export interface Run12RecordedTaxConservation {
 readonly recordedTaxSales:number;
 readonly unknownTaxSales:number;
 readonly legacyRefundTaxUnverified:number;
 readonly grossRecordedTaxMinor:number;
 readonly fullReversalTaxMinor:number;
 readonly partialCashRefundTaxMinor:number;
 readonly netRecordedTaxMinor:number;
 readonly recordedTaxEvidenceComplete:boolean;
 readonly statutoryTaxLiabilityVerified:false;
}
export function auditRun12RecordedTaxConservation(
 sales:unknown[],reversals:unknown[],cashReturns:unknown[],company:string,
):Run12RecordedTaxConservation;
