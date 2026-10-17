/** IndexedDB/client contract tests: NOT counted as passed unless Vitest is run. */
import Dexie from 'dexie';
import {afterEach,expect,it,vi} from 'vitest';
import {TallybookDB,initializeDatabase} from '@/db/TallybookDB';
import {setActiveBusinessProfileId} from '@/features/business/activeCompany';
import {saveBusinessProfile} from '@/features/business/businessProfile';
import {updateCompanyReturnPolicy} from '@/features/business/returnPolicySettings';
import {createProduct} from '@/features/inventory/inventory';
import {completeSale} from '@/features/sales/sales';
import {getCashReturnReview} from './cashReturnReview.ts';
import {createStaff,unlockStaff,lockStaff} from '@/features/staff/staff';
import {quoteReviewedCashReturn} from './cashReturnReview.mjs';
const opened:TallybookDB[]=[];
async function setup() {
  setActiveBusinessProfileId('primary');
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-01-02T10:00:00Z'));
  const database=new TallybookDB(`cash-review-${crypto.randomUUID()}`);opened.push(database);
  await initializeDatabase(database);
  await saveBusinessProfile({name:'Refund preview',country:'Ghana',currency:'GHS',businessType:'Retail'},database);
  await updateCompanyReturnPolicy({enabled:true,allowFullReversal:true,allowCashPartial:true,maxAgeDays:30},'Test fixture owner opt-in',database);
  const product=await createProduct({name:'Rice',categoryId:'uncategorized',sellingPrice:'10',costPrice:'1',initialStock:'3',lowStockThreshold:'0'},'GHS',database);
  const original=await completeSale({lines:[{productId:product.id,quantity:2}],discount:'0',paymentMethod:'cash',amountPaid:'20',currency:'GHS',submissionKey:'review-sale-001'},database);
  return {database,original,product};
}
afterEach(async()=>{lockStaff('primary');vi.useRealTimers();vi.restoreAllMocks();setActiveBusinessProfileId('primary');for(const database of opened.splice(0)){database.close();await new Dexie(database.name).delete();}});
it('reads saved receipt, payment and FIFO evidence without writing a refund',async()=>{
  const {database,original,product}=await setup();
  const before={returns:await database.cashPartialReturns.count(),movements:await database.inventoryMovements.count(),costs:await database.inventoryCostEvents.count()};
  const review=await getCashReturnReview(original.sale.id,database);
  expect(review.options).toHaveLength(1);
  expect(review.options[0].remainingQuantity).toBe(2);
  expect(quoteReviewedCashReturn(review,review.options[0].saleLineId,1).amountMinor).toBe(1000);
  expect(await database.cashPartialReturns.count()).toBe(before.returns);
  expect(await database.inventoryMovements.count()).toBe(before.movements);
  expect(await database.inventoryCostEvents.count()).toBe(before.costs);
  expect((await database.products.get(product.id))?.stockQuantity).toBe(1);
});
it('fails closed on active-company mismatch',async()=>{
  const {database,original}=await setup();
  setActiveBusinessProfileId('different-company');
  await expect(getCashReturnReview(original.sale.id,database)).rejects.toThrow(/active company|not available/i);
});
it('rejects a missing original receipt without writing compensating data',async()=>{
  const {database,original}=await setup();
  await database.receipts.where('saleId').equals(original.sale.id).delete();
  await expect(getCashReturnReview(original.sale.id,database)).rejects.toThrow(/receipt/i);
  expect(await database.cashPartialReturns.count()).toBe(0);
});

it('refuses to quote further returns when the earlier stock movement no longer matches its refund',async()=>{
  const {database,original}=await setup();
  const saved=await import('./cashPartialReturnPosting').then(({recordConfirmedCashPartialReturn})=>recordConfirmedCashPartialReturn({
    originalSaleId:original.sale.id,submissionKey:'preview-prior-refund-1',
    lines:[{saleLineId:original.lines[0].id,quantity:1}],
    confirmedRefundMinor:1000,cashWasRefunded:true,disposition:'restockable'
  },database));
  await database.inventoryCostEvents.update(saved.lines[0].costEventId,{sourceId:'tampered-source'});
  await expect(getCashReturnReview(original.sale.id,database)).rejects.toThrow(/stock movement|FIFO/i);
});

it('denies cashier-only access to private refund review and permits the unlocked owner',async()=>{
  const {database,original}=await setup();
  const owner=await createStaff('Fixture Owner','owner','123456',database);
  await unlockStaff(owner.id,'123456',database);
  const cashier=await createStaff('Fixture Cashier','cashier','654321',database);
  lockStaff('primary');
  await unlockStaff(cashier.id,'654321',database);
  await expect(getCashReturnReview(original.sale.id,database))
    .rejects.toThrow(/refund permission denied|access locked/i);
  expect(await database.cashPartialReturns.count()).toBe(0);
  await unlockStaff(owner.id,'123456',database);
  const ownerReview=await getCashReturnReview(original.sale.id,database);
  expect(ownerReview.options).toHaveLength(1);
});
