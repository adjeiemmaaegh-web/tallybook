export interface StoreStockEvent {
  id: string;
  businessProfileId: string;
  storeId: string;
  productId: string;
  sourceId: string;
  submissionKey: string;
  createdAt: string;
  quantityDelta: number;
  kind: "allocation" | "transfer-out" | "transfer-in";
  transferId?: string;
}
export function auditStoreStockEvents(input: {
  companyId: string;
  stores: Array<{id:string;businessProfileId:string}>;
  products: Array<{id:string;businessProfileId:string;stockQuantity:number}>;
  entries: StoreStockEvent[];
}): {
  balances: Array<{storeId:string;productId:string;quantity:number}>;
  unallocated: Array<{productId:string;quantity:number}>;
  pairedTransfers: number;
  authoritative: false;
};
