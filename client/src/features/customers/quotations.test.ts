import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TallybookDB, initializeDatabase } from '@/db/TallybookDB';
import { createCustomer } from '@/features/customers/customers';
import { createQuotation, listQuotations, setQuotationStatus, convertQuotationToSale } from './quotations';
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
describe('quotation isolation and write safety',()=>{
  it('creates a quote without changing product stock or sales',async()=>{
    const {database,c}=await setup();
    const q=await createQuotation({customerId:c.id,currency:'GHS',lines:[{productId:'p1',quantity:2}]},database);
    expect(q.totalMinor).toBe(2500);
    expect((await database.products.get('p1'))?.stockQuantity).toBe(10);
    expect(await database.sales.count()).toBe(0);
    expect((await listQuotations(database)).map(x=>x.id)).toContain(q.id);
    await setQuotationStatus(q.id,'issued',database);
    await setQuotationStatus(q.id,'accepted',database);
    expect(await database.sales.count()).toBe(0);
  });
  it('rejects duplicate lines and missing products',async()=>{
    const {database,c}=await setup();
    await expect(createQuotation({customerId:c.id,currency:'GHS',lines:[{productId:'p1',quantity:1},{productId:'p1',quantity:1}]},database)).rejects.toThrow(/duplicate/);
    await expect(createQuotation({customerId:c.id,currency:'GHS',lines:[{productId:'missing',quantity:1}]},database)).rejects.toThrow(/unavailable/);
    expect(await database.quotations.count()).toBe(0);
  });
  it('rejects a changed price before saving a reviewed draft',async()=>{
    const {database,c}=await setup();
    await expect(createQuotation({customerId:c.id,currency:'GHS',lines:[{productId:'p1',quantity:2,expectedPriceMinor:1200}]},database)).rejects.toThrow(/prices changed/);
    expect(await database.quotations.count()).toBe(0);
  });
  it('rolls back checkout, costs and stock when linking the converted quotation fails',async()=>{
    const {database,c}=await setup();
    const quote=await createQuotation({customerId:c.id,currency:'GHS',lines:[{productId:'p1',quantity:2}]},database);
    await setQuotationStatus(quote.id,'issued',database); await setQuotationStatus(quote.id,'accepted',database);
    const put=vi.spyOn(database.quotations,'put').mockRejectedValueOnce(new Error('disk full'));
    await expect(convertQuotationToSale(quote.id,{paymentMethod:'credit',amountPaid:'0',discount:'0',expectedTotalMinor:2500},database)).rejects.toThrow('disk full');
    put.mockRestore();
    expect(await database.sales.count()).toBe(0);
    expect(await database.inventoryCostEvents.count()).toBe(0);
    expect((await database.products.get('p1'))?.stockQuantity).toBe(10);
    const result=await convertQuotationToSale(quote.id,{paymentMethod:'credit',amountPaid:'0',discount:'0',expectedTotalMinor:2500},database);
    expect((await database.quotations.get(quote.id))?.convertedSaleId).toBe(result.sale.id);
  });
});
