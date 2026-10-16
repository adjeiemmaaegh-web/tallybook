export interface Run17SourceRef {kind:string;id:string}
export interface Run17Finding {
  id:string;kind:string;severity:"attention"|"review"|"information";
  title:string;evidence:string;action:string;href:string;
  sourceRefs:ReadonlyArray<Readonly<Run17SourceRef>>;
  evidenceKey:string;confidence:"observed"|"limited";
  automaticAction:false;financialPostingPerformed:false
}
export interface Run17ObservedProduct {
  productId:string;name:string;units:number;sourceSaleLineIds:string[]
}
export interface Run17Report {
  companyId:string;currency:string;period:"today"|"last7"|"all";asOf:string;scopeLabel:string;
  summary:Readonly<{
    grossRecordedInvoiceMinor:number;recordedSaleCount:number;
    fullyReversedSaleCount:number;partialReturnAffectedSaleCount:number;
    storeOriginUnknownSaleCount:number;localOrderCount:number;
    pendingDispatchedTransferCount:number;deliveredOrderCount:number;
    financialReconciliation:false;predictionPerformed:false;
  }>;
  topObservedUnits:ReadonlyArray<Run17ObservedProduct>;
  findings:ReadonlyArray<Run17Finding>;incompleteFindingCount:number;
  automaticAction:false;financialPostingPerformed:false;remoteDataUsed:false;
}
export interface Run17EvidenceInput {
  companyId:string;currency:string;period:"today"|"last7"|"all";
  asOf:string;startMs:number;endMs:number;
  products:Array<Record<string,any>>;sales:Array<Record<string,any>>;
  saleLines:Array<Record<string,any>>;saleReversals:Array<Record<string,any>>;
  cashPartialReturns:Array<Record<string,any>>;commerceHolds:Array<Record<string,any>>;
  commerceOrders:Array<Record<string,any>>;storeTransferRequests:Array<Record<string,any>>;
  storeLocations:Array<Record<string,any>>;
}
export function deriveRun17Evidence(input:Run17EvidenceInput):Readonly<Run17Report>;
