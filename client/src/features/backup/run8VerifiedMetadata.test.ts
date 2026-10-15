import Dexie from 'dexie';
import {afterEach,describe,expect,it} from 'vitest';
import {TallybookDB,initializeDatabase} from '@/db/TallybookDB';
import {saveBusinessProfile} from '@/features/business/businessProfile';
import {clearCompanyData,setActiveBusinessProfileId}
 from '@/features/business/activeCompany';
import {createBackup,restoreBackup,getLastBackupAt,getLastBackupCompanyId,
 recordBackupExportedAt} from './backup';
import {RUN8_VERIFIED_RECEIPT_KEY} from './run8VerifiedReceipt.mjs';

let counter=0;const names:string[]=[];
const now='2026-10-16T01:00:00.000Z';
const sha='a'.repeat(64);
async function fixture(){
 setActiveBusinessProfileId('primary');
 const db=new TallybookDB(`run8-receipt-${Date.now()}-${++counter}`);
 names.push(db.name);await initializeDatabase(db);
 await saveBusinessProfile({name:'Receipt fixtures',country:'Ghana',currency:'GHS',
  businessType:'Retail shop',phone:'',email:'',address:''},db);
 return db;
}
afterEach(async()=>{
 setActiveBusinessProfileId('primary');
 for(const name of names.splice(0))await new Dexie(name).delete();
});
describe('Run 8 verified-file readiness migration',()=>{
 it('does not treat prior unverified export timestamps as verified-file proof',async()=>{
  const db=await fixture();
  await db.appMeta.put({key:'lastBackupAt',value:now,updatedAt:now});
  await db.appMeta.put({key:'lastBackupCompanyId',value:'primary',updatedAt:now});
  expect(await getLastBackupAt(db)).toBeNull();
  expect(await getLastBackupCompanyId(db)).toBeNull();
  db.close();
 });
 it('accepts only a receipt with matching company, timestamp and SHA fingerprint',async()=>{
  const db=await fixture();
  await recordBackupExportedAt(now,db,'primary',sha);
  expect(await getLastBackupCompanyId(db)).toBe('primary');
  expect(await getLastBackupAt(db)).toBe(now);
  expect(await db.appMeta.get(RUN8_VERIFIED_RECEIPT_KEY)).toBeDefined();
  db.close();
 });
 it('new unverified legacy export invalidates previously verified metadata',async()=>{
  const db=await fixture();
  await recordBackupExportedAt(now,db,'primary',sha);
  await recordBackupExportedAt(now,db,'primary');
  expect(await getLastBackupCompanyId(db)).toBeNull();
  expect(await db.appMeta.get(RUN8_VERIFIED_RECEIPT_KEY)).toBeUndefined();
  db.close();
 });
 it('corrupted verification receipt fails closed but preserves raw evidence',async()=>{
  const db=await fixture();
  await db.appMeta.put({key:RUN8_VERIFIED_RECEIPT_KEY,value:'corrupt',updatedAt:now});
  expect(await getLastBackupAt(db)).toBeNull();
  expect(await getLastBackupCompanyId(db)).toBeNull();
  expect(await db.appMeta.get(RUN8_VERIFIED_RECEIPT_KEY)).toBeDefined();
  db.close();
 });
 it('restoring a ledger revokes its prior verified-file readiness',async()=>{
  const db=await fixture();
  const backup=await createBackup(db);
  await recordBackupExportedAt(now,db,'primary',sha);
  await restoreBackup(backup,db);
  expect(await getLastBackupAt(db)).toBeNull();
  expect(await db.appMeta.get(RUN8_VERIFIED_RECEIPT_KEY)).toBeUndefined();
  db.close();
 });
 it('company deletion cannot leave a verified receipt for a recreated company ID',async()=>{
  const db=await fixture();
  await recordBackupExportedAt(now,db,'primary',sha);
  await clearCompanyData('primary',db);
  expect(await db.appMeta.get(RUN8_VERIFIED_RECEIPT_KEY)).toBeUndefined();
  expect(await db.businessProfiles.get('primary')).toBeUndefined();
  db.close();
 });
});
