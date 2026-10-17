/** Run 20 operator diagnostics — read-only, company-scoped, no network or
 * financial effect. A clean audit is NOT proof of full historical acceptance.
 */
import {db,type TallybookDB,DATABASE_SCHEMA_VERSION} from "@/db/TallybookDB";
import {getActiveBusinessProfileId} from "@/features/business/activeCompany";
import {currentStaffId,requirePermission} from "@/features/staff/staff";
import {getVerifiedBackupReceipt} from "@/features/backup/backup";
import {RESTORE_JOURNAL_KEY} from "@/features/backup/restoreJournal.mjs";
import {auditLocalIntegrity} from "@/features/reliability/integrity";
import {auditRun20CrossRunLinks,type Run20CrossRunResult} from "./run20CrossRunAudit";
export interface Run20Diagnostics{
 companyId:string;observedAt:string;schemaVersion:number|null;supportedSchemaVersion:number;
 recoveryJournalPresent:boolean;backupReceipt:{
  createdAt:string;sha256:string|null
 }|null;backupIsForSelectedCompany:boolean;
 deviceStorageBytes:{usage:number|null;quota:number|null}|null;
 onlineFlag:boolean|null;integrityCoverage:"legacy-core-only";crossRun:Run20CrossRunResult|null;integrity:{
  status:"clear"|"attention";recordsChecked:number;issueCount:number;
  issueCodes:string[]
 }|null;
 independentlyVerified:false;stagingApproved:false;productionReady:false;
}
async function assertOwner(database:TallybookDB,company:string,actor:string|null){
 if(company!==getActiveBusinessProfileId()||!actor||currentStaffId(company)!==actor)
   throw Error("Local operations review requires the current unlocked company owner.");
 const member=await requirePermission("staff",database,company);
 if(member?.id!==actor||member.role!=="owner")
   throw Error("Only the authorized company owner may inspect release operations.");
 return member;
}
export async function getRun20Diagnostics(
 withIntegrityAudit:boolean=false,database:TallybookDB=db
):Promise<Run20Diagnostics>{
 const company=getActiveBusinessProfileId();
 const actor=currentStaffId(company);
 const baseline=await database.transaction("r",[
  database.appMeta,database.businessProfiles,database.staffMembers
 ],async()=>{
  await assertOwner(database,company,actor);
  if(!await database.businessProfiles.get(company))throw Error("Company no longer exists.");
  const marker=await database.appMeta.get(RESTORE_JOURNAL_KEY);
  const schema=await database.appMeta.get("schemaVersion");
  await assertOwner(database,company,actor);
  return {recoveryJournalPresent:Boolean(marker),schemaVersion:
    typeof schema?.value==="number"?schema.value:null};
 });
 // Only explicit owner action invokes a full read-only financial integrity
 // analysis. No workflow is ever marked safe merely because it returns clear.
 const integrity=withIntegrityAudit&&!baseline.recoveryJournalPresent?
   await auditLocalIntegrity(database):null;
 const crossRun=withIntegrityAudit&&!baseline.recoveryJournalPresent?
   await auditRun20CrossRunLinks(database):null;
 await assertOwner(database,company,actor);
 const receipt=await getVerifiedBackupReceipt(database);
 await assertOwner(database,company,actor);
 const belongs=receipt?.companyId===company;
 const storage=typeof navigator!=="undefined"&&navigator.storage?.estimate?
   await navigator.storage.estimate().catch(()=>null):null;
 await assertOwner(database,company,actor);
 return {
  companyId:company,observedAt:new Date().toISOString(),
  schemaVersion:baseline.schemaVersion,supportedSchemaVersion:DATABASE_SCHEMA_VERSION,
  recoveryJournalPresent:baseline.recoveryJournalPresent,
  backupReceipt:belongs&&receipt?{
   createdAt:receipt.createdAt,sha256:typeof receipt.sha256==="string"?receipt.sha256:null
  }:null,
  backupIsForSelectedCompany:belongs,
  deviceStorageBytes:storage?{
   usage:Number.isFinite(storage.usage)?storage.usage!:null,
   quota:Number.isFinite(storage.quota)?storage.quota!:null
  }:null,
  onlineFlag:typeof navigator!=="undefined"?navigator.onLine:null,
  integrityCoverage:"legacy-core-only",crossRun,
  integrity:integrity?{
   status:integrity.status,recordsChecked:integrity.recordsChecked,
   issueCount:integrity.issues.length,
   issueCodes:[...new Set(integrity.issues.map(item=>item.code))].sort()
  }:null,
  independentlyVerified:false,stagingApproved:false,productionReady:false
 };
}
