import Dexie from 'dexie';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {TallybookDB,initializeDatabase} from '@/db/TallybookDB';
import {saveBusinessProfile} from '@/features/business/businessProfile';
import {setActiveBusinessProfileId} from '@/features/business/activeCompany';
import {createCustomer} from '@/features/customers/customers';
import {createProduct} from '@/features/inventory/inventory';
import {completeSale} from '@/features/sales/sales';
import {recordRepayment,getCustomerDebtSummary} from '@/features/credit/credit';
import {recordWalletTransfer} from '@/features/customers/walletTransfers';
import {executeLatestSaleReversal} from '@/features/assistant/reversals';
import {getFinancialSummary} from './financialIntelligence';
import {getReportsSnapshot} from './reports';
import {createBackup,parseBackup,stringifyBackup} from '@/features/backup/backup';

const dbs:TallybookDB[]=[];
let counter=0;
async function fixture(){
  setActiveBusinessProfileId('primary');
  const db=new TallybookDB(`run10-ledger-${Date.now()}-${++counter}`);
  dbs.push(db);await initializeDatabase(db);
  await saveBusinessProfile({name:'Run10 Ledger',country:'Ghana',
    currency:'GHS',businessType:'Retail shop',phone:'',email:'',address:''},db);
  const a=await createCustomer({name:'Debtor Alpha',phone:'0241101101',
    email:'',address:'',notes:'',status:'active'},db);
  const b=await createCustomer({name:'Debtor Beta',phone:'0241101102',
    email:'',address:'',notes:'',status:'active'},db);
  const product=await createProduct({name:'Run 10 test stock',categoryId:'uncategorized',
    sellingPrice:'20.00',costPrice:'1.00',initialStock:'12',
    lowStockThreshold:'1'},'GHS',db);
  return{db,a,b,product};
}
async function sale(db:TallybookDB,productId:string,customerId:string,method:'credit'|'wallet'='credit',amount='0'){
 return completeSale({lines:[{productId,quantity:1}],customerId,
  discount:'0',paymentMethod:method,amountPaid:amount,currency:'GHS',
  submissionKey:crypto.randomUUID()},db);
}
const summary=(db:TallybookDB)=>getFinancialSummary('month',new Date(),undefined,undefined,db);
afterEach(async()=>{
 vi.restoreAllMocks();setActiveBusinessProfileId('primary');
 for(const db of dbs.splice(0)){const name=db.name;db.close();await new Dexie(name).delete();}
});
describe('Run 10 saved-company receivables and prepaid cash reconciliation',()=>{
 it('matches per-customer credit summaries to management, dashboard and partial repayments',async()=>{
  const{db,a,b,product}=await fixture();
  await sale(db,product.id,a.id);await sale(db,product.id,b.id);
  await recordRepayment({customerId:a.id,amount:'5.00',method:'cash',
   currency:'GHS',submissionKey:'run10-unallocated-0001'},db);
  const finance=await summary(db),dashboard=await getReportsSnapshot('all',new Date(),db);
  expect(finance.currentReceivablesMinor).toBe(3500);
  expect(finance.receivableAudit).toMatchObject({
   outstandingMinor:3500,unallocatedRepaymentMinor:500,
   allocatedRepaymentMinor:0,indebtedCustomers:2
  });
  expect(dashboard.totals.outstandingDebtMinor).toBe(3500);
  expect((await getCustomerDebtSummary(a.id,'GHS',db)).outstandingMinor).toBe(1500);
 });
 it('links a partial repayment to its exact sale without changing another debtor',async()=>{
  const{db,a,b,product}=await fixture();
  const first=await sale(db,product.id,a.id);
  await sale(db,product.id,b.id);
  await recordRepayment({customerId:a.id,amount:'7.50',method:'cash',
   currency:'GHS',saleAllocations:[{saleId:first.sale.id,amountMinor:750}],
   submissionKey:'run10-linked-0001'},db);
  expect((await summary(db)).receivableAudit).toMatchObject({
   allocatedRepaymentMinor:750,unallocatedRepaymentMinor:0,outstandingMinor:3250
  });
 });
 it('rejects one customer overpayment even when another customer owes more',async()=>{
  const{db,a,b,product}=await fixture();
  await sale(db,product.id,a.id);await sale(db,product.id,b.id);
  await db.repayments.add({id:'injected-overpay',businessProfileId:'primary',
   customerId:a.id,amountMinor:2100,currency:'GHS',method:'cash',
   submissionKey:'injected-overpay-0001',createdAt:new Date().toISOString()});
  await expect(summary(db)).rejects.toThrow(/Customer receivable audit/);
  await expect(getReportsSnapshot('all',new Date(),db)).rejects.toThrow(/Customer receivable audit/);
  const backup=await createBackup(db);
  expect(()=>parseBackup(stringifyBackup(backup))).toThrow(/Customer receivable audit/);
 });
 it('blocks repayment allocated to a different customer in saved data',async()=>{
  const{db,a,b,product}=await fixture();
  await sale(db,product.id,a.id);
  const other=await sale(db,product.id,b.id);
  await db.repayments.add({id:'foreign-allocation',businessProfileId:'primary',
   customerId:a.id,amountMinor:400,currency:'GHS',method:'cash',
   submissionKey:'foreign-alloc-0001',createdAt:new Date().toISOString(),
   saleAllocations:[{saleId:other.sale.id,amountMinor:400}]});
  await expect(summary(db)).rejects.toThrow(/Customer receivable audit/);
 });
 it('refuses duplicated collection submission keys across customers',async()=>{
  const{db,a,b,product}=await fixture();
  await sale(db,product.id,a.id);await sale(db,product.id,b.id);
  const saved=await recordRepayment({customerId:a.id,amount:'1.00',method:'cash',
   currency:'GHS',submissionKey:'duplicate-key-1000'},db);
  await db.repayments.add({...saved,id:'replayed-b',customerId:b.id});
  await expect(summary(db)).rejects.toThrow(/repeated or malformed repayment submission key/);
 });
 it('new linked repayment remains idempotent and cannot be altered on retry',async()=>{
  const{db,a,product}=await fixture();
  const first=await sale(db,product.id,a.id);
  const input={customerId:a.id,amount:'5.00',method:'cash' as const,
   currency:'GHS',submissionKey:'run10-safe-retry-0001',
   saleAllocations:[{saleId:first.sale.id,amountMinor:500}]};
  const result=await recordRepayment(input,db);
  expect((await recordRepayment(input,db)).id).toBe(result.id);
  await expect(recordRepayment({...input,amount:'6.00'},db)).rejects.toThrow(/reused/);
  expect(await db.repayments.count()).toBe(1);
 });
 it('wallet deposit stays external cash and wallet checkout is not another cash receipt',async()=>{
  const{db,a,product}=await fixture();
  await recordWalletTransfer({customerId:a.id,kind:'deposit',amountMinor:2500,
   method:'cash',reference:'run10-cash-deposit',submissionKey:'run10-deposit-0001'},db);
  await sale(db,product.id,a.id,'wallet','20.00');
  const result=await summary(db);
  expect(result.prepaidCashAudit).toMatchObject({
   depositedMinor:2500,refundedMinor:0,spentMinor:2000,
   recordedNetExternalCashMinor:2500,netWalletConsumptionMinor:2000,
   liabilityMinor:500
  });
  expect(result.collectionsMinor).toBe(2500);
 });
 it('wallet sale reversal restores stored-value liability but not recorded external cash',async()=>{
  const{db,a,product}=await fixture();
  await recordWalletTransfer({customerId:a.id,kind:'deposit',amountMinor:2500,
   method:'cash',reference:'run10-reverse-deposit',submissionKey:'run10-deposit-0002'},db);
  await sale(db,product.id,a.id,'wallet','20.00');
  await executeLatestSaleReversal('GHS',db,'run10-wallet-sale-reversal');
  const result=await summary(db);
  expect(result.prepaidCashAudit).toMatchObject({
   liabilityMinor:2500,depositedMinor:2500,reversedWalletSpendMinor:2000,
   recordedNetExternalCashMinor:2500,netWalletConsumptionMinor:0
  });
  expect(result.collectionsMinor).toBe(2500);
 });
 it('rejects prepaid transfer with corrupted amount without reinterpreting benefits',async()=>{
  const{db,a}=await fixture();
  const transfer=await recordWalletTransfer({customerId:a.id,kind:'deposit',
   amountMinor:1000,method:'cash',reference:'run10-amount',
   submissionKey:'run10-deposit-0003'},db);
  await db.walletTransfers.update(transfer.id,{amountMinor:999});
  await expect(summary(db)).rejects.toThrow(/Prepaid wallet|Prepaid cash conservation/);
  expect(()=>parseBackup(stringifyBackup(await createBackup(db)))).toThrow();
 });
 it('rejects a foreign currency collection with no persisted overpayment',async()=>{
  const{db,a,product}=await fixture();
  await sale(db,product.id,a.id);
  await expect(recordRepayment({customerId:a.id,amount:'3.00',method:'cash',
   currency:'USD',submissionKey:'run10-fx-0001'},db))
   .rejects.toThrow(/different currency/);
  expect(await db.repayments.count()).toBe(0);
 });
 it('preserves already committed customer state when receipt write aborts',async()=>{
  const{db,a,product}=await fixture();
  await sale(db,product.id,a.id);
  const original=await db.repayments.count();
  vi.spyOn(db.repayments,'add').mockRejectedValueOnce(new Error('run10 storage failure'));
  await expect(recordRepayment({customerId:a.id,amount:'1.00',
   method:'cash',currency:'GHS',submissionKey:'run10-abort-0001'},db))
   .rejects.toThrow(/run10 storage failure/);
  expect(await db.repayments.count()).toBe(original);
  expect((await summary(db)).currentReceivablesMinor).toBe(2000);
 });
 it('legacy unknown currency cannot be assigned today's GHS merely to post money',async()=>{
  const{db,a,product}=await fixture();
  const first=await sale(db,product.id,a.id);
  await db.sales.update(first.sale.id,{currency:undefined});
  await expect(recordRepayment({customerId:a.id,amount:'1.00',
   method:'cash',currency:'GHS',submissionKey:'run10-legacy-fx-0001'},db))
   .rejects.toThrow(/no verified currency/);
  expect((await getCustomerDebtSummary(a.id,'GHS',db)).outstandingLabel)
   .toContain('historical currency unverified');
 });
});
