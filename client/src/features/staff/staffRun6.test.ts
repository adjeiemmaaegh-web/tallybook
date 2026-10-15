import Dexie from 'dexie';
import {webcrypto} from 'node:crypto';
import {afterEach,describe,expect,it} from 'vitest';
import {TallybookDB,initializeDatabase} from '@/db/TallybookDB';
import {saveBusinessProfile} from '@/features/business/businessProfile';
import {setActiveBusinessProfileId} from '@/features/business/activeCompany';
import {createProduct} from '@/features/inventory/inventory';
import {completeSale} from '@/features/sales/sales';
import {createStaff,unlockStaff,lockStaff,currentStaffId,requirePermission,
  openShift,closeShift,approveCheckoutDiscount,
  consumeCheckoutDiscountApproval,changeStaffRole,resetStaffPin,
  setStaffPermissions} from './staff';
if(!globalThis.crypto?.subtle)
 Object.defineProperty(globalThis,'crypto',{configurable:true,value:webcrypto});
let counter=0;
const databases:TallybookDB[]=[];
function makeDB(){
 const database=new TallybookDB(`tallybook-run6-qa-${Date.now()}-${++counter}`);
 databases.push(database);return database;
}
async function setup(database:TallybookDB){
 setActiveBusinessProfileId('primary');
 await initializeDatabase(database);
 await saveBusinessProfile({
  name:'Run6 Test',country:'Ghana',currency:'GHS',
  businessType:'Retail shop',phone:'',email:'',address:''
 },database);
 const owner=await createStaff('Owner','owner','123456',database);
 await unlockStaff(owner.id,'123456',database);
 const supervisor=await createStaff('Supervisor','supervisor','222222',database);
 const cashier=await createStaff('Cashier','cashier','333333',database);
 return {owner,supervisor,cashier};
}
afterEach(async()=>{
 lockStaff('primary');
 for(const d of databases.splice(0)){const name=d.name;d.close();await new Dexie(name).delete();}
 setActiveBusinessProfileId('primary');
});
describe('V19 Run 6 stale credential and supervisor authorization',()=>{
 it('revokes cashier session if PIN verifier changes in storage',async()=>{
  const db=makeDB();const {cashier}=await setup(db);
  lockStaff('primary');await unlockStaff(cashier.id,'333333',db);
  await db.staffMembers.update(cashier.id,{pinHash:'a'.repeat(64)});
  await expect(requirePermission('sell',db)).rejects.toThrow(/locked|denied/);
  expect(currentStaffId('primary')).toBeNull();
 });
 it('revokes cashier session when role or permission overrides change',async()=>{
  const db=makeDB();const {cashier}=await setup(db);
  lockStaff('primary');await unlockStaff(cashier.id,'333333',db);
  await db.staffMembers.update(cashier.id,{role:'supervisor'});
  await expect(requirePermission('sell',db)).rejects.toThrow(/locked|denied/);
  await unlockStaff(cashier.id,'333333',db);
  await db.staffMembers.update(cashier.id,{permissions:[]});
  await expect(requirePermission('sell',db)).rejects.toThrow(/locked|denied/);
 });
 it('does not allow discount supervisor approval without a cashier shift',async()=>{
  const db=makeDB();const {cashier,supervisor}=await setup(db);
  lockStaff('primary');await unlockStaff(cashier.id,'333333',db);
  await expect(approveCheckoutDiscount(supervisor.id,'222222',
    'run6-checkout-key-001',100,1000,db)).rejects.toThrow(/denied/);
  expect(await consumeCheckoutDiscountApproval('run6-checkout-key-001',100,1000,'primary',db)).toBeNull();
 });
 it('persists an audit before publishing exact one-time approval',async()=>{
  const db=makeDB();const {cashier,supervisor}=await setup(db);
  lockStaff('primary');await unlockStaff(cashier.id,'333333',db);
  const shift=await openShift(0,db);
  await approveCheckoutDiscount(supervisor.id,'222222','run6-checkout-key-002',100,1000,db);
  const logs=await db.staffAudits.where('businessProfileId').equals('primary')
    .filter(x=>x.action==='discount.supervisor.approved').toArray();
  expect(logs).toHaveLength(1);
  expect(logs[0].staffId).toBe(supervisor.id);
  expect(logs[0].details).toContain(shift.id);
  expect(await consumeCheckoutDiscountApproval('run6-checkout-key-002',100,1000,'primary',db)).toBe(supervisor.id);
  expect(await consumeCheckoutDiscountApproval('run6-checkout-key-002',100,1000,'primary',db)).toBeNull();
 });
 it('role changes by owner make earlier cashier approvals unusable',async()=>{
  const db=makeDB();const {owner,cashier,supervisor}=await setup(db);
  lockStaff('primary');await unlockStaff(cashier.id,'333333',db);
  await openShift(0,db);
  await approveCheckoutDiscount(supervisor.id,'222222','run6-checkout-key-003',150,1000,db);
  lockStaff('primary');await unlockStaff(owner.id,'123456',db);
  await changeStaffRole(supervisor.id,'cashier',db);
  lockStaff('primary');await unlockStaff(cashier.id,'333333',db);
  expect(await consumeCheckoutDiscountApproval('run6-checkout-key-003',150,1000,'primary',db)).toBeNull();
 });
 it('rejects approval if the supervisor was disabled after verifying their PIN',async()=>{
  const db=makeDB();const {cashier,supervisor}=await setup(db);
  lockStaff('primary');await unlockStaff(cashier.id,'333333',db);
  await openShift(0,db);
  await approveCheckoutDiscount(supervisor.id,'222222','run6-stale-supervisor-01',120,1000,db);
  await db.staffMembers.update(supervisor.id,{disabledAt:new Date().toISOString()});
  expect(await consumeCheckoutDiscountApproval('run6-stale-supervisor-01',120,1000,'primary',db)).toBeNull();
 });
 it('rejects supervisor approval after PIN reset or revoked discount permission',async()=>{
  const db=makeDB();const {cashier,supervisor}=await setup(db);
  lockStaff('primary');await unlockStaff(cashier.id,'333333',db);
  await openShift(0,db);
  await approveCheckoutDiscount(supervisor.id,'222222','run6-stale-credential-01',120,1000,db);
  await db.staffMembers.update(supervisor.id,{pinHash:'a'.repeat(64)});
  expect(await consumeCheckoutDiscountApproval('run6-stale-credential-01',120,1000,'primary',db)).toBeNull();
  await db.staffMembers.update(supervisor.id,{pinHash:supervisor.pinHash});
  await approveCheckoutDiscount(supervisor.id,'222222','run6-stale-permission-01',120,1000,db);
  await db.staffMembers.update(supervisor.id,{permissions:['sell']});
  expect(await consumeCheckoutDiscountApproval('run6-stale-permission-01',120,1000,'primary',db)).toBeNull();
 });
 it('rejects approval if cashier shift closes before discount checkout',async()=>{
  const db=makeDB();const {cashier,supervisor}=await setup(db);
  lockStaff('primary');await unlockStaff(cashier.id,'333333',db);
  const shift=await openShift(0,db);
  await approveCheckoutDiscount(supervisor.id,'222222','run6-closed-shift-01',120,1000,db);
  await closeShift(shift.id,0,db);
  expect(await consumeCheckoutDiscountApproval('run6-closed-shift-01',120,1000,'primary',db)).toBeNull();
 });
 it('records approved cashier discount only when current supervisor remains authorized',async()=>{
  const db=makeDB();const {cashier,supervisor}=await setup(db);
  const product=await createProduct({name:'Stock item',sku:'run6-item',
    categoryId:'uncategorized',sellingPrice:'10',costPrice:'',
    initialStock:'4',lowStockThreshold:'1'},'GHS',db);
  lockStaff('primary');await unlockStaff(cashier.id,'333333',db);
  await openShift(0,db);
  const key='run6-checkout-post-01';
  await approveCheckoutDiscount(supervisor.id,'222222',key,100,1000,db);
  const result=await completeSale({lines:[{productId:product.id,quantity:1}],
    discount:'1',paymentMethod:'cash',amountPaid:'9',currency:'GHS',
    submissionKey:key},db);
  expect(result.sale.discountMinor).toBe(100);
  expect((await db.staffAudits.where('businessProfileId').equals('primary').toArray())
    .some(x=>x.action==='sale.completed'&&x.details.includes(supervisor.id))).toBe(true);
 });
 it('refuses posting a supervisor-discount sale after supervisor revocation',async()=>{
  const db=makeDB();const {cashier,supervisor}=await setup(db);
  const product=await createProduct({name:'Stock item',sku:'run6-item-b',
    categoryId:'uncategorized',sellingPrice:'10',costPrice:'',
    initialStock:'4',lowStockThreshold:'1'},'GHS',db);
  lockStaff('primary');await unlockStaff(cashier.id,'333333',db);
  await openShift(0,db);
  const key='run6-checkout-denied-01';
  await approveCheckoutDiscount(supervisor.id,'222222',key,100,1000,db);
  await db.staffMembers.update(supervisor.id,{permissions:['sell']});
  await expect(completeSale({lines:[{productId:product.id,quantity:1}],
    discount:'1',paymentMethod:'cash',amountPaid:'9',currency:'GHS',
    submissionKey:key},db)).rejects.toThrow(/supervisor must approve/i);
  expect(await db.sales.count()).toBe(0);
 });
 it('permission changes cannot elevate cashier to staff management',async()=>{
  const db=makeDB();const {cashier}=await setup(db);
  await expect(setStaffPermissions(cashier.id,['staff'],db)).rejects.toThrow();
  lockStaff('primary');await unlockStaff(cashier.id,'333333',db);
  await expect(requirePermission('staff',db)).rejects.toThrow(/denied/);
 });
 it('PIN reset requires fresh unlock even for previously active staff',async()=>{
  const db=makeDB();const {owner,cashier}=await setup(db);
  lockStaff('primary');await unlockStaff(cashier.id,'333333',db);
  lockStaff('primary');await unlockStaff(owner.id,'123456',db);
  await resetStaffPin(cashier.id,'444444',db);
  lockStaff('primary');await expect(unlockStaff(cashier.id,'333333',db)).rejects.toThrow();
  await unlockStaff(cashier.id,'444444',db);
  expect((await requirePermission('sell',db))?.id).toBe(cashier.id);
 });
 it('close-shift keeps financial variance and a single audit',async()=>{
  const db=makeDB();const {cashier}=await setup(db);
  lockStaff('primary');await unlockStaff(cashier.id,'333333',db);
  const shift=await openShift(500,db);
  const cash=await closeShift(shift.id,490,db);
  expect(cash.varianceMinor).toBe(-10);
  await expect(closeShift(shift.id,490,db)).rejects.toThrow(/Open shift not found/);
  const events=await db.staffAudits.where('businessProfileId').equals('primary')
    .filter(x=>x.action==='shift.closed').toArray();
  expect(events).toHaveLength(1);
 });
});
