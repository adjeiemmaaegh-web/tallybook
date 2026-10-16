export interface Run9InventoryValuation {
 readonly knownValueMinor:number;
 readonly unknownCostUnits:number;
 readonly unverifiedProducts:number;
 readonly trackedProducts:number;
 readonly complete:boolean;
 readonly totalValueMinor?:number;
}
export function summarizeRun9InventoryValuation(
 products:readonly {id:string;stockQuantity:number;itemKind?:'stock'|'service'}[],
 states:readonly ({historyAvailable:boolean;quantity:number;
  knownValueMinor:number;unknownCostUnits:number}|null)[]
):Run9InventoryValuation;
