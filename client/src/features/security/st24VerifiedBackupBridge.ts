/** ST24-05: guarded bridge from a reselected verified encrypted Tallybook backup
 * to an INACTIVE encrypted shadow snapshot. Not imported by the app UI.
 * Never writes to the live ledger, restores a backup, or switches DB aliases.
 */
import {db} from '@/db/TallybookDB';
import {getActiveBusinessProfileId} from '@/features/business/activeCompany';
import {requirePermission} from '@/features/staff/staff';
import {parseBackup,stringifyBackup,getVerifiedBackupReceipt,getBackupSummary,type TallybookBackup}
  from '@/features/backup/backup';
import {decryptBackupText} from '@/features/backup/backupCrypto';
import {verifyRun8FileReceipt,type Run8BackupFileReceipt} from '@/features/backup/run8BackupFileReceipt.mjs';
import {stageSt24ShadowSnapshot,readSt24ShadowSnapshot}
  from './st24ShadowSnapshot.mjs';
import type {LedgerKeyringV1,UnlockedLedgerHandle}
  from './st24LedgerKeyring.mjs';

function checkCompany(backup:TallybookBackup,companyId:string) {
  if(backup.records.businessProfiles.length!==1||
     backup.records.businessProfiles[0]?.id!==companyId)
   throw Error('ST24: backup belongs to another company; shadow was not staged.');
}
/** This is intentionally not exposed on a button: migration activation awaits
 * owner device QA and written approval, separate from source development. */
export async function prepareSt24ShadowFromVerifiedFile(params:{
  selectedEncryptedFileText:string;
  backupPassphrase:string;
  receipt:Run8BackupFileReceipt;
  companyId:string;
  keyring:LedgerKeyringV1;
  ledgerPassphrase:string;
  handle:UnlockedLedgerHandle;
}):Promise<{snapshotId:string;state:'verified';bytes:number;chunks:number}> {
 const {selectedEncryptedFileText,backupPassphrase,receipt,companyId,keyring,ledgerPassphrase,handle}=params;
 if(!companyId||companyId!==getActiveBusinessProfileId()||keyring.companyId!==companyId)
   throw Error('ST24: active company or encryption keyring mismatch.');
 await requirePermission('staff',db,companyId);
 const original=await getVerifiedBackupReceipt(db);
 if(!original||original.companyId!==companyId||original.sha256!==receipt?.sha256||
    original.createdAt!==receipt?.createdAt)
   throw Error('ST24: a previously verified encrypted backup receipt is required.');
 await verifyRun8FileReceipt(receipt,selectedEncryptedFileText,companyId);
 const plain=await decryptBackupText(selectedEncryptedFileText,backupPassphrase);
 const backup=parseBackup(plain); // strict schema, company relationships, money validation
 checkCompany(backup,companyId);
 // Never produce an unchecked normalized JSON graph. The existing parser is
 // authoritative for accepting legacy backup and rejecting unknown fields.
 const canonical=parseBackup(stringifyBackup(backup));
 checkCompany(canonical,companyId);
 if(companyId!==getActiveBusinessProfileId())
   throw Error('ST24: company changed during backup validation.');
 await requirePermission('staff',db,companyId);
 const result=await stageSt24ShadowSnapshot({
  keyring,handle,ownerPassphrase:ledgerPassphrase,verifiedBackupJson:stringifyBackup(canonical)
 });
 if(companyId!==getActiveBusinessProfileId())
   throw Error('ST24: company changed while preparing shadow. The original ledger was not changed.');
 return {snapshotId:result.snapshotId,state:'verified',bytes:result.bytes,chunks:result.chunks};
}
/** Independent decrypted round-trip for a staged shadow only. Does not import. */
export async function inspectSt24ShadowSnapshot(params:{
 snapshotId:string;handle:UnlockedLedgerHandle;companyId:string
}) {
 const {state,text}=await readSt24ShadowSnapshot(params);
 const backup=parseBackup(text);
 checkCompany(backup,params.companyId);
 return {state,summary:getBackupSummary(backup)};
}
