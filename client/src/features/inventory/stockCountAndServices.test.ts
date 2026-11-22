import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TallybookDB, initializeDatabase } from '@/db/TallybookDB';
import { createCustomer } from '@/features/customers/customers';
import { prepareStockCount, postStockCount } from '@/features/inventory/advancedInventory';
import { setCatalogueOptions } from '@/features/inventory/stage2Inventory';
import { completeSale } from '@/features/sales/sales';
import { setActiveBusinessProfileId } from '@/features/business/activeCompany';
import {saveBusinessProfile} from '@/features/business/businessProfile';
import {createStaff,unlockStaff,openShift,lockStaff} from '@/features/staff/staff';

const dbs: TallybookDB[] = [];
afterEach(async()=>{ lockStaff('primary'); for (const database of dbs) database.close(); await Promise.all(dbs.splice(0).map(d=>new Dexie(d.name).delete())); });
const customer = {name:'Ama Mensah',phone:'0240000000',email:'',address:'',notes:'',status:'active' as const};
async function setup() {
  const database = new TallybookDB(`inventory-criteria-${Date.now()}-${Math.random()}`);dbs.push(database);
  await initializeDatabase(database);
  await saveBusinessProfile({name:'Inventory criteria shop',country:'Ghana',currency:'GHS',businessType:'Retail shop'},database);
  const owner=await createStaff('Inventory criteria owner','owner','123456',database);
  await unlockStaff(owner.id,'123456',database);
  await openShift(0,database);
  const c = await createCustomer(customer,database);
  await database.products.add({id:'p1',businessProfileId:c.businessProfileId,name:'Rice',normalizedName:'rice',sellingPriceMinor:1250,stockQuantity:10,lowStockThreshold:0,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
  const row=(id:string,name:string,stock:number)=>({id,businessProfileId:c.businessProfileId,name,normalizedName:name.toLowerCase(),sellingPriceMinor:1000,stockQuantity:stock,lowStockThreshold:0,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
  await database.products.add(row('p2','Oil',5) as never);
  await database.products.add(row('svc','Haircut',0) as never);
  return {database,c};
}
describe('S2-05 persisted stock counts refuse stale balances and post atomically',()=>{
  it('a sale after the count began makes posting fail with no stock or movement change',async()=>{
    const {database}=await setup();
    const preview=await prepareStockCount(['p1'],database);
    preview.lines[0].countedQuantity=7;
    await database.products.update('p1',{stockQuantity:9}); // a sale happened meanwhile
    await expect(postStockCount(preview,database)).rejects.toThrow(/Stock changed for Rice after the count began/);
    expect((await database.products.get('p1'))?.stockQuantity).toBe(9);
    expect(await database.inventoryMovements.count()).toBe(0);
  });
  it('is all-or-nothing: one stale line blocks every other line',async()=>{
    const {database}=await setup();
    const preview=await prepareStockCount(['p1','p2'],database);
    preview.lines[0].countedQuantity=8;preview.lines[1].countedQuantity=4;
    await database.products.update('p2',{stockQuantity:3});
    await expect(postStockCount(preview,database)).rejects.toThrow(/Stock changed for Oil/);
    expect((await database.products.get('p1'))?.stockQuantity).toBe(10);
    expect(await database.inventoryMovements.count()).toBe(0);
  });
  it('posts a correction with previous/result quantities, skips unchanged lines, and cannot be replayed',async()=>{
    const {database}=await setup();
    const preview=await prepareStockCount(['p1','p2'],database);
    preview.lines[0].countedQuantity=7; // p2 unchanged
    const moves=await postStockCount(preview,database);
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({productId:'p1',movementType:'correction',quantityDelta:-3,previousQuantity:10});
    expect((await database.products.get('p1'))?.stockQuantity).toBe(7);
    await expect(postStockCount(preview,database)).rejects.toThrow(/Stock changed/); // same preview again is stale
    expect(await database.inventoryMovements.count()).toBe(1);
  });
  it('refuses invalid counts, duplicate lines, empty previews and another company\'s preview',async()=>{
    const {database}=await setup();
    const base=await prepareStockCount(['p1'],database);
    for(const bad of [-1,1.5,10_000_000]) await expect(postStockCount({...base,lines:[{...base.lines[0],countedQuantity:bad}]},database)).rejects.toThrow(/valid whole numbers/);
    await expect(postStockCount({...base,lines:[base.lines[0],base.lines[0]]},database)).rejects.toThrow(/Duplicate/);
    await expect(postStockCount({...base,lines:[]},database)).rejects.toThrow(/empty|different business/);
    await expect(postStockCount({...base,companyId:'other-company'},database)).rejects.toThrow(/different business/);
    await expect(prepareStockCount(['p1','p1'],database)).rejects.toThrow(/distinct/);
    await expect(prepareStockCount(['missing'],database)).rejects.toThrow(/not active/);
    expect(await database.inventoryMovements.count()).toBe(0);
  });
});

describe('S2-03 services are non-stock and product media is validated and bounded',()=>{
  const png='data:image/png;base64,iVBORw0KGgo=';
  it('accepts a small PNG/JPEG/WebP and rejects SVG, remote URLs, bad base64 and oversize images',async()=>{
    const {database}=await setup();
    await setCatalogueOptions('p1',{imageDataUrl:png},database);
    expect((await database.products.get('p1'))?.imageDataUrl).toBe(png);
    await setCatalogueOptions('p1',{imageDataUrl:'data:image/webp;base64,UklGRg=='},database);
    for(const bad of ['data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=','https://example.com/a.png','data:image/png;base64,@@@','data:text/html;base64,PGI+','data:image/png;base64,'+'A'.repeat(180_001)])
      await expect(setCatalogueOptions('p1',{imageDataUrl:bad},database)).rejects.toThrow(/PNG, JPEG, or WebP/);
    expect((await database.products.get('p1'))?.imageDataUrl).toBe('data:image/webp;base64,UklGRg==');
  });
  it('a product with stock cannot become a service; a zero-stock service can',async()=>{
    const {database}=await setup();
    await expect(setCatalogueOptions('p1',{itemKind:'service'},database)).rejects.toThrow(/stocked item cannot become a service/);
    await setCatalogueOptions('svc',{itemKind:'service'},database);
    expect((await database.products.get('svc'))?.itemKind).toBe('service');
  });
  it('selling a service needs no stock and writes no stock movement; a stocked item still cannot be oversold',async()=>{
    const {database}=await setup();
    await setCatalogueOptions('svc',{itemKind:'service'},database);
    const sale=await completeSale({lines:[{productId:'svc',quantity:3}],currency:'GHS',paymentMethod:'cash',amountPaid:'30.00',discount:'0'},database);
    expect(sale.sale.totalMinor).toBe(3000);
    expect((await database.products.get('svc'))?.stockQuantity).toBe(0);
    expect(await database.inventoryMovements.where('productId').equals('svc').count()).toBe(0);
    await expect(completeSale({lines:[{productId:'p2',quantity:6}],currency:'GHS',paymentMethod:'cash',amountPaid:'60.00',discount:'0'},database)).rejects.toThrow(/stock|available|only/i);
    expect((await database.products.get('p2'))?.stockQuantity).toBe(5);
  });
});
