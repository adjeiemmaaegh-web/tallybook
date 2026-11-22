import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TallybookDB, initializeDatabase } from '@/db/TallybookDB';
import { createCustomer } from '@/features/customers/customers';
import { createQuotation, setQuotationStatus, convertQuotationToSale } from './quotations';
import {saveBusinessProfile} from '@/features/business/businessProfile';
import {createStaff,unlockStaff,openShift,lockStaff} from '@/features/staff/staff';

const dbs: TallybookDB[] = [];
afterEach(async()=>{ lockStaff('primary'); for (const database of dbs) database.close(); await Promise.all(dbs.splice(0).map(d=>new Dexie(d.name).delete())); });
const customer = {name:'Ama Mensah',phone:'0240000000',email:'',address:'',notes:'',status:'active' as const};
async function setup() {
  const database = new TallybookDB(`quotation-test-${Date.now()}-${Math.random()}`);dbs.push(database);
  await initializeDatabase(database);
  await saveBusinessProfile({name:'Quotation test shop',country:'Ghana',currency:'GHS',businessType:'Retail shop'},database);
  const owner=await createStaff('Quotation test owner','owner','123456',database);
  await unlockStaff(owner.id,'123456',database);
  await openShift(0,database);
  const c = await createCustomer(customer,database);
  await database.products.add({id:'p1',businessProfileId:c.businessProfileId,name:'Rice',normalizedName:'rice',sellingPriceMinor:1250,stockQuantity:10,lowStockThreshold:0,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
  return {database,c};
}
describe('S4-03 quotation lifecycle: explicit transitions and idempotent conversion',()=>{
  const pay=(expectedTotalMinor:number)=>({paymentMethod:'credit' as const,amountPaid:'0',discount:'0',expectedTotalMinor});
  it('only allows draft->issued and issued->accepted/declined; terminal states stay terminal',async()=>{
    const {database,c}=await setup();
    const q=await createQuotation({customerId:c.id,currency:'GHS',lines:[{productId:'p1',quantity:1}]},database);
    await expect(setQuotationStatus(q.id,'accepted',database)).rejects.toThrow(/not allowed/);
    await expect(setQuotationStatus(q.id,'declined',database)).rejects.toThrow(/not allowed/);
    await setQuotationStatus(q.id,'issued',database);
    await expect(setQuotationStatus(q.id,'issued',database)).rejects.toThrow(/not allowed/);
    await setQuotationStatus(q.id,'declined',database);
    await expect(setQuotationStatus(q.id,'accepted',database)).rejects.toThrow(/not allowed/);
    expect((await database.quotations.get(q.id))?.status).toBe('declined');
  });
  it('cannot convert a draft, issued or declined quotation',async()=>{
    const {database,c}=await setup();
    const q=await createQuotation({customerId:c.id,currency:'GHS',lines:[{productId:'p1',quantity:1}]},database);
    await expect(convertQuotationToSale(q.id,pay(1250),database)).rejects.toThrow(/Only accepted/);
    await setQuotationStatus(q.id,'issued',database);
    await expect(convertQuotationToSale(q.id,pay(1250),database)).rejects.toThrow(/Only accepted/);
    expect(await database.sales.count()).toBe(0);
  });
  it('conversion is idempotent: a second attempt (retry/double click) never posts a second sale or stock movement',async()=>{
    const {database,c}=await setup();
    const q=await createQuotation({customerId:c.id,currency:'GHS',lines:[{productId:'p1',quantity:2}]},database);
    await setQuotationStatus(q.id,'issued',database);await setQuotationStatus(q.id,'accepted',database);
    const first=await convertQuotationToSale(q.id,pay(2500),database);
    await expect(convertQuotationToSale(q.id,pay(2500),database)).rejects.toThrow(/already been converted/);
    const concurrent=await Promise.allSettled([convertQuotationToSale(q.id,pay(2500),database),convertQuotationToSale(q.id,pay(2500),database)]);
    expect(concurrent.every(r=>r.status==='rejected')).toBe(true);
    expect(await database.sales.count()).toBe(1);
    expect((await database.products.get('p1'))?.stockQuantity).toBe(8);
    expect((await database.quotations.get(q.id))?.convertedSaleId).toBe(first.sale.id);
  });
  it('two simultaneous first conversions post exactly one sale',async()=>{
    const {database,c}=await setup();
    const q=await createQuotation({customerId:c.id,currency:'GHS',lines:[{productId:'p1',quantity:1}]},database);
    await setQuotationStatus(q.id,'issued',database);await setQuotationStatus(q.id,'accepted',database);
    const results=await Promise.allSettled([convertQuotationToSale(q.id,pay(1250),database),convertQuotationToSale(q.id,pay(1250),database)]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect(await database.sales.count()).toBe(1);
    expect((await database.products.get('p1'))?.stockQuantity).toBe(9);
  });
  it('a catalogue price change after the offer forces a re-review instead of silently charging either price',async()=>{
    const {database,c}=await setup();
    const q=await createQuotation({customerId:c.id,currency:'GHS',lines:[{productId:'p1',quantity:2}]},database);
    await setQuotationStatus(q.id,'issued',database);await setQuotationStatus(q.id,'accepted',database);
    await database.products.update('p1',{sellingPriceMinor:1500});
    await expect(convertQuotationToSale(q.id,pay(2500),database)).rejects.toThrow(/Catalogue prices changed/);
    expect(await database.sales.count()).toBe(0);
    const sale=await convertQuotationToSale(q.id,pay(3000),database); // owner reviewed the new total
    expect(sale.sale.totalMinor).toBe(3000);
  });
  it('an expired quotation cannot be accepted or converted',async()=>{
    const {database,c}=await setup();
    const q=await createQuotation({customerId:c.id,currency:'GHS',lines:[{productId:'p1',quantity:1}]},database);
    await setQuotationStatus(q.id,'issued',database);await setQuotationStatus(q.id,'accepted',database);
    await database.quotations.update(q.id,{expiresAt:new Date(Date.now()-1000).toISOString()});
    await expect(convertQuotationToSale(q.id,pay(1250),database)).rejects.toThrow(/expired/);
    await expect(setQuotationStatus(q.id,'declined',database)).rejects.toThrow(/expired/);
    expect(await database.sales.count()).toBe(0);
  });
});
