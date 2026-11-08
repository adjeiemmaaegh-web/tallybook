export type ManagementProfitResult={
 status:"available"|"unavailable";
 grossProfitMinor:number|null;operatingResultMinor:number|null;
 reason:string;taxUnknownSales:number;
};
export declare function managementProfitFromRecordedFigures(values:{
 revenueExTaxMinor:number;cogsMinor?:number;expensesMinor:number;
 costsUnavailable:number;taxUnknownSales:number;
}):ManagementProfitResult;
