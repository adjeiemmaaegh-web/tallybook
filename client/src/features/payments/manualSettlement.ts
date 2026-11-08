import {db,type TallybookDB} from "@/db/TallybookDB";
import {getActiveBusinessProfileId} from "@/features/business/activeCompany";
import {requirePermission} from "@/features/staff/staff";
import {assertCompanyScope} from "@/features/business/companyScope.mjs";
import {parseManualTenderStatement,reconcileManualTenderStatement,type ManualTenderReconcileResult} from "./manualSettlement.mjs";

export async function previewManualTenderStatement(csv:string,database:TallybookDB=db):Promise<ManualTenderReconcileResult>{
 const company=getActiveBusinessProfileId();
 const statement=parseManualTenderStatement(csv);
 const payments=await database.transaction("r",[database.payments,database.staffMembers],async()=>{
  await requirePermission("reports",database,company);
  return database.payments.where("businessProfileId").equals(company).toArray();
 });
 assertCompanyScope(company,getActiveBusinessProfileId());
 await requirePermission("reports",database,company);
 return reconcileManualTenderStatement(payments,statement,company);
}
