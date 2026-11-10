import {callShop} from "./shopClient";

export interface ShopSupplierBalance {
 supplierId:string;name:string;archived:boolean;
 /** Postgres bigint returned as decimal strings to avoid JS precision loss. */
 receivedMinor:string;settledMinor:string;outstandingMinor:string;
}
export interface ShopPurchaseSummary {
 orderId:string;supplierId:string;storeId:string;reference:string|null;createdAt:string;
 closed:boolean;orderedLines:number;receivedMinor:string;
}
export interface ShopPurchaseDetail {
 orderId:string;supplierId:string;storeId:string;closed:boolean;receivedMinor:string;
 lines:Array<{lineNo:number;productId:string;orderedQuantity:number;unitCostMinor:number;receivedQuantity:number}>;
}
export type SupplierPaymentMethod="cash"|"mobile"|"card"|"bank";
export const getShopSupplierBalances=(companyId:string)=>callShop<{suppliers:ShopSupplierBalance[]}>(
 "supplierBalances",{companyId},"tallybook_shop_ops");
export const listShopPurchaseOrders=(companyId:string)=>callShop<{orders:ShopPurchaseSummary[]}>(
 "listPurchaseOrders",{companyId},"tallybook_shop_ops");
export const getShopPurchaseDetails=(companyId:string,orderId:string)=>callShop<ShopPurchaseDetail>(
 "purchaseDetails",{companyId,orderId},"tallybook_shop_ops");
export const saveShopSupplier=(companyId:string,name:string,supplierId:string)=>callShop<{
 supplierId:string;name:string;archived:boolean;replayed:boolean
}>("saveSupplier",{companyId,supplierId,name},"tallybook_shop_ops");
/** Archiving hides a supplier from new orders; past orders, receipts and settlements stay intact. */
export const archiveShopSupplier=(companyId:string,supplierId:string)=>callShop<{
 supplierId:string;archived:boolean
}>("archiveSupplier",{companyId,supplierId},"tallybook_shop_ops");
export const createShopPurchaseOrder=(companyId:string,input:{
 orderId:string;storeId:string;supplierId:string;reference:string;
 lines:Array<{productId:string;quantity:number;unitCostMinor:number}>;
})=>callShop<{orderId:string;replayed:boolean}>("createPurchaseOrder",{companyId,...input},"tallybook_shop_ops");
export const receiveShopPurchase=(companyId:string,input:{receiptId:string;orderId:string;
 lines:Array<{lineNo:number;quantity:number}>})=>callShop<{
 receiptId:string;orderId:string;totalMinor:string;replayed:boolean
}>("receivePurchase",{companyId,...input},"tallybook_shop_ops");
export const closeShopPurchase=(companyId:string,orderId:string,reason:string)=>callShop<{
 orderId:string;closed:boolean;replayed:boolean
}>("closePurchaseOrder",{companyId,orderId,reason},"tallybook_shop_ops");
export const settleShopSupplier=(companyId:string,input:{settlementId:string;supplierId:string;
 amountMinor:number;method:SupplierPaymentMethod;reference:string;externalSettlementConfirmed:true})=>
 callShop<{settlementId:string;amountMinor:string;replayed:boolean;externalPaymentExecuted:false}>(
  "settleSupplier",{companyId,...input},"tallybook_shop_ops");
export interface ShopStockCount {
 countId:string;storeId:string;productId:string;expectedQuantity:number;
 countedQuantity:number|null;status:string;createdAt:string;
}
export const getShopStockCounts=(companyId:string)=>callShop<{counts:ShopStockCount[]}>(
 "listStockCounts",{companyId},"tallybook_shop_ops");
export const startShopStockCount=(companyId:string,input:{countId:string;storeId:string;productId:string})=>
 callShop<{countId:string;status:string;replayed:boolean}>("startStockCount",{companyId,...input},"tallybook_shop_ops");
export const applyShopStockCount=(companyId:string,input:{countId:string;countedQuantity:number})=>
 callShop<{countId:string;status:string;replayed:boolean}>("applyStockCount",{companyId,...input},"tallybook_shop_ops");
export const cancelShopStockCount=(companyId:string,countId:string)=>
 callShop<{countId:string;status:string;replayed:boolean}>("cancelStockCount",{companyId,countId},"tallybook_shop_ops");
