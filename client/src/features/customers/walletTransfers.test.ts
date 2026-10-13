import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { TallybookDB, initializeDatabase } from '@/db/TallybookDB';
import { saveBusinessProfile } from '@/features/business/businessProfile';
import { createCustomer } from '@/features/customers/customers';
import { createProduct } from '@/features/inventory/inventory';
import { setCustomerPolicy, getCustomerBenefits } from './customerBenefits';
import { recordWalletTransfer } from './walletTransfers';
import { completeSale, getSaleSnapshot } from '@/features/sales/sales';
import { recoverSavedCheckout } from '@/features/sales/recoverSavedCheckout';

let i=0;
const names:string[]=[];
const dbs:TallybookDB[]=[];
async function fixture(){
 const db=new TallybookDB(`stage4-wallet-integration-${Date.now()}-${++i}`);dbs.push(db);names.push(db.name);
 await initializeDatabase(db);
 await saveBusinessProfile({name:'Stage4 Shop',country:'Ghana',currency:'GHS',businessType:'Retail shop',phone:'',email:'',address:''},db);
 const customer=await createCustomer({name:'Ama',phone:'0240000001',email:'',address:'',notes:'',status:'active'},db);
 const product=await createProduct({name:'Rice',sku:'',categoryId:'uncategorized',sellingPrice:'10.00',costPrice:'',initialStock:'10',lowStockThreshold:'1'},'GHS',db);
 return {db,customer,product};
}
afterEach(async()=>{for(const db of dbs.splice(0))db.close();await Promise.all(names.splice(0).map(name=>new Dexie(name).delete()));});
describe('Stage 4 wallet and loyalty financial safeguards',()=>{
 it('records prepaid funds once and refuses refund above the available balance',async()=>{
  const {db,customer}=await fixture();
  const input={customerId:customer.id,kind:'deposit' as const,amountMinor:2500,method:'cash' as const,reference:'cash-01',submissionKey:'deposit-stage4-001'};
  const transfer=await recordWalletTransfer(input,db);
  expect(transfer.currency).toBe("GHS");
  expect((await recordWalletTransfer(input,db)).id).toBe(transfer.id);
  expect(await db.walletTransfers.count()).toBe(1);
  expect((await getCustomerBenefits(customer.id,db)).walletMinor).toBe(2500);
  await db.businessProfiles.update(transfer.businessProfileId, {currency:'USD'});
  await expect(recordWalletTransfer({...input,amountMinor:100,reference:'changed',submissionKey:'another-deposit-001'},db)).rejects.toThrow(/unknown or different currency/);
  expect(await db.walletTransfers.count()).toBe(1);
  await expect(recordWalletTransfer({...input,kind:'refund',amountMinor:2600,reference:'refund-01',submissionKey:'refund-stage4-001'},db)).rejects.toThrow(/insufficient balance/i);
  expect(await db.walletTransfers.count()).toBe(1);
 });
 it('saves wallet-only checkout, points earning and redemption without inventing a cash payment',async()=>{
  const {db,customer,product}=await fixture();
  await recordWalletTransfer({customerId:customer.id,kind:'deposit',amountMinor:1000,method:'cash',reference:'cash-02',submissionKey:'deposit-stage4-002'},db);
  await setCustomerPolicy(customer.id,{loyaltySpendMinorPerPoint:100,loyaltyPointValueMinor:10},db);
  const key='wallet-checkout-stage4-001';
  const walletSale=await completeSale({lines:[{productId:product.id,quantity:1}],customerId:customer.id,discount:'0',paymentMethod:'wallet',amountPaid:'10.00',currency:'GHS',submissionKey:key},db);
  expect(walletSale.payment).toBeUndefined();
  expect(walletSale.sale.walletAppliedMinor).toBe(1000);
  expect(recoverSavedCheckout(await getSaleSnapshot(db),walletSale.sale.businessProfileId,key)?.sale.id).toBe(walletSale.sale.id);
  expect((await getCustomerBenefits(customer.id,db)).walletMinor).toBe(0);
  const cashSale=await completeSale({lines:[{productId:product.id,quantity:1}],customerId:customer.id,discount:'0',paymentMethod:'cash',amountPaid:'10.00',currency:'GHS'},db);
  expect((await getCustomerBenefits(customer.id,db)).points).toBe(10);
  const redemption=await completeSale({lines:[{productId:product.id,quantity:1}],customerId:customer.id,discount:'0',paymentMethod:'cash',amountPaid:'9.90',redeemPoints:1,currency:'GHS'},db);
  expect(redemption.sale.loyaltyRedeemedMinor).toBe(10);
  expect((await getCustomerBenefits(customer.id,db)).points).toBe(18);
  expect(cashSale.payment?.amountMinor).toBe(1000);
  expect(await db.payments.count()).toBe(2);
 });
});
