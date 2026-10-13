import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { withRetailWriteLock } from '../client/src/features/backup/retailWriteLock.mjs';
import { TWO_DATABASE_LOCK_NAME } from '../client/src/features/backup/crossTabDataLock.mjs';

const guarded = {
  'customers/customers.ts': ['createCustomer','updateCustomer','archiveCustomer'],
  'customers/customerBenefits.ts': ['setCustomerPolicy','recordCustomerBenefit'],
  'customers/walletTransfers.ts': ['recordWalletTransfer'],
  'stores/storeDirectory.ts': ['createStore','assignStore'],
  'stores/storeTransfers.ts': ['requestStoreTransfer','cancelStoreTransfer'],
  'stores/storeStockCounts.ts': ['recordStoreStockObservation'],
  'inventory/inventory.ts': ['createCategory','createProduct','updateProduct','archiveProduct'],
  'inventory/stage2Inventory.ts': ['setCatalogueOptions','saveStockCountSession','updateStockCountSession','postSavedStockCount','registerBatch'],
  'inventory/advancedInventory.ts': ['postStockCount','importProductCatalogCsv'],
  'purchases/purchases.ts': ['createSupplier','updateSupplier','archiveSupplier'],
};

// Source-contract evidence only; Dexie/browser transaction coverage is still required.
for (const [file,names] of Object.entries(guarded)) {
  test(`expanded retail coordination covers ${file}`, () => {
    const source = readFileSync(new URL(`../client/src/features/${file}`,import.meta.url),'utf8');
    assert.match(source, /import \{ withCoordinatedRetailWrite \}/);
    for (const name of names) {
      const begin = source.indexOf(`export async function ${name}(`);
      assert.ok(begin >= 0, `missing ${name}`);
      const end = source.indexOf('return withCoordinatedRetailWrite(async () => {',begin);
      assert.ok(end > begin && end - begin < 550, `${name} must lock before beginning its write transaction`);
    }
  });
}

test('nested transaction work runs synchronously without requesting another browser lock', async () => {
  let requests=0,started=0;
  const manager={request: async () => { requests++; throw new Error('must not request a lock inside Dexie'); }};
  const result=await withRetailWriteLock(() => { started++;return Promise.resolve('transaction kept live');},true,manager);
  assert.equal(result,'transaction kept live');
  assert.equal(requests,0);
  assert.equal(started,1);
});

test('shared retail writer is refused under exclusive recovery lock before doing any work', async () => {
  let occupied=true,started=0,requests=0;
  const manager={ async request(name, options, cb) {
    requests++;
    assert.equal(name,TWO_DATABASE_LOCK_NAME);
    assert.equal(options.mode,'shared');
    assert.equal(options.ifAvailable,true);
    return cb(occupied?null:{name});
  }};
  await assert.rejects(withRetailWriteLock(() => {started++; return 'written';},false,manager),/Another tab/);
  assert.equal(started,0);
  occupied=false;
  assert.equal(await withRetailWriteLock(() => {started++;return 'written';},false,manager),'written');
  assert.equal(started,1);
  assert.equal(requests,2);
});

test('rejected retail work releases the browser shared lock for a later attempt', async () => {
  let held=false,calls=0;
  const manager={ async request(_name,_options,cb) {
    assert.equal(held,false);
    held=true;
    try { return await cb({}); } finally { held=false; }
  }};
  await assert.rejects(withRetailWriteLock(async()=>{calls++;throw new Error('invalid receipt');},false,manager),/invalid receipt/);
  assert.equal(held,false);
  assert.equal(await withRetailWriteLock(async()=>{calls++;return 'done';},false,manager),'done');
  assert.equal(calls,2);
});

test('absence of browser Web Locks permits local ordinary writes without enabling destructive restores', async () => {
  const seen=[];
  assert.equal(await withRetailWriteLock(() => {seen.push('offline');return 5;},false,null),5);
  assert.deepEqual(seen,['offline']);
});

test('wallet transfer validates live permission and shift under the write transaction', () => {
  const source=readFileSync(new URL('../client/src/features/customers/walletTransfers.ts',import.meta.url),'utf8');
  const start=source.indexOf("return database.transaction('rw'");
  assert.ok(start>0);
  const txn=source.slice(start);
  assert.match(txn.slice(0,500),/database\.staffMembers,database\.staffShifts/);
  assert.match(txn.slice(0,1000),/requirePermission\(input.kind/);
  assert.match(txn.slice(0,1000),/activeStaffShift\(staff,database\)/);
  assert.ok(source.indexOf('requirePermission(input.kind')>start);
  assert.ok(source.indexOf('activeStaffShift(staff,database)')>start);
  assert.match(txn,/Company changed during prepaid posting/);
});


test('nested synchronous validation errors become rejections without requesting Web Locks', async () => {
  let requests=0;
  const manager={request:async()=>{requests++;}};
  await assert.rejects(withRetailWriteLock(()=>{throw new Error('invalid wallet');},true,manager),/invalid wallet/);
  assert.equal(requests,0);
});
