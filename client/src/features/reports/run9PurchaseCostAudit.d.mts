export interface Run9PurchaseCostEvidence {
 readonly verifiedPurchases:number;
 readonly legacyUnverifiedPurchases:number;
}
export interface Run9PurchaseForAudit {
 id:string;businessProfileId:string;totalCostMinor:number;
 currency?:string;createdAt:string;
}
export interface Run9PurchaseLineForAudit {
 id:string;businessProfileId:string;purchaseId:string;productId:string;
 quantity:number;unitCostMinor:number;lineTotalMinor:number;
}
export interface Run9PurchaseMovementForAudit {
 id:string;businessProfileId:string;purchaseId?:string;productId:string;
 movementType:string;quantityDelta:number;previousQuantity:number;
 resultingQuantity:number;createdAt:string;
}
export interface Run9PurchaseCostEventForAudit {
 id:string;businessProfileId:string;purchaseId?:string;productId:string;
 kind:string;unitCostMinor?:number;quantityDelta:number;sourceId:string;
 createdAt:string;
}
export function assertRun9PurchaseCostCompleteness(input:{
 purchases:readonly Run9PurchaseForAudit[];
 purchaseLines:readonly Run9PurchaseLineForAudit[];
 movements:readonly Run9PurchaseMovementForAudit[];
 events:readonly Run9PurchaseCostEventForAudit[];
 company:string;expectedCurrency?:string;
}):Run9PurchaseCostEvidence;
