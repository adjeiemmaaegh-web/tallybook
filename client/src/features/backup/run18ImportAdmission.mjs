/** Run 18 — bounded import admission for low-memory offline devices.
 * A file is always rejected BEFORE destructive restore. It is never clipped.
 * deviceMemory is an optional browser hint, NOT a substitute for QA.
 */
import {assertBackupImportFileSize,utf8ExceedsLimit,MAX_ENCRYPTED_BACKUP_BYTES} from "./backupResourceLimits.mjs";
export function run18ImportMemoryLimit(deviceMemoryGiB){
 if(typeof deviceMemoryGiB!=="number"||!Number.isFinite(deviceMemoryGiB)||deviceMemoryGiB<=0)
   return MAX_ENCRYPTED_BACKUP_BYTES;
 if(deviceMemoryGiB<=1)return 12*1024*1024;
 if(deviceMemoryGiB<=2)return 24*1024*1024;
 if(deviceMemoryGiB<=4)return 48*1024*1024;
 return MAX_ENCRYPTED_BACKUP_BYTES;
}
export function assertRun18ImportAdmission(size,deviceMemoryGiB){
 assertBackupImportFileSize(size);
 const budget=run18ImportMemoryLimit(deviceMemoryGiB);
 if(size>budget)throw Error("This device reports limited available memory for a "+
    Math.ceil(size/(1024*1024))+" MiB backup. No record was read or changed. "+
    "Use a device with more memory or an independently verified smaller backup; never truncate financial records.");
 return true;
}
export async function readRun18BoundedBackupFile(file,deviceMemoryGiB){
 if(!file||typeof file.text!=="function")throw Error("Select an existing backup file.");
 assertRun18ImportAdmission(file.size,deviceMemoryGiB);
 const text=await file.text();
 // File.size is metadata, and a mocked/modified file need not match it.
 if(typeof text!=="string"||utf8ExceedsLimit(text,run18ImportMemoryLimit(deviceMemoryGiB)))
   throw Error("Actual backup bytes exceed this device\'s admitted memory budget. No records were imported or truncated.");
 return text;
}
