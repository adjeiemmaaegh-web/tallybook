import Dexie from 'dexie';
import { webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { TallybookDB, initializeDatabase } from '@/db/TallybookDB';
import { saveBusinessProfile, createBusinessProfile } from '@/features/business/businessProfile';
import { clearCompanyData } from '@/features/business/activeCompany';
import { createProduct } from '@/features/inventory/inventory';
import { completeSale } from '@/features/sales/sales';
import { setActiveBusinessProfileId } from '@/features/business/activeCompany';
import { approveCheckoutDiscount, calculateTrackedShiftCash, listStaff, changeStaffStatus, changeStaffRole, resetStaffPin, setStaffPermissions, closeShift, consumeCheckoutDiscountApproval, createStaff, currentStaffId, lockStaff, openShift, requirePermission, unlockStaff } from './staff';

if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis,'crypto',{configurable:true,value:webcrypto});
let counter=0;
const databases:TallybookDB[]=[];
function makeDB(){ const database=new TallybookDB(`tallybook-staff-test-${Date.now()}-${++counter}`); databases.push(database); return database; }
async function setup(database:TallybookDB){
  setActiveBusinessProfileId('primary');
  await initializeDatabase(database);
  await saveBusinessProfile({name:'Staff Shop',country:'Ghana',currency:'GHS',businessType:'Retail shop',phone:'',email:'',address:''},database);
}
afterEach(async()=>{lockStaff('primary');for(const d of databases.splice(0)){const name=d.name;d.close();await new Dexie(name).delete();}setActiveBusinessProfileId('primary');});

describe('Stage 6 local staff security',()=>{

  it('staff directory never exposes PIN-derived secrets or authenticator keys', async () => {
    const database=makeDB();await setup(database);
    const owner = await createStaff('Owner', 'owner', '123456', database);
    const directory = await listStaff(database);
    expect(directory).toHaveLength(1);
    expect(directory[0].id).toBe(owner.id);
    expect(directory[0].hasAuthenticator).toBe(false);
    for (const property of ['pinHash', 'salt', 'webAuthn']) {
      expect(Object.hasOwn(directory[0], property)).toBe(false);
    }
  });
  it('uses salted PIN verifiers and blocks unauthorized inventory actions',async()=>{
    const database=makeDB();await setup(database);
    const owner=await createStaff('Owner','owner','123456',database);
    expect(owner.pinHash).not.toBe('123456');expect(owner.salt).toMatch(/^[a-f0-9]{32}$/);
    await expect(unlockStaff(owner.id,'000000',database)).rejects.toThrow(/credentials/);
    await unlockStaff(owner.id,'123456',database);
    const cashier=await createStaff('Ada','cashier','654321',database);
    lockStaff('primary');await unlockStaff(cashier.id,'654321',database);
    expect((await requirePermission('sell',database))?.id).toBe(cashier.id);
    await expect(requirePermission('inventory',database)).rejects.toThrow(/permission denied/);
    await expect(createProduct({name:'Restricted product',sku:'',categoryId:'uncategorized',sellingPrice:'5',costPrice:'',initialStock:'2',lowStockThreshold:'1'},'GHS',database)).rejects.toThrow(/permission denied/);
    expect(await database.products.count()).toBe(0);
    lockStaff('primary');await expect(requirePermission('sell',database)).rejects.toThrow(/locked/);
  });

  it('requires a cashier shift, attributes sales, and reconciles tracked cash',async()=>{
    const database=makeDB();await setup(database);
    const product=await createProduct({name:'Rice',sku:'rice',categoryId:'uncategorized',sellingPrice:'3.00',costPrice:'',initialStock:'10',lowStockThreshold:'1'},'GHS',database);
    const owner=await createStaff('Owner','owner','123456',database);await unlockStaff(owner.id,'123456',database);
    const cashier=await createStaff('Ada','cashier','654321',database);
    lockStaff('primary');await unlockStaff(cashier.id,'654321',database);
    await expect(completeSale({lines:[{productId:product.id,quantity:1}],discount:'0',paymentMethod:'cash',amountPaid:'3',currency:'GHS',submissionKey:'shift-first-attempt'},database)).rejects.toThrow(/Open (a cashier|your staff) shift/);
    const shift=await openShift(1000,database);
    const sale=await completeSale({lines:[{productId:product.id,quantity:1}],discount:'0',paymentMethod:'cash',amountPaid:'3',currency:'GHS',submissionKey:'shift-success-001'},database);
    expect(sale.sale).toMatchObject({staffId:cashier.id,shiftId:shift.id});
    expect((await database.staffAudits.where('staffId').equals(cashier.id).toArray()).some(x=>x.action==='sale.completed')).toBe(true);
    const closed=await closeShift(shift.id,1290,database);
    expect(closed).toMatchObject({expectedCashMinor:1300,varianceMinor:-10,cashSalesMinor:300});
    await expect(closeShift(shift.id,1300,database)).rejects.toThrow(/Open shift not found/);
  });

  it('accepts a one-time supervisor approval only for its exact discount and intent',async()=>{
    const database=makeDB();await setup(database);
    const owner=await createStaff('Owner','owner','123456',database);await unlockStaff(owner.id,'123456',database);
    const supervisor=await createStaff('Manager','supervisor','222222',database);
    const cashier=await createStaff('Ada','cashier','654321',database);
    lockStaff('primary');await unlockStaff(cashier.id,'654321',database);
    // A supervisor can authorize a cashier discount only for an open shift.
    await openShift(0,database);
    await expect(approveCheckoutDiscount(supervisor.id,'000000','discount-key-001',100,500,database)).rejects.toThrow(/incorrect/);
    await approveCheckoutDiscount(supervisor.id,'222222','discount-key-001',100,500,database);
    expect(await consumeCheckoutDiscountApproval('discount-key-001',99,500,'primary',database)).toBeNull();
    expect(await consumeCheckoutDiscountApproval('discount-key-001',100,500,'primary',database)).toBe(supervisor.id);
    expect(await consumeCheckoutDiscountApproval('discount-key-001',100,500,'primary',database)).toBeNull();
    lockStaff('primary');expect(currentStaffId('primary')).toBeNull();
  });

  it('does not allow cashier authority to mutate role, PIN, permissions or disabled state', async()=>{
    const database=makeDB();await setup(database);
    const owner=await createStaff('Owner','owner','123456',database);await unlockStaff(owner.id,'123456',database);
    const cashier=await createStaff('Ada','cashier','654321',database);
    const before=await database.staffMembers.get(cashier.id);
    const auditCount=await database.staffAudits.count();
    lockStaff('primary');await unlockStaff(cashier.id,'654321',database);
    await expect(changeStaffStatus(cashier.id,true,database)).rejects.toThrow(/permission denied/);
    await expect(changeStaffRole(cashier.id,'supervisor',database)).rejects.toThrow(/permission denied/);
    await expect(setStaffPermissions(cashier.id,['sell'],database)).rejects.toThrow(/permission denied/);
    await expect(resetStaffPin(cashier.id,'222222',database)).rejects.toThrow(/permission denied/);
    expect(await database.staffMembers.get(cashier.id)).toEqual(before);
    expect(await database.staffAudits.count()).toBe(auditCount);
  });

  it('guards staff disabling and company-specific sessions',async()=>{
    const database=makeDB();await setup(database);
    const owner=await createStaff('Owner','owner','123456',database);await unlockStaff(owner.id,'123456',database);
    const cashier=await createStaff('Ada','cashier','654321',database);
    await changeStaffStatus(cashier.id,true,database);
    await expect(unlockStaff(cashier.id,'654321',database)).rejects.toThrow(/credentials/);
    await expect(changeStaffStatus(owner.id,true,database)).rejects.toThrow(/Cannot disable/);
    setActiveBusinessProfileId('different-company');
    expect(currentStaffId('primary')).toBeNull();
    setActiveBusinessProfileId('primary');
    await expect(requirePermission('sell',database)).rejects.toThrow(/locked/);
  });

  it('blocks cashier company administration and cross-company deletion',async()=>{
    const database=makeDB();await setup(database);
    const owner=await createStaff('Owner','owner','123456',database);
    await unlockStaff(owner.id,'123456',database);
    const other=await createBusinessProfile({name:'Other Shop',country:'Ghana',currency:'GHS',businessType:'Retail shop',phone:'',email:'',address:''},database);
    const cashier=await createStaff('Ada','cashier','654321',database);
    lockStaff('primary');await unlockStaff(cashier.id,'654321',database);
    const profile={name:'Restricted Edit',country:'Ghana' as const,currency:'GHS' as const,businessType:'Retail shop',phone:'',email:'',address:''};
    await expect(saveBusinessProfile(profile,database)).rejects.toThrow(/permission denied/);
    await expect(createBusinessProfile(profile,database)).rejects.toThrow(/permission denied/);
    await expect(clearCompanyData('primary',database)).rejects.toThrow(/permission denied/);
    await expect(clearCompanyData(other.id,database)).rejects.toThrow(/Switch to the company/);
    expect(await database.businessProfiles.get(other.id)).toBeDefined();
  });

  it('calculates tracked cash without counting wallet spending as new money received',()=>{
    const shift={id:'shift1',businessProfileId:'primary',staffId:'cashier',openedAt:'2026-10-09T10:00:00.000Z',openingFloatMinor:1000};
    const rows={sales:[{id:'sale1',businessProfileId:'primary',shiftId:'shift1',paymentMethod:'cash'}],payments:[{saleId:'sale1',method:'cash',amountMinor:500}],repayments:[{shiftId:'shift1',method:'cash',amountMinor:200}],transfers:[{shiftId:'shift1',method:'cash',kind:'deposit',amountMinor:100},{shiftId:'shift1',method:'cash',kind:'refund',amountMinor:50}],reversals:[{shiftId:'shift1',originalSaleId:'sale1',reversedReceivedMinor:-150}]};
    expect(calculateTrackedShiftCash(shift,rows)).toMatchObject({movementMinor:600,expectedCashMinor:1600});
    expect(()=>calculateTrackedShiftCash(shift,{...rows,payments:[...rows.payments,{saleId:'sale1',method:'cash',amountMinor:-50}]})).toThrow(/Invalid recorded/);
    expect(()=>calculateTrackedShiftCash(shift,{...rows,transfers:[{shiftId:'shift1',method:'cash',kind:'unknown',amountMinor:50}]})).toThrow(/Invalid recorded/);
    expect(()=>calculateTrackedShiftCash(shift,{...rows,reversals:[{shiftId:'shift1',originalSaleId:'sale1',reversedReceivedMinor:150}]})).toThrow(/Invalid recorded/);
    expect(()=>calculateTrackedShiftCash(shift,{...rows,sales:[...rows.sales,...rows.sales]})).toThrow(/Duplicate sale/);
  });
});
