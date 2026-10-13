/** Client contract tests for core retail writes under a competing recovery lock.
 * Requires Dexie/Vitest dependencies. Native source-coverage tests are not a
 * replacement for executing these against IndexedDB or a real browser.
 */
import Dexie from 'dexie';
import { afterEach, expect, it } from 'vitest';
import { TallybookDB, initializeDatabase } from '@/db/TallybookDB';
import { createProduct, adjustStock } from '@/features/inventory/inventory';
import { completeSale } from '@/features/sales/sales';
import { TWO_DATABASE_LOCK_NAME } from './crossTabDataLock.mjs';

const names:string[]=[];
const openDatabases:TallybookDB[]=[];
async function fixture() {
  const name=`retail-recovery-lock-${crypto.randomUUID()}`;
  names.push(name);
  const database=new TallybookDB(name);
  openDatabases.push(database);
  await initializeDatabase(database);
  const product=await createProduct({name:'Locked stock',sku:'',categoryId:'uncategorized',sellingPrice:'10.00',costPrice:'',initialStock:'5',lowStockThreshold:'1'},'GHS',database);
  return {database,product};
}
afterEach(async()=>{
  for (const database of openDatabases.splice(0)) database.close();
  for (const name of names.splice(0)) await new Dexie(name).delete();
});

it('cannot open a sale or adjust inventory while recovery owns the exclusive origin lock', async () => {
  const {database,product}=await fixture();
  let release!:()=>void;
  let signal!:()=>void;
  const held=new Promise<void>(resolve=>{release=resolve;});
  const entered=new Promise<void>(resolve=>{signal=resolve;});
  const exclusive=navigator.locks.request(TWO_DATABASE_LOCK_NAME,{mode:'exclusive',ifAvailable:true},async lock=>{
    expect(lock).not.toBeNull();
    signal();
    await held;
  });
  await entered;
  try {
    await expect(completeSale({lines:[{productId:product.id,quantity:1}],discount:'0',paymentMethod:'cash',amountPaid:'10.00',currency:'GHS'},database)).rejects.toThrow(/another tab/i);
    await expect(adjustStock(product.id,{movementType:'correction',quantity:'4',note:'no write under recovery'},database)).rejects.toThrow(/another tab/i);
    expect(await database.sales.count()).toBe(0);
    expect((await database.products.get(product.id))?.stockQuantity).toBe(5);
  } finally {
    release();
    await exclusive;
  }
  const sale=await completeSale({lines:[{productId:product.id,quantity:1}],discount:'0',paymentMethod:'cash',amountPaid:'10.00',currency:'GHS'},database);
  expect(sale.sale.totalMinor).toBe(1000);
  expect((await database.products.get(product.id))?.stockQuantity).toBe(4);
});
