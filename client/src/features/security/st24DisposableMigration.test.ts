import Dexie from 'dexie';
import {describe,it,expect,afterEach} from 'vitest';
import {TallybookDB,initializeDatabase,DATABASE_SCHEMA_VERSION} from '@/db/TallybookDB';
import {saveBusinessProfile} from '@/features/business/businessProfile';
import {createStaff,unlockStaff,openShift,lockStaff} from '@/features/staff/staff';
import {createProduct} from '@/features/inventory/inventory';
import {createCustomer} from '@/features/customers/customers';
import {completeSale} from '@/features/sales/sales';
import {createLedgerKeyring} from './st24LedgerKeyring.mjs';
import {stageSt24PopulatedDisposableLedger,restoreSt24ShadowToDisposableLedger,compareSt24DisposableLedgers}
 from './st24DisposableMigration.mjs';

let sequence=0;
const opened:TallybookDB[]=[];
const databases=new Set<string>();
function makeDatabase(prefix:'fixture'|'restore') {
 const name='tallybook-st24-'+prefix+'-'+Date.now().toString(36)+'-'+(++sequence).toString(36).padStart(5,'0');
 databases.add(name);
 const result=new TallybookDB(name);
 opened.push(result);
 return result;
}
afterEach(async()=>{
 lockStaff('primary');
 opened.splice(0).forEach(d=>d.close());
 for(const name of databases)await new Dexie(name).delete();
 databases.clear();
});

// This Stage C tool copies RAW rows of a plaintext fixture ledger. In the forced-encrypted verification run the
// source rows are already sealed (typed-array envelopes), which that rehearsal tool deliberately does not support.
const forcedEncryptedSuite=process.env.TALLYBOOK_ENCRYPTED_TESTS==='1'||process.env.TALLYBOOK_ENCRYPTED_TESTS==='2';
describe.skipIf(forcedEncryptedSuite)('ST24-05 actual 39-version Dexie schema encrypted disposable migration',()=>{
 it('round-trips real created shop, inventory, customer, sale and staff records with indexes, money and source unchanged',async()=>{
  const source=makeDatabase('fixture');
  await initializeDatabase(source);
  expect(source.verno).toBe(DATABASE_SCHEMA_VERSION);
  await saveBusinessProfile({
   name:'ST24 real-schema migration fixture',country:'Ghana',currency:'GHS',
   businessType:'Retail shop',phone:'',email:'',address:''
  },source);
  const owner=await createStaff('ST24 Owner','owner','654321',source);
  await unlockStaff(owner.id,'654321',source);
  await openShift(0,source);
  const product=await createProduct({
    name:'Snapshot item',sku:'',categoryId:'uncategorized',sellingPrice:'12.00',
    costPrice:'',initialStock:'8',lowStockThreshold:'1'
  },'GHS',source);
  const customer=await createCustomer({
    name:'Private migrated customer',phone:'+233 20 222 1010',email:'',
    address:'',notes:'',status:'active'
  },source);
  const sale=await completeSale({
   lines:[{productId:product.id,quantity:2}],customerId:customer.id,discount:'0',
   paymentMethod:'cash',amountPaid:'24.00',currency:'GHS',submissionKey:'st24-populated-disposable-sale'
  },source);
  const originalSales=await source.sales.toArray();
  const originalPayments=await source.payments.toArray();
  const originalStock=await source.inventoryMovements.toArray();
  const count=source.tables.length;
  source.close();

  const passphrase='st24 intentionally disposable offline owner testing passphrase';
  const {keyring,handle}=await createLedgerKeyring({
    workspaceId:'st24-device-test',companyId:'primary',ownerPassphrase:passphrase
  });
  const staged=await stageSt24PopulatedDisposableLedger({
   sourceDbName:source.name,companyId:'primary',keyring,handle,
   ownerPassphrase:passphrase,idb:indexedDB,locks:navigator.locks
  });
  expect(staged.sourceVersion).toBe(DATABASE_SCHEMA_VERSION*10);
  expect(staged.tableCount).toBe(count);
  expect(staged.tableCounts.sales).toBeGreaterThan(0);
  expect(staged.tableCounts.inventoryMovements).toBeGreaterThan(0);
  expect(staged.tableCounts.staffMembers).toBeGreaterThan(0);
  expect(staged.minorTotals['sales.totalMinor']).toBeDefined();

  const target=makeDatabase('restore');target.close();
  // An unopened Dexie instance does not create a target database.
  const restored=await restoreSt24ShadowToDisposableLedger({
   snapshotId:staged.snapshotId,targetDbName:target.name,companyId:'primary',
   handle,expectedSourceSha256:staged.sourceSha256,idb:indexedDB
  });
  expect(restored.sha256).toBe(staged.sourceSha256);
  expect(restored.tableCounts).toEqual(staged.tableCounts);
  expect(restored.minorTotals).toEqual(staged.minorTotals);
  expect((await compareSt24DisposableLedgers({
   sourceDbName:source.name,restoredDbName:target.name,
   companyId:'primary',idb:indexedDB
  })).exact).toBe(true);
  await source.open();
  await target.open();
  expect(await source.sales.toArray()).toEqual(originalSales);
  expect(await source.payments.toArray()).toEqual(originalPayments);
  expect(await source.inventoryMovements.toArray()).toEqual(originalStock);
  expect(await target.sales.toArray()).toEqual(originalSales);
  expect(await target.payments.toArray()).toEqual(originalPayments);
  expect(await target.inventoryMovements.toArray()).toEqual(originalStock);
  expect((await target.customers.get(customer.id))?.name).toBe('Private migrated customer');
  expect(sale).toBeTruthy();
 },120000);
});
