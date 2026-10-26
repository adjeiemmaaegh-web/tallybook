import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initializeDatabase, TallybookDB, DATABASE_SCHEMA_VERSION } from '@/db/TallybookDB';
import { createProduct } from '@/features/inventory/inventory';
import { createSupplier, completePurchase, archiveSupplier } from '@/features/purchases/purchases';
import { getSupplierPayables, recognizeUnpaidPurchase, recordSupplierSettlement } from '@/features/purchases/supplierPayables.ts';
import { saveBusinessProfile } from '@/features/business/businessProfile';
import { createBackup, parseBackup, restoreBackup } from '@/features/backup/backup';
import { getFinancialSummary } from '@/features/reports/financialIntelligence';
import { createStaff, unlockStaff, openShift, lockStaff } from '@/features/staff/staff';

const records: TallybookDB[] = [];
let sequence = 0;
async function setup() {
  const database = new TallybookDB(`tallybook-supplier-payables-${Date.now()}-${++sequence}`); records.push(database);
  await initializeDatabase(database);
  const product = await createProduct({ name:'Payable Fixture Rice',sku:'PAY-RICE',categoryId:'uncategorized',sellingPrice:'20',costPrice:'10',initialStock:'2',lowStockThreshold:'1' },'GHS',database);
  const supplier = await createSupplier({name:'Supplier for payables',phone:'',email:'',address:'',notes:''},database);
  const purchase = await completePurchase({ supplierId:supplier.id,purchaseDate:'2026-10-09',lines:[{productId:product.id,quantity:'2',unitCost:'15'}],submissionKey:`purchase-fixture-${sequence}` },'GHS',database);
  return { database, product, supplier, purchase };
}
afterEach(async()=>{lockStaff('primary');for(const database of records.splice(0)){const name=database.name;database.close();await new Dexie(name).delete();}});
describe('v27 explicitly recognized supplier payables',()=>{
  it('starts as unknown, then supports a partial manual payment and a credit',async()=>{
    const {database,purchase}=await setup();
    expect(purchase.currency).toBe('GHS');
    expect((await getSupplierPayables(database)).unknownPurchases).toBe(1);
    const recognized=await recognizeUnpaidPurchase(purchase.id,'recognize-once-001',database);
    expect(await recognizeUnpaidPurchase(purchase.id,'recognize-once-001',database)).toEqual(recognized);
    const payment=await recordSupplierSettlement({ purchaseId:purchase.id,kind:'payment',method:'mobile',amountMinor:1100,reference:'manual-ref',submissionKey:'pay-once-001' },database);
    expect(await recordSupplierSettlement({ purchaseId:purchase.id,kind:'payment',method:'mobile',amountMinor:1100,reference:'manual-ref',submissionKey:'pay-once-001' },database)).toEqual(payment);
    await recordSupplierSettlement({ purchaseId:purchase.id,kind:'credit',amountMinor:300,submissionKey:'supplier-credit-001' },database);
    expect((await database.centralOperationalEvents.toArray()).filter(event=>event.kind.startsWith('supplier.')).map(event=>event.kind).sort()).toEqual(['supplier.credit_recorded','supplier.liability_recognized','supplier.payment_recorded']);
    const result=await getSupplierPayables(database);
    expect(result.unknownPurchases).toBe(0);expect(result.outstandingByCurrency).toEqual([{currency:'GHS',amountMinor:1600}]);
    expect(result.results[0]).toMatchObject({ paidMinor:1100,creditedMinor:300,outstandingMinor:1600 });
  });
  it('rolls back supplier recognition when its operational event fails',async()=>{
    const {database,purchase}=await setup();
    const add=vi.spyOn(database.centralOperationalEvents,'add').mockRejectedValueOnce(new Error('event write failed'));
    await expect(recognizeUnpaidPurchase(purchase.id,'recognition-event-rollback',database)).rejects.toThrow('event write failed');
    add.mockRestore();
    expect(await database.supplierPayableEntries.count()).toBe(0);
  });
  it('rolls back a supplier payment when its operational event fails',async()=>{
    const {database,purchase}=await setup();
    await recognizeUnpaidPurchase(purchase.id,'recognition-before-event-failure',database);
    const add=vi.spyOn(database.centralOperationalEvents,'add').mockRejectedValueOnce(new Error('event write failed'));
    await expect(recordSupplierSettlement({purchaseId:purchase.id,kind:'payment',method:'cash',amountMinor:100,submissionKey:'payment-event-rollback'},database)).rejects.toThrow('event write failed');
    add.mockRestore();
    expect((await database.supplierPayableEntries.toArray()).map(row=>row.kind)).toEqual(['recognition']);
  });
  it('rejects overpayment and changed duplicate keys without any ledger changes',async()=>{
    const {database,purchase}=await setup();
    await recognizeUnpaidPurchase(purchase.id,'recognize-once-002',database);
    await expect(recordSupplierSettlement({purchaseId:purchase.id,kind:'payment',method:'cash',amountMinor:3001,submissionKey:'over-payment-001'},database)).rejects.toThrow(/exceeds/);
    await recordSupplierSettlement({purchaseId:purchase.id,kind:'payment',method:'cash',amountMinor:1200,submissionKey:'settlement-retry-002'},database);
    await expect(recordSupplierSettlement({purchaseId:purchase.id,kind:'payment',method:'cash',amountMinor:1000,submissionKey:'settlement-retry-002'},database)).rejects.toThrow(/reused/);
    expect(await database.supplierPayableEntries.count()).toBe(2);
  });
  it('scopes submission retries to the company compound index',async()=>{
    const {database,purchase}=await setup();
    const key='company-scoped-recognition';
    await database.supplierPayableEntries.add({id:'other-company-entry',businessProfileId:'other-company',supplierId:'other-supplier',purchaseId:'other-purchase',currency:'GHS',kind:'recognition',amountMinor:3000,submissionKey:key,createdAt:new Date().toISOString()});
    const recognized=await recognizeUnpaidPurchase(purchase.id,key,database);
    expect(recognized.businessProfileId).toBe('primary');
    expect(await recognizeUnpaidPurchase(purchase.id,key,database)).toEqual(recognized);
    expect(await database.supplierPayableEntries.count()).toBe(2);
  });
  it('rejects recognition and settlements on foreign purchase IDs',async()=>{
    const {database}=await setup();
    await expect(recognizeUnpaidPurchase('foreign-purchase','foreign-recognition-001',database)).rejects.toThrow(/foreign|missing/);
    await expect(recordSupplierSettlement({purchaseId:'foreign-purchase',kind:'payment',method:'cash',amountMinor:1,submissionKey:'foreign-payment-001'},database)).rejects.toThrow(/ownership|reconciliation/);
    expect(await database.supplierPayableEntries.count()).toBe(0);
  });
  it('preserves unknown status when a legacy receipt lacks currency evidence',async()=>{
    const {database,purchase}=await setup(); const name=database.name; database.close();
    const oldPurchase={...purchase,currency:undefined};
    // Same data shape as a historical stock receipt whose currency is not evidenced.
    const current=new TallybookDB(name);records.push(current);
    await current.purchases.put(oldPurchase);
    expect(current.verno).toBe(DATABASE_SCHEMA_VERSION);
    await expect(recognizeUnpaidPurchase(purchase.id,'legacy-recognition-001',current)).rejects.toThrow(/currency/);
    expect((await getSupplierPayables(current)).unknownPurchases).toBe(1);
  });
  it('round-trips recognized supplier payments through backup without double counting cash', async()=>{
    const {database,purchase}=await setup();
    await saveBusinessProfile({name:'Payable test shop',country:'Ghana',currency:'GHS',businessType:'Retail shop',phone:'',email:'',address:''},database);
    const owner=await createStaff('Payable backup owner','owner','123456',database);
    await unlockStaff(owner.id,'123456',database);
    await openShift(0,database);
    await recognizeUnpaidPurchase(purchase.id,'recognize-backup-001',database);
    const payment=await recordSupplierSettlement({purchaseId:purchase.id,kind:'payment',method:'cash',amountMinor:500,reference:'cash book 14',submissionKey:'payment-backup-001'},database);
    const summary=await getFinancialSummary('year',new Date(),undefined,undefined,database);
    expect(summary.supplierReconciliation?.periodPaymentsByCurrency).toEqual([{currency:'GHS',amountMinor:500}]);
    expect(summary.collectionsMinor).toBe(0);
    expect(summary.expensesMinor).toBe(0);
    expect(summary.netRecordedCashMovementMinor).toBe(0);
    const backup=parseBackup(JSON.stringify(await createBackup(database)));
    expect(backup.records.supplierPayableEntries).toContainEqual(payment);
    const altered=structuredClone(backup);
    altered.records.supplierPayableEntries.find(entry=>entry.id===payment.id)!.currency='USD';
    const paymentEvent=altered.records.centralOperationalEvents.find(event=>event.kind==='supplier.payment_recorded'&&event.entityId===payment.id);
    if(!paymentEvent || !paymentEvent.kind.startsWith('supplier.'))throw new Error('Missing supplier event fixture.');
    (paymentEvent as import('@/features/sync/centralOperationalEvent').CentralSupplierEntryEvent).payload.entry.currency='USD';
    expect(()=>parseBackup(JSON.stringify(altered))).toThrow(/supplier|Central supplier event/i);
    await database.supplierPayableEntries.clear();
    await restoreBackup(backup,database);
    await unlockStaff(owner.id,'123456',database);
    expect(await database.supplierPayableEntries.toArray()).toEqual(backup.records.supplierPayableEntries);
    expect((await getSupplierPayables(database)).outstandingByCurrency).toEqual([{currency:'GHS',amountMinor:2500}]);
  });
});

it('prevents supplier archival until all purchase liabilities have explicit recognition and zero outstanding',async()=>{
  const {database,supplier,purchase}=await setup();
  const before=await database.suppliers.get(supplier.id);
  await expect(archiveSupplier(supplier.id,database)).rejects.toThrow(/unpaid or unverified/);
  expect((await database.suppliers.get(supplier.id))?.archivedAt).toBeUndefined();
  await recognizeUnpaidPurchase(purchase.id,'archive-recognition-001',database);
  await expect(archiveSupplier(supplier.id,database)).rejects.toThrow(/unpaid or unverified/);
  expect(await database.supplierPayableEntries.count()).toBe(1);
  await recordSupplierSettlement({
    purchaseId:purchase.id,kind:'payment',method:'cash',amountMinor:purchase.totalCostMinor,
    submissionKey:'archive-settlement-001'
  },database);
  const archived=await archiveSupplier(supplier.id,database);
  expect(archived.archivedAt).toBeTruthy();
  expect(archived.createdAt).toBe(before?.createdAt);
  expect((await getSupplierPayables(database)).outstandingByCurrency)
    .toEqual([{currency:'GHS',amountMinor:0}].filter(row=>row.amountMinor!==0));
  await expect(archiveSupplier(supplier.id,database)).rejects.toThrow(/already archived/);
});
