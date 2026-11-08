/** Read-only disaster recovery rehearsal: no restore, clear, upload, cloud sync
 * or physical backup file is created. Uses the production backup parser itself.
 * A successful in-memory roundtrip is NOT proof that an encrypted file exists.
 */
import {db,type TallybookDB} from "@/db/TallybookDB";
import {getActiveBusinessProfileId} from "@/features/business/activeCompany";
import {createBackup,parseBackup,stringifyBackup,getVerifiedBackupReceipt} from "./backup";
import {assertCompanyScope} from "@/features/business/companyScope.mjs";

export interface ReadOnlyRecoveryDrill {
 companyId:string;createdAt:string;roundTripValidated:true;
 snapshotCounts:{products:number;sales:number;payments:number;receipts:number;customers:number;expenses:number};
 verifiedExternalFile:{verifiedAt:string;fileFingerprint:string}|null;
 externalFileRequired:true;
 warning:string;
}
export async function rehearseDisasterRecovery(database:TallybookDB=db):Promise<ReadOnlyRecoveryDrill>{
 const company=getActiveBusinessProfileId();
 await database.open();
 const prior=await database.appMeta.get("restoreRecoveryJournal");
 if(prior)throw Error("An interrupted restore must be recovered before any recovery rehearsal.");
 const backup=await createBackup(database);
 assertCompanyScope(company,getActiveBusinessProfileId());
 const inMemoryText=stringifyBackup(backup);
 const parsed=parseBackup(inMemoryText);
 if(parsed.records.businessProfiles.length!==1||parsed.records.businessProfiles[0].id!==company)
   throw Error("Backup round-trip changed company identity.");
 const keys=["products","sales","payments","receipts","customers","expenses"] as const;
 const counts=Object.fromEntries(keys.map(key=>{
  const before=backup.records[key],after=parsed.records[key];
  if(before.length!==after.length)throw Error("Backup parser changed "+key+" count.");
  const beforeIds=[...before.map(row=>row.id)].sort();
  const afterIds=[...after.map(row=>row.id)].sort();
  if(JSON.stringify(beforeIds)!==JSON.stringify(afterIds))
    throw Error("Backup round-trip changed "+key+" identities.");
  return [key,beforeIds.length];
 })) as ReadOnlyRecoveryDrill["snapshotCounts"];
 if(await database.appMeta.get("restoreRecoveryJournal"))
   throw Error("A restore began during the read-only rehearsal. Recheck before trusting the result.");
 assertCompanyScope(company,getActiveBusinessProfileId());
 const receipt=await getVerifiedBackupReceipt(database);
 const external=receipt?.companyId===company ? {
  verifiedAt:receipt.createdAt,fileFingerprint:receipt.sha256
 } :null;
 return {companyId:company,createdAt:new Date().toISOString(),roundTripValidated:true,
  snapshotCounts:counts,verifiedExternalFile:external,externalFileRequired:true,
  warning:external
   ?"A reselected encrypted file was previously verified on this device. This in-memory drill did not re-open that file or verify recovery on another device."
   :"No independently reselected encrypted backup file is recorded as verified for this company. Export and verify one; this in-memory test alone cannot protect against device loss."};
}
