export function auditRun13StoreBackup(
 company:string,
 modes: Array<{businessProfileId:string; activatedAt:string; activatedByStaffId:string; evidence:string}>,
 entries: Array<{id:string;businessProfileId:string;storeId:string;productId:string;sourceId:string;submissionKey:string;sequence:number;quantityDelta:number;createdAt:string;kind:string;transferId?:string}>,
 products: Array<{id:string;businessProfileId:string;stockQuantity:number;itemKind?:string}>,
 stores: Array<{id:string;businessProfileId:string}>,
 requests: Array<{id:string;businessProfileId:string;status:string;transferId?:string;completionKey?:string;completedAt?:string;productId:string;sourceStoreId:string;destinationStoreId:string;quantity:number}>
): {active:boolean;entryCount:number;transferCount?:number};
