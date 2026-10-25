import Dexie from 'dexie';
import {afterEach,describe,expect,it} from 'vitest';
import {TallybookDB,initializeDatabase} from '@/db/TallybookDB';
import {saveBusinessProfile} from '@/features/business/businessProfile';
import {setActiveBusinessProfileId} from '@/features/business/activeCompany';
import {createProduct,adjustStock} from '@/features/inventory/inventory';
import {createCustomer} from '@/features/customers/customers';
import {createSupplier,completePurchase} from '@/features/purchases/purchases';
import {completeSale} from '@/features/sales/sales';
import {recordRepayment} from '@/features/credit/credit';
import {createExpense} from '@/features/expenses/expenses';
import {RESTORE_JOURNAL_KEY} from './restoreJournal.mjs';

let counter=0;const all:TallybookDB[]=[];
async function fixture(){
 setActiveBusinessProfileId('primary');
 const database=new TallybookDB(`run7-pending-retail-journal-${Date.now()}-${++counter}`);
 all.push(database);await initializeDatabase(database);
 await saveBusinessProfile({name:'Journal fixture',country:'Ghana',currency:'GHS',
  businessType:'Retail shop',phone:'',email:'',address:''},database);
 const product=await createProduct({name:'Product',sku:'run7-product',
  categoryId:'uncategorized',sellingPrice:'10',costPrice:'',
  initialStock:'10',lowStockThreshold:'1'},'GHS',database);
 const customer=await createCustomer({name:'Journal Buyer',phone:'0240000000',
  email:'',address:'',notes:'',status:'active'},database);
 const supplier=await createSupplier({name:'Journal Supplier',phone:'',
  email:'',address:'',notes:''},database);
 await database.appMeta.put({key:RESTORE_JOURNAL_KEY,
  value:'interrupted marker — preserve for recovery',
  updatedAt:new Date().toISOString()});
 return{database,product,customer,supplier};
}
afterEach(async()=>{
 setActiveBusinessProfileId('primary');
 for(const database of all.splice(0)){
  const name=database.name;database.close();await new Dexie(name).delete();
 }
});
describe('Run 7 durable recovery marker blocks unrelated retail mutations',()=>{
 it('rejects sale and preserves original stock, payments and receipts',async()=>{
  const{database,product}=await fixture();
  await expect(completeSale({lines:[{productId:product.id,quantity:1}],
    discount:'0',paymentMethod:'cash',amountPaid:'10',currency:'GHS',
    submissionKey:'run7-blocked-sale'},database))
    .rejects.toThrow(/requires recovery/);
  expect(await database.sales.count()).toBe(0);
  expect(await database.payments.count()).toBe(0);
  expect(await database.receipts.count()).toBe(0);
  expect((await database.products.get(product.id))?.stockQuantity).toBe(10);
 });
 it('rejects purchase without creating stock movement or supplier payable',async()=>{
  const{database,product,supplier}=await fixture();
  await expect(completePurchase({supplierId:supplier.id,
    purchaseDate:'2026-10-15',note:'Blocked',submissionKey:'run7-blocked-purchase',
    lines:[{productId:product.id,quantity:'2',unitCost:'3'}]},'GHS',database))
    .rejects.toThrow(/requires recovery/);
  expect(await database.purchases.count()).toBe(0);
  expect(await database.inventoryMovements.where('movementType').equals('purchase').count()).toBe(0);
 });
 it('rejects expense with no saved financial row or audit',async()=>{
  const{database}=await fixture();
  await expect(createExpense({category:'transport',amount:'2',
    expenseDate:'2026-10-15',note:'Blocked',currency:'GHS',
    submissionKey:'run7-blocked-expense'},database))
    .rejects.toThrow(/requires recovery/);
  expect(await database.expenses.count()).toBe(0);
 });
 it('blocks credit repayment prior to ledger posting',async()=>{
  const{database,customer}=await fixture();
  await expect(recordRepayment({customerId:customer.id,amount:'3',
    method:'cash',currency:'GHS',submissionKey:'run7-blocked-repay'},database))
    .rejects.toThrow(/requires recovery/);
  expect(await database.repayments.count()).toBe(0);
 });
 it('blocks independent stock adjustments during recovery',async()=>{
  const{database,product}=await fixture();
  await expect(adjustStock(product.id,{movementType:'increase',
    quantity:'2',note:'Blocked'},database))
    .rejects.toThrow(/requires recovery/);
  expect((await database.products.get(product.id))?.stockQuantity).toBe(10);
 });
 it('failed retail mutations do not consume or rewrite recovery evidence',async()=>{
  const{database,product}=await fixture();
  const before=await database.appMeta.get(RESTORE_JOURNAL_KEY);
  await expect(adjustStock(product.id,{movementType:'decrease',
    quantity:'1',note:'Blocked'},database))
    .rejects.toThrow(/requires recovery/);
  expect(await database.appMeta.get(RESTORE_JOURNAL_KEY)).toEqual(before);
 });
});
