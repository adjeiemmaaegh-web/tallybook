/** Pending IndexedDB/Vitest integration gate: do not count as executed without client dependencies. */
import Dexie from 'dexie';
import {webcrypto} from 'node:crypto';
import {afterEach, describe, expect, it} from 'vitest';
import {TallybookDB, initializeDatabase} from '@/db/TallybookDB';
import {setActiveBusinessProfileId} from '@/features/business/activeCompany';
import {saveBusinessProfile} from '@/features/business/businessProfile';
import {createStaff, unlockStaff, lockStaff} from '@/features/staff/staff';
import {createProduct} from '@/features/inventory/inventory';
import {createCustomer} from '@/features/customers/customers';
import {setCustomerPolicy, recordCustomerBenefit} from '@/features/customers/customerBenefits';
import {createStore, assignStore, listStores, listStoreAssignments} from './storeDirectory';
import {recordStoreStockObservation} from './storeStockCounts';
import {requestStoreTransfer, cancelStoreTransfer} from './storeTransfers';
import {auditLocalIntegrity} from '@/features/reliability/integrity';

if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis,'crypto',{configurable:true,value:webcrypto});
let count=0;
const databases: TallybookDB[]=[];
async function setup(){
  setActiveBusinessProfileId('primary');
  const database=new TallybookDB(`store-auth-integration-${Date.now()}-${++count}`);
  databases.push(database);
  await initializeDatabase(database);
  await saveBusinessProfile({name:'Store Auth',country:'Ghana',currency:'GHS',businessType:'Retail shop',phone:'',email:'',address:''},database);
  return database;
}
afterEach(async()=>{
  lockStaff('primary');
  for(const database of databases.splice(0)){const name=database.name;database.close();await new Dexie(name).delete();}
  setActiveBusinessProfileId('primary');
});

describe('store administration and benefit write authority (pending client run)',()=>{
  it('preserves first-time no-staff store setup and rechecks subsequent staffed writes',async()=>{
    const database=await setup();
    const north=await createStore('North',database); // No staff configured yet
    expect((await listStores(database)).map(s=>s.id)).toContain(north.id);
    const owner=await createStaff('Owner','owner','123456',database);
    await unlockStaff(owner.id,'123456',database);
    const cashier=await createStaff('Cashier','cashier','654321',database);
    const south=await createStore('South',database);
    await assignStore(north.id,cashier.id,database);
    expect(await listStoreAssignments(database)).toHaveLength(1);
    expect((await database.staffAudits.toArray()).some(a=>a.action==='store.created'&&a.staffId===owner.id)).toBe(true);
    expect((await database.staffAudits.toArray()).some(a=>a.action==='store.staff.assigned'&&a.staffId===owner.id)).toBe(true);
    lockStaff('primary');await unlockStaff(cashier.id,'654321',database);
    await expect(createStore('Denied',database)).rejects.toThrow(/permission denied/);
    await expect(assignStore(south.id,cashier.id,database)).rejects.toThrow(/permission denied/);
    expect((await listStores(database)).length).toBe(2);
  });

  it('guards stock observations and proposals, and audits only committed staff operations',async()=>{
    const database=await setup();
    const product=await createProduct({name:'Rice',sku:'rice',categoryId:'uncategorized',sellingPrice:'3.00',costPrice:'',initialStock:'10',lowStockThreshold:'1'},'GHS',database);
    const owner=await createStaff('Owner','owner','123456',database);
    await unlockStaff(owner.id,'123456',database);
    const first=await createStore('North',database),second=await createStore('South',database);
    const observation=await recordStoreStockObservation(first.id,product.id,4,'Counted',database);
    const request=await requestStoreTransfer(first.id,second.id,product.id,2,database);
    await cancelStoreTransfer(request.id,database);
    const actions=(await database.staffAudits.where('staffId').equals(owner.id).toArray()).map(a=>a.action);
    expect(actions).toContain('store.stock.observed');
    expect(actions).toContain('store.transfer.requested');
    expect(actions).toContain('store.transfer.cancelled');
    expect((await database.storeStockObservations.get(observation.id))?.observedQuantity).toBe(4);
    expect((await database.storeTransferRequests.get(request.id))?.status).toBe('cancelled');
    const issues=(await auditLocalIntegrity(database)).issues.map(i=>i.code);
    expect(issues).not.toContain('store-observation-invalid');
    expect(issues).not.toContain('store-transfer-invalid');
  });

  it('validates customer policy and points permissions inside the write transaction and attributes the actor',async()=>{
    const database=await setup();
    const customer=await createCustomer({name:'Benefit Customer',phone:'',email:'',address:'',notes:'',status:'active'},database);
    const owner=await createStaff('Owner','owner','123456',database);
    await unlockStaff(owner.id,'123456',database);
    const cashier=await createStaff('Cashier','cashier','654321',database);
    await setCustomerPolicy(customer.id,{creditLimitMinor:2000},database);
    await recordCustomerBenefit({customerId:customer.id,kind:'points',delta:5,reason:'Owner-approved correction',submissionKey:'benefit-auth-check-001'},database);
    const actions=(await database.staffAudits.where('staffId').equals(owner.id).toArray()).map(a=>a.action);
    expect(actions).toContain('customer.policy.updated');
    expect(actions).toContain('customer.points.adjusted');
    lockStaff('primary');await unlockStaff(cashier.id,'654321',database);
    await expect(setCustomerPolicy(customer.id,{creditLimitMinor:3000},database)).rejects.toThrow(/permission denied/);
    await expect(recordCustomerBenefit({customerId:customer.id,kind:'points',delta:5,reason:'Denied',submissionKey:'benefit-auth-check-002'},database)).rejects.toThrow(/permission denied/);
    expect((await database.customerPolicies.get(`primary:${customer.id}`))?.creditLimitMinor).toBe(2000);
    expect(await database.customerBenefits.count()).toBe(1);
  });
});
