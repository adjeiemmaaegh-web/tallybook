import Dexie from 'dexie';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {TallybookDB,initializeDatabase} from '@/db/TallybookDB';
import {setActiveBusinessProfileId} from '@/features/business/activeCompany';
import {saveBusinessProfile} from '@/features/business/businessProfile';
import {createProduct} from '@/features/inventory/inventory';
import {completeSale} from '@/features/sales/sales';
import {taxPolicyKey,type TaxPolicy} from '@/features/sales/tax';
import {createSupplier,completePurchase} from '@/features/purchases/purchases';
import {recognizeUnpaidPurchase,recordSupplierSettlement,getSupplierPayables}
 from '@/features/purchases/supplierPayables.ts';
import {createExpense} from '@/features/expenses/expenses';
import {getFinancialSummary,financialCsv} from './financialIntelligence';
import {createBackup,parseBackup,stringifyBackup} from '@/features/backup/backup';
import {createStaff,unlockStaff,openShift,lockStaff} from '@/features/staff/staff';

let serial=0;
const open:TallybookDB[]=[];
const tax:TaxPolicy={enabled:true,registrationStatus:'registered',
 registrationNumber:'TEST-ONLY',label:'Sample tax',rateBasisPoints:1250,
 priceMode:'exclusive'};
async function fixture(taxPolicy?:TaxPolicy){
 vi.useFakeTimers({toFake:['Date']});
 vi.setSystemTime(new Date('2026-10-16T10:00:00.000Z'));
 setActiveBusinessProfileId('primary');
 const database=new TallybookDB(`run12-finance-${++serial}-${crypto.randomUUID()}`);
 open.push(database);await initializeDatabase(database);
 await saveBusinessProfile({name:'Run 12 Test Retail',country:'Ghana',
  currency:'GHS',businessType:'Retail shop',phone:'',email:'',address:'',
  ...(taxPolicy?{taxPolicy}:{})},database);
 const owner=await createStaff('Run12 test owner','owner','123456',database);
 await unlockStaff(owner.id,'123456',database);
 await openShift(0,database);
 const product=await createProduct({name:'Run12 Rice',categoryId:'uncategorized',
  sellingPrice:'10',costPrice:'1',initialStock:'5',lowStockThreshold:'0'},'GHS',database);
 const supplier=await createSupplier({name:'Run12 Supplier'},database);
 return{database,product,supplier};
}
async function invoice(f:Awaited<ReturnType<typeof fixture>>){
 return completePurchase({supplierId:f.supplier.id,purchaseDate:'2026-10-16',
  lines:[{productId:f.product.id,quantity:'2',unitCost:'3'}],
  submissionKey:`run12-purchase-${++serial}`},'GHS',f.database);
}
async function sale(f:Awaited<ReturnType<typeof fixture>>,enabled=false){
 return completeSale({lines:[{productId:f.product.id,quantity:1}],
  discount:'2',paymentMethod:'cash',amountPaid:enabled?'9':'8',
  currency:'GHS',taxReviewKey:enabled?taxPolicyKey(tax):undefined,
  submissionKey:`run12-sale-${++serial}`},f.database);
}
const report=(db:TallybookDB)=>getFinancialSummary('month',new Date(),undefined,undefined,db);
afterEach(async()=>{
 lockStaff('primary');
 vi.useRealTimers();vi.restoreAllMocks();setActiveBusinessProfileId('primary');
 for(const database of open.splice(0)){const name=database.name;database.close();await new Dexie(name).delete();}
});
describe('Run12 actual IndexedDB supplier and original tax evidence',()=>{
 it('records and reconciles recognition, partial manual payment and noncash supplier credit',async()=>{
  const f=await fixture(),p=await invoice(f);
  expect((await getSupplierPayables(f.database)).unknownPurchases).toBe(1);
  await recognizeUnpaidPurchase(p.id,'run12-recognition-0001',f.database);
  const payment=await recordSupplierSettlement({
   purchaseId:p.id,kind:'payment',amountMinor:200,method:'bank',
   reference:'test bank 1',submissionKey:'run12-bank-payment-001'},f.database);
  const credit=await recordSupplierSettlement({
   purchaseId:p.id,kind:'credit',amountMinor:100,
   submissionKey:'run12-credit-note-001'},f.database);
  const s=await report(f.database);
  expect(s.supplierFinanceAudit).toMatchObject({unknownPurchases:0,
   recognizedPurchases:1,manuallyAttestedPayments:1,
   periodSupplierPaymentsInCompanyCurrencyMinor:200,
   supplierCreditsWithoutReferences:1,providerSettlementVerified:false});
  expect((await getSupplierPayables(f.database)).outstandingByCurrency).toEqual([
   {currency:'GHS',amountMinor:300}]);
  expect((await f.database.supplierPayableEntries.get(payment.id))?.kind).toBe('payment');
  expect((await f.database.supplierPayableEntries.get(credit.id))?.kind).toBe('credit');
  expect(financialCsv(s)).toContain('Manual supplier payments in company currency this period');
 });
 it('does not infer supplier payment when only a stock purchase exists',async()=>{
  const f=await fixture();await invoice(f);
  const s=await report(f.database);
  expect(s.supplierFinanceAudit).toMatchObject({unknownPurchases:1,recognizedPurchases:0,
   manuallyAttestedPayments:0});
  expect((await getSupplierPayables(f.database)).complete).toBe(false);
 });
 it('rejects replay of supplier payment submission key with a changed amount',async()=>{
  const f=await fixture(),p=await invoice(f);
  await recognizeUnpaidPurchase(p.id,'run12-recognition-0002',f.database);
  const first={purchaseId:p.id,kind:'payment' as const,method:'cash' as const,
   amountMinor:100,submissionKey:'run12-payment-idempotent-001'};
  const saved=await recordSupplierSettlement(first,f.database);
  expect((await recordSupplierSettlement(first,f.database)).id).toBe(saved.id);
  await expect(recordSupplierSettlement({...first,amountMinor:200},f.database))
   .rejects.toThrow(/reused/);
  expect(await f.database.supplierPayableEntries.count()).toBe(2);
 });
 it('rejects supplier overpayment before committing a new liability event',async()=>{
  const f=await fixture(),p=await invoice(f);
  await recognizeUnpaidPurchase(p.id,'run12-recognition-0003',f.database);
  await expect(recordSupplierSettlement({purchaseId:p.id,kind:'payment',
   method:'cash',amountMinor:601,submissionKey:'run12-overpay-0001'},f.database))
   .rejects.toThrow(/exceeds/);
  expect(await f.database.supplierPayableEntries.count()).toBe(1);
 });
 it('prevents settlement when original purchase supplier ID has been corrupted',async()=>{
  const f=await fixture(),p=await invoice(f);
  await recognizeUnpaidPurchase(p.id,'run12-recognition-0004',f.database);
  await f.database.purchases.update(p.id,{supplierId:'foreign-supplier'});
  await expect(recordSupplierSettlement({purchaseId:p.id,kind:'payment',
   method:'cash',amountMinor:100,submissionKey:'run12-foreign-0001'},f.database))
   .rejects.toThrow(/ownership|supplier/i);
  await expect(report(f.database)).rejects.toThrow(/supplier|Supplier/i);
 });
 it('rejects backdated supplier settlement before purchase creation in reporting and backup',async()=>{
  const f=await fixture(),p=await invoice(f);
  const recognized=await recognizeUnpaidPurchase(p.id,'run12-recognition-0005',f.database);
  await f.database.supplierPayableEntries.update(recognized.id,{
   createdAt:'2026-10-15T09:00:00.000Z'});
  await expect(report(f.database)).rejects.toThrow(/supplier|Supplier/i);
  const snapshot=await createBackup(f.database);
  expect(()=>parseBackup(stringifyBackup(snapshot))).toThrow(/supplier|Supplier/i);
 });
 it('keeps actual operating expenses separate from supplier payments',async()=>{
  const f=await fixture(),p=await invoice(f);
  await recognizeUnpaidPurchase(p.id,'run12-recognition-0006',f.database);
  await recordSupplierSettlement({purchaseId:p.id,kind:'payment',
   method:'cash',amountMinor:200,submissionKey:'run12-supplier-outflow-01'},f.database);
  await createExpense({category:'rent',amount:'5',expenseDate:'2026-10-15',
   currency:'GHS',submissionKey:'run12-operating-expense-01'},f.database);
  const s=await report(f.database);
  expect(s.expensesMinor).toBe(500);
  expect(s.supplierFinanceAudit?.periodSupplierPaymentsInCompanyCurrencyMinor).toBe(200);
  expect(s.netRecordedCashMovementMinor).toBe(-500);
  expect(s.supplierFinanceAudit?.potentialExpensePaymentOverlapUnresolved).toBe(true);
 });
 it('refuses cross-currency newly recorded expenses rather than silently exchanging them',async()=>{
  const f=await fixture();
  await expect(createExpense({category:'rent',amount:'3',expenseDate:'2026-10-15',
   currency:'USD',submissionKey:'run12-bad-fx-expense'},f.database))
   .rejects.toThrow(/currency differs/);
  expect(await f.database.expenses.count()).toBe(0);
 });
 it('old purchase submission key remains idempotent after the owner changes company currency',async()=>{
  const f=await fixture();
  const input={supplierId:f.supplier.id,purchaseDate:'2026-10-16',
    lines:[{productId:f.product.id,quantity:'2',unitCost:'3'}],
    submissionKey:'run12-saved-ghs-purchase-0001'};
  const original=await completePurchase(input,'GHS',f.database);
  await saveBusinessProfile({name:'Run 12 Test Retail',country:'Ghana',
    currency:'USD',businessType:'Retail shop',phone:'',email:'',address:''},f.database);
  expect((await completePurchase(input,'GHS',f.database)).id).toBe(original.id);
  await expect(completePurchase({...input,submissionKey:'run12-new-ghs-purchase-0002'},'GHS',f.database))
    .rejects.toThrow(/currency differs/);
  expect(await f.database.purchases.count()).toBe(1);
 });
 it('old recorded expense may be replayed unchanged but new foreign-currency expense is refused',async()=>{
  const f=await fixture();
  const input={category:'rent' as const,amount:'4',expenseDate:'2026-10-15',
    currency:'GHS',submissionKey:'run12-old-ghs-expense-0001'};
  const original=await createExpense(input,f.database);
  await saveBusinessProfile({name:'Run 12 Test Retail',country:'Ghana',
    currency:'USD',businessType:'Retail shop',phone:'',email:'',address:''},f.database);
  expect((await createExpense(input,f.database)).id).toBe(original.id);
  await expect(createExpense({...input,submissionKey:'run12-new-ghs-expense-0002'},f.database))
    .rejects.toThrow(/currency differs/);
  expect(await f.database.expenses.count()).toBe(1);
 });
 it('retains an original invoice with owner-configured registered exclusive tax evidence',async()=>{
  const f=await fixture(tax),saved=await sale(f,true);
  expect(saved.sale).toMatchObject({
   totalMinor:900,taxConfigurationAtSale:{mode:'on',policy:{rateBasisPoints:1250}},
   tax:{taxMinor:100,taxableMinor:800}});
  expect((await report(f.database)).taxEvidence).toMatchObject({
   configuredChargedSales:1,explicitNoTaxSales:0,legacyUnverifiedSales:0
  });
 });
 it("records explicit OFF for untaxed sales, rather than inferring today's status",async()=>{
  const f=await fixture(),saved=await sale(f);
  expect(saved.sale.taxConfigurationAtSale).toMatchObject({mode:'off'});
  expect(saved.sale.tax).toBeUndefined();
  expect((await report(f.database)).taxEvidence).toMatchObject({
   explicitNoTaxSales:1,configuredChargedSales:0
  });
 });
 it('later owner tax edits cannot silently rewrite an earlier invoice snapshot',async()=>{
  const f=await fixture(tax),saved=await sale(f,true);
  await saveBusinessProfile({name:'Run 12 Test Retail',country:'Ghana',
   currency:'GHS',businessType:'Retail shop',phone:'',email:'',address:'',
   taxPolicy:{...tax,rateBasisPoints:2000}},f.database);
  expect((await f.database.sales.get(saved.sale.id))?.taxConfigurationAtSale?.policy?.rateBasisPoints)
   .toBe(1250);
  expect((await report(f.database)).taxEvidence?.configuredChargedSales).toBe(1);
 });
 it('tampered saved tax-off configuration is rejected by report and backup',async()=>{
  const f=await fixture(tax),saved=await sale(f,true);
  await f.database.sales.update(saved.sale.id,{
   taxConfigurationAtSale:{mode:'off'}});
  await expect(report(f.database)).rejects.toThrow(/tax evidence/i);
  const file=await createBackup(f.database);
  await f.database.centralSaleEvents.update(`sale:${saved.sale.id}`,{
    payload:{...(await f.database.centralSaleEvents.get(`sale:${saved.sale.id}`))!.payload,
      sale:(await f.database.sales.get(saved.sale.id))!}});
  const fileWithMatchingEvent=await createBackup(f.database);
  expect(()=>parseBackup(stringifyBackup(file))).toThrow(/Central sale event/);
  expect(()=>parseBackup(stringifyBackup(fileWithMatchingEvent))).toThrow(/tax evidence/i);
 });
 it('unknown original tax policy on an old sale remains unverified rather than exempt',async()=>{
  const f=await fixture(),saved=await sale(f);
  await f.database.sales.update(saved.sale.id,{taxConfigurationAtSale:undefined});
  const s=await report(f.database);
  expect(s.taxEvidence).toMatchObject({legacyUnverifiedSales:1,
   explicitNoTaxSales:0,statutoryFilingVerified:false});
 });
 it('failed supplier posting cannot commit a partial settlement or staff receipt',async()=>{
  const f=await fixture(),p=await invoice(f);
  await recognizeUnpaidPurchase(p.id,'run12-recognition-0007',f.database);
  vi.spyOn(f.database.supplierPayableEntries,'add')
   .mockRejectedValueOnce(new Error('simulated storage fault'));
  await expect(recordSupplierSettlement({purchaseId:p.id,kind:'payment',
   method:'cash',amountMinor:100,submissionKey:'run12-failed-write-01'},f.database))
   .rejects.toThrow(/storage fault/);
  expect(await f.database.supplierPayableEntries.count()).toBe(1);
  expect((await getSupplierPayables(f.database)).outstandingByCurrency)
   .toEqual([{currency:'GHS',amountMinor:600}]);
 });
});
