import {afterEach,expect,it,vi} from 'vitest';
import {syncBoundaryFixture,closeSyncFixture} from '@/test/syncBoundaryFixture';
import {createProduct} from '@/features/inventory/inventory';
import {createCustomer} from '@/features/customers/customers';
import {recordWalletTransfer} from '@/features/customers/walletTransfers';
import {openShift,lockStaff,unlockStaff} from '@/features/staff/staff';
import {completeSale} from './sales';
const fixtures:Awaited<ReturnType<typeof syncBoundaryFixture>>[]=[];
async function setup(){
 const f=await syncBoundaryFixture();fixtures.push(f);await openShift(0,f.db);
 const product=await createProduct({name:'Checkout authority rice',categoryId:'uncategorized',sellingPrice:'1',costPrice:'0.4',initialStock:'5',lowStockThreshold:'0'},'GHS',f.db);
 return {...f,product};
}
afterEach(async()=>{vi.restoreAllMocks();for(const f of fixtures.splice(0))await closeSyncFixture(f);});
for(const method of ['cash','credit','wallet'] as const){
 it(method+' checkout rolls back all money, stock, debt, wallet, receipt and audit records when staff lock at the last event write',async()=>{
  const {db,product}=await setup();
  const customer=method==='cash'?undefined:await createCustomer({name:'Approval customer',phone:'+233000000002',email:'',address:'',notes:'',status:'active'},db);
  if(method==='wallet')await recordWalletTransfer({customerId:customer!.id,kind:'deposit',amountMinor:500,method:'cash',reference:'fixture',submissionKey:'approval-wallet-opening'},db);
  const snapshot=async()=>Promise.all(db.tables.map(async table=>({name:table.name,rows:await table.toArray()})));
  const before=await snapshot(),add=db.centralSaleEvents.add.bind(db.centralSaleEvents);
  vi.spyOn(db.centralSaleEvents,'add').mockImplementationOnce(async row=>{const id=await add(row);lockStaff('primary');return id;});
  await expect(completeSale({lines:[{productId:product.id,quantity:1}],discount:'0',paymentMethod:method,amountPaid:method==='credit'?'0':'1',customerId:customer?.id,currency:'GHS',submissionKey:'approval-final-'+method},db)).rejects.toThrow(/session changed/);
  expect(await snapshot()).toEqual(before);
 });
}
it('a fresh unlock of the same owner cannot inherit a checkout waiting for coordination',async()=>{
 const {db,product,owner}=await setup(),request=navigator.locks.request.bind(navigator.locks);
 vi.spyOn(navigator.locks,'request').mockImplementationOnce((async(name:string,options:LockOptions,callback:LockGrantedCallback)=>{
  lockStaff('primary');await unlockStaff(owner.id,'123456',db);return request(name,options,callback);
 }) as typeof navigator.locks.request);
 await expect(completeSale({lines:[{productId:product.id,quantity:1}],discount:'0',paymentMethod:'cash',amountPaid:'1',currency:'GHS',submissionKey:'approval-new-unlock'},db)).rejects.toThrow(/session changed/);
 expect(await db.sales.count()).toBe(0);expect((await db.products.get(product.id))?.stockQuantity).toBe(5);
});
it('checkout captures the reviewed cart before callers mutate their form object',async()=>{
 const {db,product}=await setup();
 const approved={lines:[{productId:product.id,quantity:1}],discount:'0',paymentMethod:'cash' as const,amountPaid:'1',currency:'GHS' as const,submissionKey:'approval-captured-cart'};
 const pending=completeSale(approved,db);approved.lines[0].quantity=3;approved.amountPaid='3';
 const saved=await pending;expect(saved.sale.totalMinor).toBe(100);expect(saved.lines[0].quantity).toBe(1);
 expect((await db.products.get(product.id))?.stockQuantity).toBe(4);
});
