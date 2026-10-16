export interface StoreStockCompanyProduct {
  id: string;
  businessProfileId: string;
  stockQuantity: number;
}
export interface StoreStockLocation {
  id: string;
  businessProfileId: string;
  status: "active" | "closed";
}
export interface StoreStockAllocation {
  businessProfileId: string;
  storeId: string;
  productId: string;
  quantity: number;
}
export interface StoreStockTransfer {
  id: string;
  businessProfileId: string;
  sourceStoreId: string;
  destinationStoreId: string;
  productId: string;
  quantity: number;
}
export interface StoreStockPlan {
  authoritative: false;
  balances: Array<{storeId: string; productId: string; quantity: number}>;
  unallocated: Array<{productId: string; quantity: number}>;
  transferCount: number;
}
export function reconcileStoreStockPlan(input: {
  companyId: string;
  products: StoreStockCompanyProduct[];
  stores: StoreStockLocation[];
  allocations: StoreStockAllocation[];
  transfers: StoreStockTransfer[];
}): StoreStockPlan;
