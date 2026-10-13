import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TallybookDB, initializeDatabase } from '@/db/TallybookDB';
import { assistantLocalDB } from '@/features/assistant/assistantLocalStore';
import { beginBackupRestoreJournal, beginCompanyClearJournal, readAssistantRestoreSnapshot, writeAssistantRestoreSnapshot, recoverPendingBackupRestore } from './restoreRecovery';
import { RESTORE_JOURNAL_KEY } from './restoreJournal.mjs';
import { TWO_DATABASE_LOCK_NAME } from './crossTabDataLock.mjs';
import { saveStoredWorkflow } from '@/features/assistant/assistantLocalStore';
import { createBackup, restoreBackup, parseBackup, stringifyBackup } from './backup';
import { saveBusinessProfile } from '@/features/business/businessProfile';
import { clearCompanyData, setActiveBusinessProfileId } from '@/features/business/activeCompany';

const names:string[]=[];
const company='primary';
const workflow = (id:string, name:string) => ({id,businessProfileId:company,name,description:'',commands:['show inventory'],createdAt:'2026-10-11T00:00:00.000Z',updatedAt:'2026-10-11T00:00:00.000Z'});
const snapshot = (name:string) => ({workflows:[workflow('recover-wf',name)],aliases:[],history:[]});
async function fixture() {
  const name=`restore-recovery-${crypto.randomUUID()}`;names.push(name);
  const database=new TallybookDB(name);
  await initializeDatabase(database);
  await saveBusinessProfile({name:'Recovery fixture',country:'Ghana',currency:'GHS',businessType:'Retail shop',phone:'',email:'',address:''},database);
  await writeAssistantRestoreSnapshot(company,snapshot('original'));
  return database;
}
afterEach(async () => {
  setActiveBusinessProfileId(company);
  await assistantLocalDB.workflows.where('businessProfileId').equals(company).delete();
  await assistantLocalDB.workflows.where('businessProfileId').equals('other').delete();
  await assistantLocalDB.aliases.where('businessProfileId').equals(company).delete();
  await assistantLocalDB.history.where('businessProfileId').equals(company).delete();
  await Promise.all(names.splice(0).map(async name=>{const d=new Dexie(name);await d.delete();}));
});

describe('durable two-database restore preimage journal',()=>{
  it('refuses restore, clear, and ordinary assistant writes when another tab holds the exclusive recovery lock', async () => {
    const database=await fixture();
    const backup=await createBackup(database);
    let release!: () => void;
    let notifyEntered!: () => void;
    const barrier=new Promise<void>(resolve => { release=resolve; });
    const entered=new Promise<void>(resolve => { notifyEntered=resolve; });
    const holding=navigator.locks.request(TWO_DATABASE_LOCK_NAME,{mode:'exclusive',ifAvailable:true},async lock => {
      expect(lock).not.toBeNull();
      notifyEntered();
      await barrier;
    });
    await entered;
    try {
      await expect(recoverPendingBackupRestore(database)).rejects.toThrow(/another tab/i);
      await expect(restoreBackup(backup,database)).rejects.toThrow(/another tab/i);
      await expect(clearCompanyData(company,database)).rejects.toThrow(/another tab/i);
      await expect(saveStoredWorkflow({businessProfileId:company,name:'stale',description:'',commands:[]})).rejects.toThrow(/another tab/i);
      expect(await database.appMeta.get(RESTORE_JOURNAL_KEY)).toBeUndefined();
      expect(await readAssistantRestoreSnapshot(company)).toEqual(snapshot('original'));
    } finally {
      release(); await holding;
      database.close();
    }
  });

  it('rejects nonportable assistant preimages without recording a marker or changing existing records', async () => {
    const database = await fixture();
    const before = await readAssistantRestoreSnapshot(company);
    const malformed = {...before, workflows: before.workflows.map(row => ({...row, updatedAt: new Date('2026-10-11T01:00:00Z')}))};
    await expect(beginBackupRestoreJournal(company, malformed as never, database, snapshot('future')))
      .rejects.toThrow(/unsupported record fields/i);
    expect(await database.appMeta.get(RESTORE_JOURNAL_KEY)).toBeUndefined();
    await expect(writeAssistantRestoreSnapshot(company, malformed as never, before))
      .rejects.toThrow(/unsupported record fields/i);
    expect(await readAssistantRestoreSnapshot(company)).toEqual(before);
    database.close();
  });

  it('recovers a crash after assistant commit but before retail commit, repeatedly and after database reopening',async()=>{
    const database=await fixture();
    await beginBackupRestoreJournal(company,await readAssistantRestoreSnapshot(company),database,snapshot('uncommitted replacement'));
    await writeAssistantRestoreSnapshot(company,snapshot('uncommitted replacement'));
    database.close();
    const reopened=new TallybookDB(database.name);
    try {
      expect(await recoverPendingBackupRestore(reopened)).toBe(true);
      expect(await readAssistantRestoreSnapshot(company)).toEqual(snapshot('original'));
      expect(await reopened.appMeta.get(RESTORE_JOURNAL_KEY)).toBeUndefined();
      expect(await recoverPendingBackupRestore(reopened)).toBe(false);
    } finally {reopened.close();}
  });

  it('does not overwrite unexpected concurrent assistant writes during recovery', async () => {
    const database=await fixture();
    const before=await readAssistantRestoreSnapshot(company);
    await beginBackupRestoreJournal(company,before,database,snapshot('expected replacement'));
    // Simulates a separate tab writing a new workflow after journal capture.
    await assistantLocalDB.workflows.put(workflow('concurrent-edit','other tab'));
    const current=await readAssistantRestoreSnapshot(company);
    await expect(recoverPendingBackupRestore(database)).rejects.toThrow(/unexpected assistant edits/i);
    expect(await readAssistantRestoreSnapshot(company)).toEqual(current);
    expect(await database.appMeta.get(RESTORE_JOURNAL_KEY)).toBeDefined();
    // The owner must reconcile the journal, not silently discard this edit.
    database.close();
  });
  it('rejects stale before snapshots inside the assistant write transaction', async () => {
    const database=await fixture();
    const old=await readAssistantRestoreSnapshot(company);
    await assistantLocalDB.workflows.put(workflow('other-edit','intervened'));
    const expected=await readAssistantRestoreSnapshot(company);
    await expect(writeAssistantRestoreSnapshot(company,snapshot('replacement'),old)).rejects.toThrow(/changed after recovery snapshot/i);
    expect(await readAssistantRestoreSnapshot(company)).toEqual(expected);
    database.close();
  });
  it('releases an untouched journal without modifying its assistant preimage', async () => {
    const database=await fixture();
    const old=await readAssistantRestoreSnapshot(company);
    await beginBackupRestoreJournal(company,old,database,snapshot('future replacement'));
    expect(await recoverPendingBackupRestore(database)).toBe(true);
    expect(await readAssistantRestoreSnapshot(company)).toEqual(old);
    expect(await database.appMeta.get(RESTORE_JOURNAL_KEY)).toBeUndefined();
    database.close();
  });
  it('leaves an old-format interrupted marker untouched if unknown edits exist', async () => {
    const database=await fixture();
    const old=await readAssistantRestoreSnapshot(company);
    const raw=await beginBackupRestoreJournal(company,old,database);
    const parsed=JSON.parse(raw);
    delete parsed.after;
    await database.appMeta.put({key:RESTORE_JOURNAL_KEY,value:JSON.stringify(parsed),updatedAt:parsed.createdAt});
    await writeAssistantRestoreSnapshot(company,snapshot('unclassified older postimage'));
    await expect(recoverPendingBackupRestore(database)).rejects.toThrow(/unexpected assistant edits/i);
    expect(await readAssistantRestoreSnapshot(company)).toEqual(snapshot('unclassified older postimage'));
    expect(await database.appMeta.get(RESTORE_JOURNAL_KEY)).toBeDefined();
    database.close();
  });
  it('blocks a second restore, a backup export and company deletion until recovery',async()=>{
    const database=await fixture();
    const old=await readAssistantRestoreSnapshot(company);
    await beginBackupRestoreJournal(company,old,database);
    await expect(beginBackupRestoreJournal(company,old,database)).rejects.toThrow(/interrupted/i);
    await expect(createBackup(database)).rejects.toThrow(/interrupted/i);
    await expect(clearCompanyData(company,database)).rejects.toThrow(/interrupted/i);
    await recoverPendingBackupRestore(database);
    expect(await createBackup(database)).toHaveProperty('kind','tallybook-local-backup');
    database.close();
  });
  it('preserves an invalid journal without touching assistant records',async()=>{
    const database=await fixture();
    await database.appMeta.put({key:RESTORE_JOURNAL_KEY,value:'{"malformed":true}',updatedAt:new Date().toISOString()});
    await expect(recoverPendingBackupRestore(database)).rejects.toThrow(/journal/i);
    expect(await readAssistantRestoreSnapshot(company)).toEqual(snapshot('original'));
    expect(await database.appMeta.get(RESTORE_JOURNAL_KEY)).toBeDefined();
    database.close();
  });
  it('a successful normal restore commits without a journal and internal journals are rejected in backup files',async()=>{
    const database=await fixture();
    const backup=await createBackup(database);
    await writeAssistantRestoreSnapshot(company,snapshot('changed'));
    await restoreBackup(backup,database);
    expect(await readAssistantRestoreSnapshot(company)).toEqual(snapshot('original'));
    expect(await database.appMeta.get(RESTORE_JOURNAL_KEY)).toBeUndefined();
    const injected={...backup,records:{...backup.records,appMeta:[...backup.records.appMeta,{key:RESTORE_JOURNAL_KEY,value:'spoof',updatedAt:new Date().toISOString()}]}};
    expect(()=>parseBackup(stringifyBackup(injected as typeof backup))).toThrow(/unsafe or duplicated device metadata/i);
    database.close();
  });
});


describe('durable company clear across assistant and retail databases', () => {
  it('recovers assistant records after a simulated crash before the retail deletion', async () => {
    const database = await fixture();
    await beginCompanyClearJournal(company, await readAssistantRestoreSnapshot(company), database);
    await writeAssistantRestoreSnapshot(company, { workflows: [], aliases: [], history: [] });
    database.close();
    const reopened = new TallybookDB(database.name);
    try {
      expect(await recoverPendingBackupRestore(reopened)).toBe(true);
      expect(await readAssistantRestoreSnapshot(company)).toEqual(snapshot('original'));
      expect(await reopened.businessProfiles.get(company)).toBeDefined();
      expect(await reopened.appMeta.get(RESTORE_JOURNAL_KEY)).toBeUndefined();
      expect(await recoverPendingBackupRestore(reopened)).toBe(false);
    } finally { reopened.close(); }
  });
  it('clears only its company, its assistant data and main assistant audit, atomically committing no pending journal', async () => {
    const database = await fixture();
    const stamp='2026-10-11T00:00:00.000Z';
    await database.businessProfiles.add({id:'other',name:'Other',country:'Ghana',currency:'GHS',businessType:'Retail shop',createdAt:stamp,updatedAt:stamp});
    await assistantLocalDB.workflows.put({...workflow('other-workflow','preserved'),businessProfileId:'other'});
    await database.assistantAudit.add({id:'audit-owned',businessProfileId:company,createdAt:stamp,action:'sale',outcome:'saved',summary:'local',request:'sell',details:[]});
    await database.assistantAudit.add({id:'audit-other',businessProfileId:'other',createdAt:stamp,action:'sale',outcome:'saved',summary:'other',request:'sell',details:[]});
    await clearCompanyData(company,database);
    expect(await database.businessProfiles.get(company)).toBeUndefined();
    expect(await database.businessProfiles.get('other')).toBeDefined();
    expect(await readAssistantRestoreSnapshot(company)).toEqual({workflows:[],aliases:[],history:[]});
    expect((await assistantLocalDB.workflows.get('other-workflow'))?.businessProfileId).toBe('other');
    expect(await database.assistantAudit.get('audit-owned')).toBeUndefined();
    expect(await database.assistantAudit.get('audit-other')).toBeDefined();
    expect(await database.appMeta.get(RESTORE_JOURNAL_KEY)).toBeUndefined();
    expect(await recoverPendingBackupRestore(database)).toBe(false);
    database.close();
  });
  it('refuses a new clear when a prior clear was interrupted', async () => {
    const database=await fixture();
    await beginCompanyClearJournal(company, await readAssistantRestoreSnapshot(company), database);
    await expect(clearCompanyData(company,database)).rejects.toThrow(/interrupted/i);
    await expect(createBackup(database)).rejects.toThrow(/interrupted/i);
    expect(await readAssistantRestoreSnapshot(company)).toEqual(snapshot('original'));
    await recoverPendingBackupRestore(database);
    database.close();
  });
  it('if the retail delete fails, recovers the assistant preimage and preserves the ledger',async()=>{
    const database=await fixture();
    const blockedDelete=vi.spyOn(database.businessProfiles,'delete').mockRejectedValue(new Error('simulated retail write failure'));
    try {
      await expect(clearCompanyData(company,database)).rejects.toThrow(/simulated retail write failure/i);
    } finally { blockedDelete.mockRestore(); }
    expect(await database.businessProfiles.get(company)).toBeDefined();
    expect(await readAssistantRestoreSnapshot(company)).toEqual(snapshot('original'));
    expect(await database.businessProfiles.count()).toBeGreaterThan(0);
    expect(await database.appMeta.get(RESTORE_JOURNAL_KEY)).toBeUndefined();
    database.close();
  });
});
