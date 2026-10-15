import Dexie from 'dexie';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {TallybookDB,initializeDatabase} from '@/db/TallybookDB';
import {saveBusinessProfile} from '@/features/business/businessProfile';
import {setActiveBusinessProfileId} from '@/features/business/activeCompany';
import {assistantLocalDB,saveStoredWorkflow} from '@/features/assistant/assistantLocalStore';
import {readAssistantRestoreSnapshot} from './restoreRecovery';
import {RESTORE_JOURNAL_KEY} from './restoreJournal.mjs';
import {createBackup,parseBackup,restoreBackup,stringifyBackup} from './backup';

const company='primary';let n=0;const names:string[]=[];
async function fixture(){
 setActiveBusinessProfileId(company);
 const d=new TallybookDB(`run8-compat-restore-${Date.now()}-${++n}`);
 names.push(d.name);await initializeDatabase(d);
 await saveBusinessProfile({name:'Saved ledger',country:'Ghana',
  currency:'GHS',businessType:'Retail shop',phone:'',email:'',address:''},d);
 return d;
}
afterEach(async()=>{
 setActiveBusinessProfileId(company);
 await assistantLocalDB.workflows.where('businessProfileId').equals(company).delete();
 await assistantLocalDB.aliases.where('businessProfileId').equals(company).delete();
 await assistantLocalDB.history.where('businessProfileId').equals(company).delete();
 for(const name of names.splice(0))await new Dexie(name).delete();
});
describe('Run 8 saved-data migration and transactional rollback',()=>{
 it('rejects any missing current schema table without deleting company data',async()=>{
  const d=await fixture();
  const backup=await createBackup(d);
  const raw=JSON.parse(stringifyBackup(backup));
  delete raw.records.staffMembers;
  expect(()=>parseBackup(JSON.stringify(raw)))
   .toThrow(/Required backup table missing: staffMembers/);
  expect((await d.businessProfiles.get(company))?.name).toBe('Saved ledger');
  expect(await d.appMeta.get(RESTORE_JOURNAL_KEY)).toBeUndefined();
  d.close();
 });
 it('rejects a newer unknown financial table rather than silently dropping it',async()=>{
  const d=await fixture();
  const raw=JSON.parse(stringifyBackup(await createBackup(d)));
  raw.records.unrecognizedMoneyLedger=[{id:'unrecognized'}];
  expect(()=>parseBackup(JSON.stringify(raw))).toThrow(/unrecognized tables/);
  expect(await d.businessProfiles.count()).toBe(1);
  d.close();
 });
 it('imports historical v9 empty tables without inventing modern receivables or staff',async()=>{
  const d=await fixture();
  const raw=JSON.parse(stringifyBackup(await createBackup(d)));
  raw.databaseSchemaVersion=9;
  for(const key of ['expenses','saleReversals','cashPartialReturns',
   'stockCountSessions','inventoryBatches','quotations',
   'customerBenefits','customerPolicies','walletTransfers',
   'staffMembers','staffShifts','staffAudits','commerceOrders',
   'inventoryCostEvents','supplierPayableEntries','syncConsents',
   'syncOutbox','syncConflicts','syncDevices','storeLocations',
   'storeAssignments','storeTransferRequests','storeStockObservations'])
   delete raw.records[key];
  const recovered=parseBackup(JSON.stringify(raw));
  expect(recovered.records.expenses).toEqual([]);
  expect(recovered.records.staffMembers).toEqual([]);
  expect(recovered.records.supplierPayableEntries).toEqual([]);
  expect(recovered.records.inventoryCostEvents).toEqual([]);
  expect(await d.businessProfiles.count()).toBe(1);
  d.close();
 });
 it('v27 cash-partial-return omission is compatible, v28 omission fails',async()=>{
  const d=await fixture();
  const raw=JSON.parse(stringifyBackup(await createBackup(d)));
  delete raw.records.cashPartialReturns;raw.databaseSchemaVersion=27;
  expect(parseBackup(JSON.stringify(raw)).records.cashPartialReturns).toEqual([]);
  raw.databaseSchemaVersion=28;
  expect(()=>parseBackup(JSON.stringify(raw)))
   .toThrow(/Required backup table missing: cashPartialReturns/);
  d.close();
 });
 it('unexpected ledger commit error restores assistant preimage and main ledger',async()=>{
  const d=await fixture();
  await saveStoredWorkflow({id:'run8-wf',businessProfileId:company,
   name:'Original workflow',description:'',commands:['inventory']});
  const backup=await createBackup(d);
  await saveStoredWorkflow({id:'run8-wf',businessProfileId:company,
   name:'Newer workflow',description:'',commands:['inventory']});
  await d.businessProfiles.update(company,{name:'Newer local business'});
  const before=await readAssistantRestoreSnapshot(company);
  const failure=vi.spyOn(d.businessProfiles,'put').mockRejectedValue(
   new Error('simulated ledger commit failure'));
  try{
   await expect(restoreBackup(backup,d)).rejects.toThrow(/simulated ledger commit failure/);
  }finally{failure.mockRestore();}
  expect((await d.businessProfiles.get(company))?.name).toBe('Newer local business');
  expect(await readAssistantRestoreSnapshot(company)).toEqual(before);
  expect(await d.appMeta.get(RESTORE_JOURNAL_KEY)).toBeUndefined();
  d.close();
 });
 it('corrupted backup rejected before any restore journal or row mutation',async()=>{
  const d=await fixture();
  const raw=JSON.parse(stringifyBackup(await createBackup(d)));
  raw.records.customers.push({id:'foreign-customer',businessProfileId:'different-business'});
  expect(()=>parseBackup(JSON.stringify(raw))).toThrow(/another company/);
  expect(await d.businessProfiles.get(company)).toBeDefined();
  expect(await d.appMeta.get(RESTORE_JOURNAL_KEY)).toBeUndefined();
  d.close();
 });
});
