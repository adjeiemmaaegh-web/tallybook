import Dexie from 'dexie';
import {afterEach,expect,it,vi} from 'vitest';
import {TallybookDB,initializeDatabase} from '@/db/TallybookDB';
import {saveBusinessProfile} from '@/features/business/businessProfile';
import {createProduct} from '@/features/inventory/inventory';
import {createStaff,unlockStaff,lockStaff} from '@/features/staff/staff';
import {setActiveBusinessProfileId} from '@/features/business/activeCompany';
import {RESTORE_JOURNAL_KEY} from '@/features/backup/restoreJournal.mjs';
import {createDraftOrder,cancelDraftOrder,transitionLocalOrder,listDraftOrders,listCatalogue} from './commerce';
const databases:TallybookDB[]=[];
async function setup(){
 setActiveBusinessProfileId('primary');lockStaff('primary');
 const db=new TallybookDB(`commerce-boundary-${crypto.randomUUID()}`);databases.push(db);await initializeDatabase(db);
 await saveBusinessProfile({name:'Commerce fixture',country:'Ghana',currency:'GHS',businessType:'Retail shop'},db);
 const owner=await createStaff('Owner','owner','123456',db);await unlockStaff(owner.id,'123456',db);
 const product=await createProduct({name:'Rice',categoryId:'uncategorized',sellingPrice:'10',costPrice:'4',initialStock:'10',lowStockThreshold:'1'},'GHS',db);
 const create=()=>createDraftOrder('Private customer',[{productId:product.id,quantity:2}],db,{customerContact:'private fixture contact'});
 const order=await create();return {db,owner,product,order,create};
}
afterEach(async()=>{vi.restoreAllMocks();lockStaff('primary');setActiveBusinessProfileId('primary');for(const db of databases.splice(0)){db.close();await new Dexie(db.name).delete();}});
const snapshot=async(db:TallybookDB)=>Promise.all([db.commerceOrders.toArray(),db.staffAudits.toArray(),db.products.toArray(),db.sales.toArray(),db.payments.toArray()]);
it('interrupted recovery prevents every local draft mutation without partial state',async()=>{
 const f=await setup();const before=await snapshot(f.db);
 await f.db.appMeta.put({key:RESTORE_JOURNAL_KEY,value:'interrupted fixture recovery',updatedAt:new Date().toISOString()});
 await expect(f.create()).rejects.toThrow(/requires recovery/);
 await expect(cancelDraftOrder(f.order.id,f.db)).rejects.toThrow(/requires recovery/);
 await expect(transitionLocalOrder(f.order.id,'prepare',f.db)).rejects.toThrow(/requires recovery/);
 expect(await snapshot(f.db)).toEqual(before);
});
it('locking during authoritative product lookup aborts draft creation and audit',async()=>{
 const f=await setup();const before=await snapshot(f.db),get=f.db.products.get.bind(f.db.products);
 vi.spyOn(f.db.products,'get').mockImplementationOnce(async key=>{const row=await get(key);lockStaff('primary');return row;});
 await expect(f.create()).rejects.toThrow(/staff session changed/);
 expect(await snapshot(f.db)).toEqual(before);
});
it('locking during order lookup prevents cancellation and preparation under the old employee',async()=>{
 const f=await setup();const before=await snapshot(f.db),get=f.db.commerceOrders.get.bind(f.db.commerceOrders);
 for(const run of [()=>cancelDraftOrder(f.order.id,f.db),()=>transitionLocalOrder(f.order.id,'prepare',f.db)]){
  await unlockStaff(f.owner.id,'123456',f.db);
  vi.spyOn(f.db.commerceOrders,'get').mockImplementationOnce(async key=>{const row=await get(key);lockStaff('primary');return row;});
  await expect(run()).rejects.toThrow(/staff session changed/);expect(await snapshot(f.db)).toEqual(before);
 }
});
it('private customer drafts and catalogue reject locked reads and a new unlock of the same owner',async()=>{
 const f=await setup();lockStaff('primary');
 await expect(listDraftOrders(f.db)).rejects.toThrow(/locked/);await expect(listCatalogue(f.db)).rejects.toThrow(/locked/);
 await unlockStaff(f.owner.id,'123456',f.db);
 const where=f.db.commerceOrders.where.bind(f.db.commerceOrders);
 vi.spyOn(f.db.commerceOrders,'where').mockImplementationOnce((...args:Parameters<typeof where>)=>{
  const clause=where(...args),equals=clause.equals.bind(clause);
  vi.spyOn(clause,'equals').mockImplementationOnce(value=>{
   const collection=equals(value),read=collection.toArray.bind(collection);
   vi.spyOn(collection,'toArray').mockImplementationOnce(async()=>{const rows=await read();lockStaff('primary');await unlockStaff(f.owner.id,'123456',f.db);return rows;});
   return collection;
  });return clause;
 });
 await expect(listDraftOrders(f.db)).rejects.toThrow(/staff session changed/);
});
it('audit failure rolls back a new request, and authorized planning never posts money or stock',async()=>{
 const f=await setup();const before=await snapshot(f.db);
 vi.spyOn(f.db.staffAudits,'add').mockRejectedValueOnce(new Error('fixture audit full'));
 await expect(f.create()).rejects.toThrow(/audit full/);expect(await snapshot(f.db)).toEqual(before);
 await transitionLocalOrder(f.order.id,'prepare',f.db);await transitionLocalOrder(f.order.id,'ready',f.db);await transitionLocalOrder(f.order.id,'cancel',f.db);
 expect((await f.db.commerceOrders.get(f.order.id))?.status).toBe('cancelled');
 expect((await f.db.products.get(f.product.id))?.stockQuantity).toBe(10);
 expect(await f.db.sales.count()).toBe(0);expect(await f.db.payments.count()).toBe(0);
 const cancelled=await snapshot(f.db);await expect(transitionLocalOrder(f.order.id,'prepare',f.db)).rejects.toThrow(/Invalid/);expect(await snapshot(f.db)).toEqual(cancelled);
});
