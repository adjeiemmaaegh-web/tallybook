export interface ProductPromotionRevision {
 version:1;productId:string;companyId:string;revision:number;ownerStaffId:string;reason:string;
 enabled:boolean;discountBps:number;changedAt:string;startsAt:string;endsAt:string;
}
export interface ProductWithPromotion {id:string;businessProfileId:string;promotionHistory?:ProductPromotionRevision[]}
export declare function validatePromotionHistory(history:ProductPromotionRevision[]|undefined,productId:string,companyId:string):ProductPromotionRevision[];
export declare function effectivePromotionPrice(product:ProductWithPromotion,regularUnitMinor:number,nowISO:string):{
 unitPriceMinor:number;originalUnitPriceMinor:number;savingsMinor:number;revision:number
};
export declare function promotionPriceReviewKey(lines:Array<{
 productId:string;quantity:number;unitPriceMinor:number;revision:number
}>):string;
