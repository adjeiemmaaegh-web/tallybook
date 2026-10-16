export interface Run9CostAuditResult {
 readonly restorationsVerified:number;
}
export interface Run9MinimalCostEvent {
 id:string;kind:string; saleId?:string;saleLineId?:string;
 productId:string;quantityDelta:number;reversesEventId?:string;
 createdAt:string;sourceId:string;
}
export function assertRun9ReturnCostCompleteness(input:{
 events:readonly Run9MinimalCostEvent[];
 lines:readonly {id:string;saleId:string;productId:string;quantity:number;costEventId?:string}[];
 reversals:readonly {id:string;originalSaleId:string;createdAt:string}[];
 cashReturns?:readonly {id:string;originalSaleId:string;createdAt:string;
  lines:readonly {saleLineId:string;costEventId:string;movementId:string;
   productId:string;quantity:number}[]}[];
}):Run9CostAuditResult;
