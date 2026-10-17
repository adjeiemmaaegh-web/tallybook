import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { TallybookDB, initializeDatabase } from '@/db/TallybookDB';
import { saveBusinessProfile } from '@/features/business/businessProfile';
import {setActiveBusinessProfileId} from '@/features/business/activeCompany';
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
afterEach(async()=>{setActiveBusinessProfileId('primary');for(const db of dbs.splice(0))db.close();await Promise.all(names.splice(0).map(name=>new Dexie(name).delete()));});
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
  await db.businessProfiles.update(transfer.businessProfileId, {currency:'GHS'});
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
 it('permits matching retry keys in independent company wallets while denying a changed same-company retry',async()=>{
  const {db,customer}=await fixture();
  const key='company-wallet-shared-001';
  const primary=await recordWalletTransfer({
    customerId:customer.id,kind:'deposit',amountMinor:800,method:'cash',
    reference:'primary-cash',submissionKey:key
  },db);
  setActiveBusinessProfileId('second-company');
  await saveBusinessProfile({name:'Independent Shop',country:'Ghana',currency:'GHS',
    businessType:'Retail shop',phone:'',email:'',address:''},db);
  const customerTwo=await createCustomer({
    name:'Kofi',phone:'0240000002',email:'',address:'',notes:'',status:'active'
  },db);
  const second=await recordWalletTransfer({
    customerId:customerTwo.id,kind:'deposit',amountMinor:300,method:'cash',
    reference:'second-cash',submissionKey:key
  },db);
  expect(primary.businessProfileId).toBe('primary');
  expect(second.businessProfileId).toBe('second-company');
  expect(primary.id).not.toBe(second.id);
  expect((await db.walletTransfers.count())).toBe(2);
  expect((await recordWalletTransfer({
    customerId:customerTwo.id,kind:'deposit',amountMinor:300,method:'cash',
    reference:'second-cash',submissionKey:key
  },db)).id).toBe(second.id);
  await expect(recordWalletTransfer({
    customerId:customerTwo.id,kind:'deposit',amountMinor:301,method:'cash',
    reference:'changed-cash',submissionKey:key
  },db)).rejects.toThrow(/reused/);
  setActiveBusinessProfileId('primary');
  expect((await db.walletTransfers.where('[businessProfileId+submissionKey]')
    .equals(['primary',key]).first())?.id).toBe(primary.id);
  expect((await db.walletTransfers.count())).toBe(2);
 });

 it('upgrades pre-v34 wallet evidence without rewriting funds or dropping old unique keys',async()=>{
  const name=`stage22-wallet-migration-${Date.now()}-${++i}`;
  names.push(name);
  const old=new Dexie(name);
  old.version(33).stores({
    appMeta:'key, updatedAt',
    businessProfiles:'id, name, country, currency, businessType, updatedAt',
    walletTransfers:'id, businessProfileId, customerId, kind, createdAt, &submissionKey'
  });
  await old.open();
  const saved={id:'old-wallet-entry-001',businessProfileId:'primary',
    customerId:'old-customer-001',kind:'deposit',currency:'GHS',
    amountMinor:800,method:'cash',reference:'original-offline-cash',
    benefitEntryId:'old-benefit-001',submissionKey:'original-wallet-key-001',
    createdAt:'2026-10-10T12:00:00.000Z'};
  await old.table('walletTransfers').add(saved);
  old.close();
  const upgraded=new TallybookDB(name);dbs.push(upgraded);
  await upgraded.open();
  const restored=await upgraded.walletTransfers.get(saved.id);
  expect(restored).toMatchObject(saved);
  expect((await upgraded.walletTransfers.where('[businessProfileId+submissionKey]')
    .equals(['primary',saved.submissionKey]).count())).toBe(1);
  await upgraded.walletTransfers.add({
    ...saved,id:'other-business-wallet-001',businessProfileId:'second-company'
  });
  expect(await upgraded.walletTransfers.count()).toBe(2);
  await expect(upgraded.walletTransfers.add({
    ...saved,id:'duplicate-primary-wallet-001'
  })).rejects.toThrow();
  expect((await upgraded.walletTransfers.get(saved.id))?.amountMinor).toBe(800);
 });

});
