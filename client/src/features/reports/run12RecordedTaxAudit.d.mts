export interface Run12RecordedTaxEvidence {
 readonly recordedTaxSales:number;readonly unknownTaxSales:number;
 readonly grossRecordedTaxMinor:number;readonly fullReversalTaxMinor:number;
 readonly partialCashRefundTaxMinor:number;readonly netRecordedTaxMinor:number;
 readonly legacyRefundTaxUnverified:number;readonly currentTaxConfigured:boolean;
 readonly statutoryTaxLiabilityVerified:false;
}
export function auditRun12RecordedTax(
 sales:readonly {id:string;businessProfileId:string;createdAt:string;totalMinor:number;
 tax?:{taxMinor:number;taxableMinor:number;totalMinor:number;
 policy:{enabled:boolean;registrationStatus:string;rateBasisPoints:number}}}[],
 reversals:readonly {businessProfileId:string;originalSaleId:string;createdAt:string;reversedSaleTotalMinor:number}[],
 partialReturns:readonly {businessProfileId:string;originalSaleId:string;createdAt:string;refundedMinor:number;returnedTaxMinor:number}[],
 profile:{id:string;taxPolicy?:{enabled:boolean}}
):Run12RecordedTaxEvidence;
