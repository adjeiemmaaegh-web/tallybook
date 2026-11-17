/** Independent minor-unit oracle over real services and persisted IndexedDB rows. */
import Dexie from 'dexie';
import {afterEach,expect,it,vi} from 'vitest';
import {TallybookDB,initializeDatabase} from '@/db/TallybookDB';
import {setActiveBusinessProfileId} from '@/features/business/activeCompany';
import {saveBusinessProfile} from '@/features/business/businessProfile';
import {updateCompanyReturnPolicy} from '@/features/business/returnPolicySettings';
import {createStaff,unlockStaff,openShift,lockStaff} from '@/features/staff/staff';
import {createProduct} from '@/features/inventory/inventory';
import {createCustomer} from '@/features/customers/customers';
import {getCustomerBenefits} from '@/features/customers/customerBenefits';
import {recordWalletTransfer} from '@/features/customers/walletTransfers';
import {createSupplier,completePurchase} from '@/features/purchases/purchases';
import {recognizeUnpaidPurchase,recordSupplierSettlement,getSupplierPayables} from '@/features/purchases/supplierPayables.ts';
import {completeSale} from '@/features/sales/sales';
import {recordConfirmedCashPartialReturn} from '@/features/sales/cashPartialReturnPosting';
import {recordRepayment,getCustomerDebtSummary} from '@/features/credit/credit';
import {createExpense} from '@/features/expenses/expenses';
import {createBackup,parseBackup} from '@/features/backup/backup';
import {getFinancialSummary,financialCsv} from './financialIntelligence';

const databases:TallybookDB[]=[];
afterEach(async()=>{
  vi.restoreAllMocks();lockStaff('primary');setActiveBusinessProfileId('primary');
  for(const db of databases.splice(0)){db.close();await new Dexie(db.name).delete();}
});
it('conserves cash, receivables, prepaid liability, supplier debt, stock and FIFO through mixed business operations',async()=>{
  setActiveBusinessProfileId('primary');
  const db=new TallybookDB(`financial-journey-${crypto.randomUUID()}`);databases.push(db);
  await initializeDatabase(db);
  await saveBusinessProfile({name:'Conservation fixture',country:'Ghana',currency:'GHS',businessType:'Retail shop'},db);
  const owner=await createStaff('Oracle owner','owner','123456',db);
  await unlockStaff(owner.id,'123456',db);await openShift(0,db);
  await updateCompanyReturnPolicy({enabled:true,allowFullReversal:true,allowCashPartial:true,maxAgeDays:30},'Owner-approved synthetic refund terms',db);
  const customer=await createCustomer({name:'Oracle customer',phone:'+233000000001',email:'',address:'',notes:'',status:'active'},db);
  const product=await createProduct({name:'Oracle rice',categoryId:'uncategorized',sellingPrice:'10',costPrice:'4',initialStock:'10',lowStockThreshold:'1'},'GHS',db);
  const supplier=await createSupplier({name:'Oracle supplier',phone:'',email:'',address:'',notes:''},db);
  const today=new Date().toISOString().slice(0,10);
  const purchaseInput={supplierId:supplier.id,purchaseDate:today,submissionKey:'oracle-purchase',lines:[{productId:product.id,quantity:'5',unitCost:'6'}]};
  const purchase=await completePurchase(purchaseInput,'GHS',db);
  expect((await completePurchase(purchaseInput,'GHS',db)).id).toBe(purchase.id);
  await recognizeUnpaidPurchase(purchase.id,'oracle-recognition',db);
  const settlement={purchaseId:purchase.id,kind:'payment' as const,method:'cash' as const,amountMinor:1200,submissionKey:'oracle-settlement'};
  const paid=await recordSupplierSettlement(settlement,db);
  expect((await recordSupplierSettlement(settlement,db)).id).toBe(paid.id);
  const deposit={customerId:customer.id,kind:'deposit' as const,amountMinor:2000,method:'cash' as const,reference:'synthetic-cash',submissionKey:'oracle-wallet-deposit'};
  const deposited=await recordWalletTransfer(deposit,db);
  expect((await recordWalletTransfer(deposit,db)).id).toBe(deposited.id);
  const cashInput={lines:[{productId:product.id,quantity:2}],discount:'0',paymentMethod:'cash' as const,amountPaid:'20',currency:'GHS',submissionKey:'oracle-cash-sale'};
  const cash=await completeSale(cashInput,db);
  expect((await completeSale(cashInput,db)).sale.id).toBe(cash.sale.id);
  const credit=await completeSale({lines:[{productId:product.id,quantity:3}],customerId:customer.id,discount:'0',paymentMethod:'credit',amountPaid:'0',currency:'GHS',submissionKey:'oracle-credit-sale'},db);
  const repayment={customerId:customer.id,amount:'8',method:'cash' as const,currency:'GHS',submissionKey:'oracle-repayment',saleAllocations:[{saleId:credit.sale.id,amountMinor:800}]};
  const repaid=await recordRepayment(repayment,db);
  expect((await recordRepayment(repayment,db)).id).toBe(repaid.id);
  await completeSale({lines:[{productId:product.id,quantity:1}],customerId:customer.id,discount:'0',paymentMethod:'wallet',amountPaid:'10',currency:'GHS',submissionKey:'oracle-wallet-sale'},db);
  const returned={originalSaleId:cash.sale.id,submissionKey:'oracle-cash-return',lines:[{saleLineId:cash.lines[0].id,quantity:1}],cashWasRefunded:true as const,confirmedRefundMinor:1000,disposition:'restockable' as const};
  await recordConfirmedCashPartialReturn(returned,db);
  await recordWalletTransfer({...deposit,kind:'refund',amountMinor:300,submissionKey:'oracle-wallet-refund'},db);
  await createExpense({category:'rent',amount:'5',expenseDate:today,currency:'GHS',submissionKey:'oracle-rent'},db);

  // Oracle comes from the scenario, not any application reconciliation helper.
  expect((await db.products.get(product.id))?.stockQuantity).toBe(10+5-2-3-1+1);
  expect((await getCustomerDebtSummary(customer.id,'GHS',db)).outstandingMinor).toBe(3000-800);
  expect((await getCustomerBenefits(customer.id,db)).walletMinor).toBe(2000-1000-300);
  expect((await getSupplierPayables(db)).outstandingByCurrency).toEqual([{currency:'GHS',amountMinor:3000-1200}]);
  const summary=await getFinancialSummary('today',new Date(),undefined,undefined,db);
  expect(summary).toMatchObject({revenueMinor:2000+3000+1000-1000,
    collectionsMinor:2000+2000+800-1000-300,expensesMinor:500,
    netRecordedCashMovementMinor:3000,currentReceivablesMinor:2200,
    prepaidLiabilityMinor:700,cogsMinor:800+1200+400-400});
  expect(summary.inventoryValuation?.knownValueMinor).toBe(10*400+5*600-2000);
  // Supplier outflow is deliberately separate: no invented netting of potentially duplicate payouts.
  expect(summary.supplierReconciliation?.periodPaymentsByCurrency).toEqual([{currency:'GHS',amountMinor:1200}]);
  expect(financialCsv(summary)).toContain('"Net saved sales","5000"');
  const tables=[db.products,db.sales,db.saleLines,db.payments,db.receipts,db.repayments,db.walletTransfers,
    db.customerBenefits,db.supplierPayableEntries,db.cashPartialReturns,db.inventoryMovements,
    db.inventoryCostEvents,db.centralSaleEvents,db.centralOperationalEvents,db.staffAudits];
  const before=await Promise.all(tables.map(table=>table.toArray()));
  await expect(recordConfirmedCashPartialReturn(returned,db)).rejects.toThrow(/already recorded/);
  await expect(recordRepayment({...repayment,amount:'8.01'},db)).rejects.toThrow();
  await expect(recordWalletTransfer({...deposit,kind:'refund',amountMinor:701,submissionKey:'oracle-too-much-refund'},db)).rejects.toThrow(/insufficient/i);
  await expect(recordSupplierSettlement({...settlement,amountMinor:1801,submissionKey:'oracle-too-much-supplier'},db)).rejects.toThrow(/exceeds/i);
  const receiptFailure=vi.spyOn(db.receipts,'add').mockRejectedValueOnce(Error('simulated lost local receipt write'));
  await expect(completeSale({...cashInput,submissionKey:'oracle-receipt-failure'},db)).rejects.toThrow(/receipt write/);
  receiptFailure.mockRestore();
  expect(await Promise.all(tables.map(table=>table.toArray()))).toEqual(before);
  const backup=parseBackup(JSON.stringify(await createBackup(db)));
  expect(backup.records.sales).toHaveLength(3);
  expect(backup.records.cashPartialReturns).toHaveLength(1);
  expect(backup.records.supplierPayableEntries).toHaveLength(2);
});
