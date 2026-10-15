import Dexie from 'dexie';
import {afterEach,describe,expect,it} from 'vitest';
import {TallybookDB,initializeDatabase} from '@/db/TallybookDB';
import {saveBusinessProfile} from '@/features/business/businessProfile';
import {setActiveBusinessProfileId} from '@/features/business/activeCompany';
import {assistantLocalDB} from '@/features/assistant/assistantLocalStore';
import {beginBackupRestoreJournal,beginCompanyClearJournal,
 readAssistantRestoreSnapshot,writeAssistantRestoreSnapshot,
 recoverPendingBackupRestore} from './restoreRecovery';
import {RESTORE_JOURNAL_KEY} from './restoreJournal.mjs';

const company='primary';
let number=0;
const names:string[]=[];
const older=()=>({workflows:[{id:'run7-crash-workflow',businessProfileId:company,
 name:'Original',description:'',commands:['inventory'],
 createdAt:'2026-10-16T00:00:00.000Z',updatedAt:'2026-10-16T00:00:00.000Z'}],
 aliases:[],history:[]});
const newer=()=>({workflows:[{...older().workflows[0],name:'Restored candidate'}],
 aliases:[],history:[]});
async function fixture(){
  setActiveBusinessProfileId(company);
  const database=new TallybookDB(`run7-crash-stage-${Date.now()}-${++number}`);
  names.push(database.name);
  await initializeDatabase(database);
  await saveBusinessProfile({name:'Crash recovery store',country:'Ghana',currency:'GHS',
   businessType:'Retail shop',phone:'',email:'',address:''},database);
  await writeAssistantRestoreSnapshot(company,older());
  return database;
}
afterEach(async()=>{
  setActiveBusinessProfileId(company);
  await assistantLocalDB.workflows.where('businessProfileId').equals(company).delete();
  await assistantLocalDB.aliases.where('businessProfileId').equals(company).delete();
  await assistantLocalDB.history.where('businessProfileId').equals(company).delete();
  for(const name of names.splice(0))await new Dexie(name).delete();
});
describe('V19 Run 7 real IndexedDB crash-boundary snapshots',()=>{
 it('before assistant write: startup clears marker without changing evidence',async()=>{
  const database=await fixture();
  await beginBackupRestoreJournal(company,older(),database,newer());
  database.close();
  const opened=new TallybookDB(database.name);
  try{
    expect(await recoverPendingBackupRestore(opened)).toBe(true);
    expect(await readAssistantRestoreSnapshot(company)).toEqual(older());
    expect(await opened.appMeta.get(RESTORE_JOURNAL_KEY)).toBeUndefined();
  }finally{opened.close();}
 });
 it('after assistant write: fresh tab reverts exact postimage to preimage',async()=>{
  const database=await fixture();
  await beginBackupRestoreJournal(company,older(),database,newer());
  await writeAssistantRestoreSnapshot(company,newer(),older());
  database.close();
  const opened=new TallybookDB(database.name);
  try{
    expect(await recoverPendingBackupRestore(opened)).toBe(true);
    expect(await readAssistantRestoreSnapshot(company)).toEqual(older());
    expect(await opened.appMeta.get(RESTORE_JOURNAL_KEY)).toBeUndefined();
    expect(await recoverPendingBackupRestore(opened)).toBe(false);
  }finally{opened.close();}
 });
 it('unrecognized intervening edit preserves sticky marker and assistant records',async()=>{
  const database=await fixture();
  await beginBackupRestoreJournal(company,older(),database,newer());
  await writeAssistantRestoreSnapshot(company,newer(),older());
  await assistantLocalDB.workflows.update('run7-crash-workflow',{name:'Concurrent different edit'});
  const edited=await readAssistantRestoreSnapshot(company);
  await expect(recoverPendingBackupRestore(database)).rejects.toThrow(/unexpected assistant edits/);
  expect(await database.appMeta.get(RESTORE_JOURNAL_KEY)).toBeDefined();
  expect(await readAssistantRestoreSnapshot(company)).toEqual(edited);
  database.close();
 });
 it('completed main-ledger commit leaves no recovery marker or reverse-apply',async()=>{
  const database=await fixture();
  await beginBackupRestoreJournal(company,older(),database,newer());
  await writeAssistantRestoreSnapshot(company,newer(),older());
  await database.transaction('rw',[database.appMeta,database.businessProfiles],async()=>{
    await database.businessProfiles.update(company,{name:'Committed replacement'});
    await database.appMeta.delete(RESTORE_JOURNAL_KEY);
  });
  expect(await recoverPendingBackupRestore(database)).toBe(false);
  expect((await database.businessProfiles.get(company))?.name).toBe('Committed replacement');
  expect(await readAssistantRestoreSnapshot(company)).toEqual(newer());
  database.close();
 });
 it('company clear crash before retail commit returns assistant records',async()=>{
  const database=await fixture();
  await beginCompanyClearJournal(company,older(),database);
  await writeAssistantRestoreSnapshot(company,{workflows:[],aliases:[],history:[]},older());
  database.close();
  const opened=new TallybookDB(database.name);
  try{
    expect(await recoverPendingBackupRestore(opened)).toBe(true);
    expect(await readAssistantRestoreSnapshot(company)).toEqual(older());
    expect(await opened.businessProfiles.get(company)).toBeDefined();
  }finally{opened.close();}
 });
});
