import Dexie from 'dexie';
import {afterEach,describe,expect,it} from 'vitest';
import {TallybookDB,initializeDatabase} from '@/db/TallybookDB';
import {saveBusinessProfile,createBusinessProfile} from '@/features/business/businessProfile';
import {setActiveBusinessProfileId} from '@/features/business/activeCompany';
import {createBackup,recordBackupExportedAt,getLastBackupAt,
  getLastBackupCompanyId} from './backup';
import {TWO_DATABASE_LOCK_NAME} from './crossTabDataLock.mjs';
import {RESTORE_JOURNAL_KEY} from './restoreJournal.mjs';

const opened:TallybookDB[]=[];
let counter=0;
async function fixture(){
  setActiveBusinessProfileId('primary');
  const database=new TallybookDB(`run7-two-db-export-${Date.now()}-${++counter}`);
  opened.push(database);
  await initializeDatabase(database);
  await saveBusinessProfile({name:'Main business',country:'Ghana',currency:'GHS',
    businessType:'Retail shop',phone:'',email:'',address:''},database);
  return database;
}
afterEach(async()=>{
  setActiveBusinessProfileId('primary');
  for(const database of opened.splice(0)){
    const name=database.name;database.close();await new Dexie(name).delete();
  }
});
describe('Run 7 consistent main plus assistant export',()=>{
  it('exports only when exclusive Web Lock is available',async()=>{
    const database=await fixture();
    let release!:()=>void;let entered!:()=>void;
    const hold=new Promise<void>(resolve=>{release=resolve;});
    const acquired=new Promise<void>(resolve=>{entered=resolve;});
    const locked=navigator.locks.request(TWO_DATABASE_LOCK_NAME,
      {mode:'shared',ifAvailable:true},async lock=>{
        expect(lock).not.toBeNull();entered();await hold;
      });
    await acquired;
    try{
      await expect(createBackup(database)).rejects.toThrow(/Another tab/);
      expect(await database.appMeta.get(RESTORE_JOURNAL_KEY)).toBeUndefined();
    }finally{release();await locked;}
    await expect(createBackup(database)).resolves.toMatchObject({
      kind:'tallybook-local-backup'
    });
  });
  it('never records another company as backed up after switching accounts',async()=>{
    const database=await fixture();
    const backup=await createBackup(database);
    const other=await createBusinessProfile({
      name:'Second business',country:'Ghana',currency:'GHS',
      businessType:'Retail shop',phone:'',email:'',address:''
    },database);
    setActiveBusinessProfileId(other.id);
    await expect(recordBackupExportedAt(backup.createdAt,database,'primary'))
      .rejects.toThrow(/Company or backup timestamp changed/);
    expect(await getLastBackupCompanyId(database)).toBeNull();
    expect(await getLastBackupAt(database)).toBeNull();
  });
  it('records the exact company captured in the successful exported file',async()=>{
    const database=await fixture();
    const backup=await createBackup(database);
    const companyId=backup.records.businessProfiles[0].id;
    await recordBackupExportedAt(backup.createdAt,database,companyId);
    expect(await getLastBackupCompanyId(database)).toBe(companyId);
    expect(await getLastBackupAt(database)).toBe(backup.createdAt);
  });
  it('does not set backup receipt while a recovery marker exists',async()=>{
    const database=await fixture();
    const backup=await createBackup(database);
    await database.appMeta.put({key:RESTORE_JOURNAL_KEY,value:'pending',updatedAt:backup.createdAt});
    await expect(recordBackupExportedAt(backup.createdAt,database,'primary'))
      .rejects.toThrow(/interrupted restore/);
    expect(await getLastBackupAt(database)).toBeNull();
  });
  it('does not permit export metadata writes behind a competing restore lock',async()=>{
    const database=await fixture();
    let release!:()=>void;let entered!:()=>void;
    const hold=new Promise<void>(resolve=>{release=resolve;});
    const acquired=new Promise<void>(resolve=>{entered=resolve;});
    const locked=navigator.locks.request(TWO_DATABASE_LOCK_NAME,
      {mode:'exclusive',ifAvailable:true},async lock=>{
        expect(lock).not.toBeNull();entered();await hold;
      });
    await acquired;
    try{
      await expect(recordBackupExportedAt(new Date().toISOString(),database,'primary'))
        .rejects.toThrow(/Another tab/);
      expect(await getLastBackupAt(database)).toBeNull();
    }finally{release();await locked;}
  });
});
