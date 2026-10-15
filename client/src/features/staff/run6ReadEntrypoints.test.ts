import Dexie from 'dexie';
import {webcrypto} from 'node:crypto';
import {afterEach,describe,expect,it} from 'vitest';
import {TallybookDB,initializeDatabase} from '@/db/TallybookDB';
import {saveBusinessProfile} from '@/features/business/businessProfile';
import {setActiveBusinessProfileId} from '@/features/business/activeCompany';
import {getSaleSnapshot} from '@/features/sales/sales';
import {getCustomerSnapshot} from '@/features/customers/customers';
import {getInventorySnapshot} from '@/features/inventory/inventory';
import {getPurchasesSnapshot} from '@/features/purchases/purchases';
import {listExpenses} from '@/features/expenses/expenses';
import {getReportsSnapshot,getDashboardSummary} from '@/features/reports/reports';
import {createStaff,unlockStaff,lockStaff} from './staff';

if(!globalThis.crypto?.subtle)
 Object.defineProperty(globalThis,'crypto',{configurable:true,value:webcrypto});
let count=0;const all:TallybookDB[]=[];
async function fixture(){
 const database=new TallybookDB(`run6-read-entrypoints-${Date.now()}-${++count}`);
 all.push(database);setActiveBusinessProfileId('primary');
 await initializeDatabase(database);
 await saveBusinessProfile({name:'Run6 Reads',country:'Ghana',currency:'GHS',
  businessType:'Retail shop',phone:'',email:'',address:''},database);
 return database;
}
afterEach(async()=>{
 lockStaff('primary');
 for(const database of all.splice(0)){const name=database.name;database.close();await new Dexie(name).delete();}
 setActiveBusinessProfileId('primary');
});
const privileged=(db:TallybookDB)=>[
 ()=>getPurchasesSnapshot(db),
 ()=>listExpenses(db),
 ()=>getReportsSnapshot('today',new Date(),db),
 ()=>getDashboardSummary(new Date(),db)
];
const cashierReads=(db:TallybookDB)=>[
 ()=>getSaleSnapshot(db),()=>getCustomerSnapshot(db),()=>getInventorySnapshot(db)
];
describe('V19 Run 6 service-read staff gates',()=>{
 it('keeps legacy offline bootstrap reads intact before any local staff owner exists',async()=>{
  const db=await fixture();
  for(const read of cashierReads(db))await expect(read()).resolves.toBeDefined();
 });
 it('denies locked staff session for sales, customer, inventory and finance reads',async()=>{
  const db=await fixture();await createStaff('Owner','owner','123456',db);
  for(const read of [...cashierReads(db),...privileged(db)])
   await expect(read()).rejects.toThrow(/locked|denied/);
 });
 it('cashier can read checkout data but not purchase or finance reporting',async()=>{
  const db=await fixture();
  const owner=await createStaff('Owner','owner','123456',db);
  await unlockStaff(owner.id,'123456',db);
  const cashier=await createStaff('Cashier','cashier','333333',db);
  lockStaff('primary');await unlockStaff(cashier.id,'333333',db);
  for(const read of cashierReads(db))await expect(read()).resolves.toBeDefined();
  for(const read of privileged(db))await expect(read()).rejects.toThrow(/locked|denied/);
 });
 it('authorized owner can retrieve both cashier and sensitive finance snapshots',async()=>{
  const db=await fixture();
  const owner=await createStaff('Owner','owner','123456',db);
  await unlockStaff(owner.id,'123456',db);
  for(const read of [...cashierReads(db),...privileged(db)])
   await expect(read()).resolves.toBeDefined();
 });
 it('cashier permission revoked while unlocked rejects subsequent snapshot',async()=>{
  const db=await fixture();
  const owner=await createStaff('Owner','owner','123456',db);
  await unlockStaff(owner.id,'123456',db);
  const cashier=await createStaff('Cashier','cashier','333333',db);
  lockStaff('primary');await unlockStaff(cashier.id,'333333',db);
  await db.staffMembers.update(cashier.id,{permissions:[]});
  await expect(getSaleSnapshot(db)).rejects.toThrow(/locked|denied/);
 });
});
