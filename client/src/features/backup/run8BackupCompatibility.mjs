/** V19 Run 8: explicit, no-invention compatibility between historical
 * portable local-ledger snapshots and the current IndexedDB table schema.
 * A missing table may mean "did not exist yet" ONLY before its introduction.
 * Do not coerce unknown future tables or attributes into silent data loss.
 */
export const RUN8_BACKUP_TABLES=Object.freeze([
 'appMeta','businessProfiles','categories','products','inventoryMovements',
 'customers','sales','saleLines','payments','receipts','customerActivities',
 'repayments','mobileMoneyProviders','suppliers','purchases','purchaseLines',
 'supplierPayableEntries','expenses','saleReversals','cashPartialReturns',
 'stockCountSessions','inventoryBatches','quotations','customerBenefits',
 'customerPolicies','walletTransfers','staffMembers','staffShifts',
 'staffAudits','commerceOrders','inventoryCostEvents',
 'syncConsents','syncOutbox','syncConflicts','syncDevices',
 'storeLocations','storeAssignments','storeTransferRequests',
 'storeStockObservations'
]);
const later=Object.freeze({
 mobileMoneyProviders:8,
 suppliers:9,purchases:9,purchaseLines:9,
 expenses:10,saleReversals:12,
 stockCountSessions:14,inventoryBatches:14,
 quotations:15,customerBenefits:16,customerPolicies:16,
 walletTransfers:17,
 staffMembers:18,staffShifts:18,staffAudits:18,
 commerceOrders:25,inventoryCostEvents:26,
 supplierPayableEntries:27,cashPartialReturns:28,
 syncConsents:26,syncOutbox:26,syncConflicts:26,syncDevices:26,
 storeLocations:26,storeAssignments:26,
 storeTransferRequests:26,storeStockObservations:26
});
const deny=message=>{throw Error(message);};
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export function normalizeRun8BackupTables(records,schemaVersion,currentSchemaVersion){
 if(!Number.isSafeInteger(schemaVersion)||schemaVersion<1||
    !Number.isSafeInteger(currentSchemaVersion)||currentSchemaVersion<1)
   deny('Invalid portable backup schema version.');
 if(schemaVersion>currentSchemaVersion)
   deny('This backup needs a newer version of Tallybook before it can be restored.');
 if(!record(records))deny('Backup record section is invalid.');
 const actual=Object.keys(records);
 const keys=new Set(RUN8_BACKUP_TABLES);
 if(actual.some(key=>!keys.has(key)))deny('Backup contains unrecognized tables; a newer format may be required. No records imported.');
 const result=Object.create(null);
 for(const key of RUN8_BACKUP_TABLES){
  const value=records[key];
  if(value===undefined){
   if(schemaVersion>=(later[key]??1))
     deny('Required backup table missing: '+key+'. No records imported.');
   result[key]=[];
   continue;
  }
  if(!Array.isArray(value)||value.some(row=>!record(row)))
   deny('Invalid portable backup table: '+key+'. No records imported.');
  result[key]=value;
 }
 return result;
}
