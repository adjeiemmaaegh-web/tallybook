/** Run 20 developer closure — read-only structural audit of Runs 13–17.
 * Reuses existing strict backup invariants. No finance write, network,
 * physical-device claim or release acceptance is performed.
 */
import {db,type TallybookDB} from "@/db/TallybookDB";
import {getActiveBusinessProfileId} from "@/features/business/activeCompany";
import {requirePermission,currentStaffId} from "@/features/staff/staff";
import {assertRun7RetailWriteReady} from "@/features/backup/run7RetailWriteBarrier.mjs";
import {auditRun13StoreBackup} from "@/features/stores/run13BackupAudit.mjs";
import {auditRun16PortableCommerce} from "@/features/commerce/run16Rules.mjs";
import {reconcileRun17Reviews} from "@/features/insights/run17ReviewAudit.mjs";
type CheckCode="run13-store"|"run16-commerce"|"run17-advisory"|"commerce-sale-links";
export interface Run20CrossRunResult {
 readonly checkedAt:string;readonly companyId:string;readonly checkedRecordCount:number;
 readonly checks:ReadonlyArray<Readonly<{code:CheckCode;status:"clear"|"attention";detail:string}>>;
 readonly status:"clear"|"attention";readonly financialAcceptanceVerified:false;
 readonly physicalInventoryVerified:false;readonly independentAcceptance:false
}
export async function auditRun20CrossRunLinks(database:TallybookDB=db):Promise<Run20CrossRunResult>{
 const company=getActiveBusinessProfileId(),actor=currentStaffId(company);
 if(!company||!actor)throw Error("Unlock a company owner to inspect saved evidence.");
 return database.transaction("r",[
   database.appMeta,database.businessProfiles,database.staffMembers,database.products,
   database.inventoryMovements,database.storeLocations,database.storeTransferRequests,
   database.storeStockModes,database.storeStockEntries,database.commerceOrders,
   database.commerceHolds,database.commerceDeliveryEvents,database.run17ReviewEvents,database.sales
 ],async()=>{
   await assertRun7RetailWriteReady(database.appMeta);
   const authorized=await requirePermission("staff",database,company);
   if(!authorized||authorized.id!==actor||authorized.role!=="owner"||
      currentStaffId(company)!==actor||getActiveBusinessProfileId()!==company)
     throw Error("Company owner authorization changed during integrity review.");
   if(!await database.businessProfiles.get(company))throw Error("Selected company is missing.");
   const [products,movements,stores,transfers,entries,orders,holds,events,reviews,sales,staff,mode]=await Promise.all([
     database.products.where("businessProfileId").equals(company).toArray(),
     database.inventoryMovements.where("businessProfileId").equals(company).toArray(),
     database.storeLocations.where("businessProfileId").equals(company).toArray(),
     database.storeTransferRequests.where("businessProfileId").equals(company).toArray(),
     database.storeStockEntries.where("businessProfileId").equals(company).toArray(),
     database.commerceOrders.where("businessProfileId").equals(company).toArray(),
     database.commerceHolds.where("businessProfileId").equals(company).toArray(),
     database.commerceDeliveryEvents.where("businessProfileId").equals(company).toArray(),
     database.run17ReviewEvents.where("businessProfileId").equals(company).toArray(),
     database.sales.where("businessProfileId").equals(company).toArray(),
     database.staffMembers.where("businessProfileId").equals(company).toArray(),
     database.storeStockModes.get(company)
   ]);
   const arrays:ReadonlyArray<ReadonlyArray<{businessProfileId:string}>>=[
     products,movements,stores,transfers,entries,orders,holds,events,reviews,sales,staff
   ];
   if(arrays.some(rows=>rows.some(row=>row.businessProfileId!==company)))
     throw Error("Foreign-company record found in scoped integrity snapshot.");
   const checks:Array<{code:CheckCode;status:"clear"|"attention";detail:string}>=[];
   const audit=(code:CheckCode,fn:()=>void)=>{
     try{fn();checks.push({code,status:"clear",detail:"Local source links reconciled, not independently accepted."});}
     catch{checks.push({code,status:"attention",detail:"Saved relationship requires review. Preserve original records and investigate source detail."});}
   };
   audit("run13-store",()=>{auditRun13StoreBackup(company,mode?[mode]:[],entries,products,stores,transfers,movements);});
   audit("run16-commerce",()=>{auditRun16PortableCommerce(orders,holds,events,products,company);});
   audit("run17-advisory",()=>{
     reconcileRun17Reviews(reviews,company);
     const memberIds=new Set(staff.map(row=>row.id));
     for(const row of reviews)if(!memberIds.has(row.staffId))throw Error("Unlinked advisory author.");
   });
   audit("commerce-sale-links",()=>{
     const salesById=new Map(sales.map(row=>[row.id,row]));
     const ordersById=new Map(orders.map(row=>[row.id,row]));
     for(const order of orders)if(order.saleId) {
       const sale=salesById.get(order.saleId);
       if(!sale||sale.commerceOrderId!==order.id)throw Error("Customer order and POS sale are not reciprocally linked.");
     }
     for(const sale of sales)if(sale.commerceOrderId) {
       const order=ordersById.get(sale.commerceOrderId);
       if(!order||order.saleId!==sale.id)throw Error("POS sale lacks matching customer order.");
     }
   });
   await assertRun7RetailWriteReady(database.appMeta);
   const stillAuthorized=await requirePermission("staff",database,company);
   if(!stillAuthorized||stillAuthorized.id!==actor||stillAuthorized.role!=="owner"||
     currentStaffId(company)!==actor||getActiveBusinessProfileId()!==company)
     throw Error("Company owner session changed during review.");
   return {
     checkedAt:new Date().toISOString(),companyId:company,
     checkedRecordCount:arrays.reduce((count,rows)=>count+rows.length,0)+(mode?1:0),
     checks,status:checks.some(c=>c.status==="attention")?"attention" as const:"clear" as const,
     financialAcceptanceVerified:false as const,
     physicalInventoryVerified:false as const,independentAcceptance:false as const
   };
 });
}
