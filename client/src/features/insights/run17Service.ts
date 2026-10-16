/** Run 17 — read-only, single-company evidence snapshot.
 * Never invokes optional AI models, network, real-time payment or ledger write.
 * No customer names, addresses, PINs, device keys or private staff credentials
 * are included in the derived analytics report.
 */
import {db,type TallybookDB} from "@/db/TallybookDB";
import {getActiveBusinessProfileId} from "@/features/business/activeCompany";
import {requirePermission,currentStaffId} from "@/features/staff/staff";
import {assertRun7RetailWriteReady} from "@/features/backup/run7RetailWriteBarrier.mjs";
import {reportDateRange,type ReportPeriod} from "@/features/reports/reports";
import {deriveRun17Evidence,type Run17Report} from "./run17Evidence.mjs";
export type Run17Period=ReportPeriod;
export async function getRun17Evidence(
  period:Run17Period="last7",now:Date=new Date(),database:TallybookDB=db
):Promise<Run17Report>{
 if(!["today","last7","all"].includes(period)||
    !(now instanceof Date)||!Number.isFinite(now.getTime()))
   throw Error("Choose a valid Run 17 evidence window.");
 const company=getActiveBusinessProfileId();
 const range=reportDateRange(period,now);
 const asOf=now.toISOString();
 return database.transaction("r",[
   database.appMeta,database.businessProfiles,database.staffMembers,
   database.products,database.sales,database.saleLines,database.saleReversals,
   database.cashPartialReturns,database.commerceOrders,database.commerceHolds,
   database.storeTransferRequests,database.storeLocations
 ],async()=>{
   await assertRun7RetailWriteReady(database.appMeta);
   const staff=await requirePermission("reports",database,company);
   const actorId=currentStaffId(company);
   if(!staff||!actorId||staff.id!==actorId)throw Error("Unlock reports-authorized staff.");
   const profile=await database.businessProfiles.get(company);
   if(!profile||!/^[A-Z]{3}$/.test(profile.currency))
     throw Error("The active company currency needs reconciliation.");
   const [products,sales,saleLines,saleReversals,cashPartialReturns,
     commerceOrders,commerceHolds,storeTransferRequests,storeLocations]=await Promise.all([
      database.products.where("businessProfileId").equals(company).toArray(),
      database.sales.where("businessProfileId").equals(company).toArray(),
      database.saleLines.where("businessProfileId").equals(company).toArray(),
      database.saleReversals.where("businessProfileId").equals(company).toArray(),
      database.cashPartialReturns.where("businessProfileId").equals(company).toArray(),
      database.commerceOrders.where("businessProfileId").equals(company).toArray(),
      database.commerceHolds.where("businessProfileId").equals(company).toArray(),
      database.storeTransferRequests.where("businessProfileId").equals(company).toArray(),
      database.storeLocations.where("businessProfileId").equals(company).toArray()
   ]);
   // Deliberately make no guess about unrecorded returns, credit repayment,
   // missing cost basis or remote-branch settlements.
   const report=deriveRun17Evidence({
     companyId:company,currency:profile.currency,
     period,asOf,startMs:range.start?.getTime()??0,endMs:range.end.getTime(),
     products,sales,saleLines,saleReversals,cashPartialReturns,
     commerceOrders,commerceHolds,storeTransferRequests,storeLocations,
   });
   if(getActiveBusinessProfileId()!==company||currentStaffId(company)!==actorId)
     throw Error("Company or reports session switched during the local insight query.");
   await requirePermission("reports",database,company);
   return report;
 });
}
