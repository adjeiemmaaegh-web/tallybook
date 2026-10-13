/** Prospective IndexedDB/Web Locks regression. Run with the pinned client
 * Vitest toolchain; native source-contract tests are not a substitute. */
import Dexie from 'dexie';
import { afterEach, expect, it } from 'vitest';
import { TallybookDB, initializeDatabase } from '@/db/TallybookDB';
import { saveBusinessProfile } from '@/features/business/businessProfile';
import { createDraftOrder } from '@/features/commerce/commerce';
import { getActiveBusinessProfileId, setActiveBusinessProfileId } from '@/features/business/activeCompany';
import { TWO_DATABASE_LOCK_NAME } from './crossTabDataLock.mjs';

const opened: TallybookDB[]=[];
const names: string[]=[];
afterEach(async()=>{
  for(const database of opened.splice(0)) database.close();
  for(const name of names.splice(0)) await new Dexie(name).delete();
  setActiveBusinessProfileId('primary');
});

it('rejects business edits and local commerce drafts during exclusive recovery without partial writes', async()=>{
  const name=`admin-recovery-${crypto.randomUUID()}`;
  names.push(name);
  const database=new TallybookDB(name);opened.push(database);
  await initializeDatabase(database);
  setActiveBusinessProfileId('primary');
  await saveBusinessProfile({name:'Before recovery',country:'Ghana',currency:'GHS',businessType:'Retail shop'},database);
  await database.products.add({id:'test-product',businessProfileId:'primary',name:'Soap',normalizedName:'soap',itemKind:'stock',sellingPriceMinor:250,stockQuantity:4,lowStockThreshold:0,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
  expect(getActiveBusinessProfileId()).toBe('primary');
  let entered!:()=>void;
  let release!:()=>void;
  const ready=new Promise<void>(resolve=>{entered=resolve;});
  const held=new Promise<void>(resolve=>{release=resolve;});
  const holder=navigator.locks.request(TWO_DATABASE_LOCK_NAME,{mode:'exclusive',ifAvailable:true},async lock=>{
    expect(lock).not.toBeNull();entered();await held;
  });
  await ready;
  try {
    await expect(saveBusinessProfile({name:'Should not save',country:'Ghana',currency:'GHS',businessType:'Retail shop'},database)).rejects.toThrow(/Another tab/);
    await expect(createDraftOrder('Buyer',[{productId:'test-product',quantity:1}],database)).rejects.toThrow(/Another tab/);
    expect((await database.businessProfiles.get('primary'))?.name).toBe('Before recovery');
    expect(await database.commerceOrders.count()).toBe(0);
  } finally {release();await holder;}
  const updated=await saveBusinessProfile({name:'After recovery',country:'Ghana',currency:'GHS',businessType:'Retail shop'},database);
  expect(updated.name).toBe('After recovery');
});
