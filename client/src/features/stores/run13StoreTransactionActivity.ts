/** Run 13 — company-scoped, read-only local store transaction activity.
 * Gross invoices are NOT cash receipts or net revenue; supplier costs are
 * NOT proof of supplier payment. No remote consolidation or accounting claim.
 */
import {db,type TallybookDB} from "@/db/TallybookDB";
import {getActiveBusinessProfileId} from "@/features/business/activeCompany";
import {requirePermission} from "@/features/staff/staff";

export interface StoreTransactionActivity {
  storeId:string;
  storeName:string;
  saleCount:number;
  grossSaleInvoiceMinor:number;
  purchaseCount:number;
  grossPurchaseCostMinor:number;
  fullSaleReversalCount:number;
  cashPartialReturnCount:number;
  /** Display only when all linked sale/purchase currency evidence matches. */
  currency:string|null;
}
export async function getRun13StoreTransactionActivity(database:TallybookDB=db):Promise<{
  rows:StoreTransactionActivity[];
  unattributedHistoricalSales:number;
  unattributedHistoricalPurchases:number;
  authoritativeFinancialConsolidation:false;
}> {
  const company=getActiveBusinessProfileId();
  return database.transaction("r",[
    database.storeLocations,database.sales,database.purchases,
    database.saleReversals,database.cashPartialReturns,database.staffMembers
  ],async()=>{
    await requirePermission("reports",database,company);
    const [stores,sales,purchases,reversals,partial]=await Promise.all([
      database.storeLocations.where("businessProfileId").equals(company).toArray(),
      database.sales.where("businessProfileId").equals(company).toArray(),
      database.purchases.where("businessProfileId").equals(company).toArray(),
      database.saleReversals.where("businessProfileId").equals(company).toArray(),
      database.cashPartialReturns.where("businessProfileId").equals(company).toArray()
    ]);
    if(getActiveBusinessProfileId()!==company ||
       [...stores,...sales,...purchases,...reversals,...partial].some(e=>e.businessProfileId!==company))
      throw new Error("Company changed while preparing store activity.");
    const storeIds=new Set(stores.map(s=>s.id));
    const saleById=new Map(sales.map(s=>[s.id,s]));
    for(const item of reversals) if(!saleById.has(item.originalSaleId))
      throw new Error("Full reversal references an unavailable company sale.");
    for(const item of partial) if(!saleById.has(item.originalSaleId))
      throw new Error("Partial return references an unavailable company sale.");
    if(sales.some(s=>s.storeId&&!storeIds.has(s.storeId)) ||
       purchases.some(p=>p.storeId&&!storeIds.has(p.storeId)))
      throw new Error("Store financial source references a missing location.");
    const sum=(rows:Array<{amount:number}>)=>{
      let total=0;
      for(const row of rows) {
        if(!Number.isSafeInteger(row.amount)||row.amount<0||
           !Number.isSafeInteger(total+row.amount))
          throw new Error("Store activity contains unsafe money arithmetic.");
        total+=row.amount;
      }
      return total;
    };
    const rows=stores.map(store=>{
      const storeSales=sales.filter(s=>s.storeId===store.id);
      const storePurchases=purchases.filter(p=>p.storeId===store.id);
      const currencySet=new Set([...storeSales.map(s=>s.currency),...storePurchases.map(p=>p.currency)]);
      if(currencySet.size>1) throw new Error("Store activity has mixed currency. Reconcile first.");
      return {
        storeId:store.id,storeName:store.name,
        saleCount:storeSales.length,
        grossSaleInvoiceMinor:sum(storeSales.map(s=>({amount:s.totalMinor}))),
        purchaseCount:storePurchases.length,
        grossPurchaseCostMinor:sum(storePurchases.map(p=>({amount:p.totalCostMinor}))),
        fullSaleReversalCount:reversals.filter(r=>saleById.get(r.originalSaleId)?.storeId===store.id).length,
        cashPartialReturnCount:partial.filter(r=>saleById.get(r.originalSaleId)?.storeId===store.id).length,
        currency:[...currencySet][0]??null,
      };
    });
    return {
      rows,
      unattributedHistoricalSales:sales.filter(s=>!s.storeId).length,
      unattributedHistoricalPurchases:purchases.filter(p=>!p.storeId).length,
      authoritativeFinancialConsolidation:false as const,
    };
  });
}
