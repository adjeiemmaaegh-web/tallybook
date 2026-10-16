import Dexie from 'dexie';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {TallybookDB,initializeDatabase} from '@/db/TallybookDB';
import {saveBusinessProfile} from '@/features/business/businessProfile';
import {setActiveBusinessProfileId} from '@/features/business/activeCompany';
import {createProduct} from '@/features/inventory/inventory';
import {createSupplier,completePurchase} from '@/features/purchases/purchases';
import {recognizeUnpaidPurchase,recordSupplierSettlement} from '@/features/purchases/supplierPayables';
import {createExpense} from '@/features/expenses/expenses';
import {getFinancialSummary,financialCsv} from '@/features/reports/financialIntelligence';
import {createBackup,parseBackup,stringifyBackup} from '@/features/backup/backup';
import {completeSale} from '@/features/sales/sales';
import {calculateTax} from '@/features/sales/tax';
let counter=0;const dbs:TallybookDB[]=[];
async function fixture(){
 setActiveBusinessProfileId('primary');
 vi.useFakeTimers({toFake:['Date']});
 vi.setSystemTime(new Date('2026-10-16T09:00:00.000Z'));
 const db=new TallybookDB(`run12-supplier-tax-${Date.now()}-${++counter}`);
 dbs.push(db);await initializeDatabase(db);
 await saveBusinessProfile({name:'Run 12 Business',country:'Ghana',
  currency:'GHS',businessType:'Retail shop',phone:'',email:'',address:''},db);
 const product=await createProduct({name:'Run 12 Rice',categoryId:'uncategorized',
  sellingPrice:'20',costPrice:'10',initialStock:'4',lowStockThreshold:'0'},'GHS',db);
 const supplier=await createSupplier({name:'Run 12 Supplier'},db);
 const purchase=await completePurchase({supplierId:supplier.id,purchaseDate:'2026-10-16',
  lines:[{productId:product.id,quantity:'2',unitCost:'15'}],
  submissionKey:`run12-purchase-${counter}`},'GHS',db);
 return{db,product,supplier,purchase};
}
afterEach(async()=>{
 vi.restoreAllMocks();vi.useRealTimers();setActiveBusinessProfileId('primary');
 for(const db of dbs.splice(0)){const name=db.name;db.close();await new Dexie(name).delete();}
});
describe('Run 12 real saved IndexedDB supplier, expense and tax integration',()=>{
 it('recognition plus partial manual payment and supplier credit conserve liabilities',async()=>{
  const{db,purchase}=await fixture();
  const before=await getFinancialSummary('month',new Date(),undefined,undefined,db);
  expect(before.supplierCashAudit?.unknownSupplierLiabilityPurchases).toBe(1);
  await recognizeUnpaidPurchase(purchase.id,'run12-recognition-0001',db);
  await recordSupplierSettlement({purchaseId:purchase.id,kind:'payment',
   amountMinor:1000,method:'cash',submissionKey:'run12-supplier-pay-0001'},db);
  await recordSupplierSettlement({purchaseId:purchase.id,kind:'credit',
   amountMinor:500,submissionKey:'run12-supplier-credit-0001'},db);
  const after=await getFinancialSummary('month',new Date(),undefined,undefined,db);
  expect(after.supplierReconciliation?.outstandingByCurrency).toEqual([
   {currency:'GHS',amountMinor:1500}
  ]);
  expect(after.supplierCashAudit?.localSupplierPaymentsMinor).toBe(1000);
  expect(after.supplierCashAudit?.foreignCurrencySupplierPayments).toHaveLength(0);
 });
 it('supplier overpayment and reused key with different money fail atomically',async()=>{
  const{db,purchase}=await fixture();
  await recognizeUnpaidPurchase(purchase.id,'run12-recognition-0002',db);
  await expect(recordSupplierSettlement({purchaseId:purchase.id,kind:'payment',
   amountMinor:3001,method:'cash',submissionKey:'run12-supplier-over-0002'},db))
   .rejects.toThrow(/exceeds/);
  await recordSupplierSettlement({purchaseId:purchase.id,kind:'payment',
   amountMinor:1000,method:'bank',submissionKey:'run12-supplier-pay-0002'},db);
  await expect(recordSupplierSettlement({purchaseId:purchase.id,kind:'payment',
   amountMinor:2000,method:'bank',submissionKey:'run12-supplier-pay-0002'},db))
   .rejects.toThrow(/reused/);
  expect(await db.supplierPayableEntries.count()).toBe(2);
 });
 it('recorded expense remains separate from supplier payments in cash reconciliation',async()=>{
  const{db,purchase}=await fixture();
  await recognizeUnpaidPurchase(purchase.id,'run12-recognition-0003',db);
  await recordSupplierSettlement({purchaseId:purchase.id,kind:'payment',
   amountMinor:500,method:'cash',submissionKey:'run12-supplier-pay-0003'},db);
  await createExpense({category:'transport',amount:'2.00',
   expenseDate:'2026-10-16',currency:'GHS',
   submissionKey:'run12-expense-0003'},db);
  const x=await getFinancialSummary('month',new Date(),undefined,undefined,db);
  expect(x.expensesMinor).toBe(200);
  expect(x.supplierCashAudit?.localSupplierPaymentsMinor).toBe(500);
  expect(x.supplierCashAudit?.collectionsLessExpensesAndLocalSupplierPaymentsMinor).toBe(-700);
  expect(financialCsv(x)).toContain('Collections less expenses and local supplier payments');
 });
 it('wrong currency expense is rejected inside the company transaction',async()=>{
  const{db}=await fixture();
  await expect(createExpense({category:'rent',amount:'2.00',
   expenseDate:'2026-10-16',currency:'USD',
   submissionKey:'run12-expense-foreign-0004'},db))
   .rejects.toThrow(/currency does not match/);
  expect(await db.expenses.count()).toBe(0);
 });
 it('tax stays off by default and original sales have no invented statutory tax',async()=>{
  const{db,product}=await fixture();
  await completeSale({lines:[{productId:product.id,quantity:1}],
   discount:'0',paymentMethod:'cash',amountPaid:'20',currency:'GHS',
   submissionKey:'run12-sale-taxoff-0005'},db);
  const x=await getFinancialSummary('month',new Date(),undefined,undefined,db);
  expect(x.recordedTaxEvidence?.currentTaxConfigured).toBe(false);
  expect(x.recordedTaxEvidence?.unknownTaxSales).toBe(1);
  expect(x.recordedTaxEvidence?.statutoryTaxLiabilityVerified).toBe(false);
 });
 it('recorded tax snapshot is mathematically exact for inclusive and exclusive prices',()=>{
  const policy={enabled:true,registrationStatus:'registered' as const,
   label:'Owner chosen tax',rateBasisPoints:1000,priceMode:'exclusive' as const};
  expect(calculateTax(1000,policy)).toMatchObject({
   taxableMinor:1000,taxMinor:100,totalMinor:1100
  });
  expect(calculateTax(1100,{...policy,priceMode:'inclusive'})).toMatchObject({
   taxableMinor:1000,taxMinor:100,totalMinor:1100
  });
 });
 it('backup validates saved supplier recognition and exact tax evidence before restore',async()=>{
  const{db,purchase}=await fixture();
  await recognizeUnpaidPurchase(purchase.id,'run12-recognition-0007',db);
  const backup=await createBackup(db);
  expect(parseBackup(stringifyBackup(backup)).records.supplierPayableEntries).toHaveLength(1);
  const forged=structuredClone(backup);
  forged.records.supplierPayableEntries[0].amountMinor+=1;
  expect(()=>parseBackup(stringifyBackup(forged))).toThrow(/supplier/i);
 });
});
