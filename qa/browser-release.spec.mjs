import {unlockFixtureOwner} from './local-owner-fixture.mjs';
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const { schemas } = JSON.parse(readFileSync(new URL('./fixtures/legacy-schemas.json', import.meta.url), 'utf8'));
const updates = JSON.parse(readFileSync(new URL('./fixtures/legacy-schema-updates.json', import.meta.url), 'utf8'));
for (const [version, changes] of Object.entries(updates)) {
  schemas[version] = {...schemas[Number(version) - 1], ...changes};
}


test('every historical schema opens in native IndexedDB and preserves saved metadata', async ({ page }) => {
  await page.goto('/');
  for (const [version, schema] of Object.entries(schemas)) {
    const result = await page.evaluate(async ({ version, schema }) => {
      const { TallybookDB, initializeDatabase, DATABASE_SCHEMA_VERSION } = await import('/src/db/TallybookDB.ts');
      const Dexie = Object.getPrototypeOf(TallybookDB);
      const name = `release-migration-v${version}-${crypto.randomUUID()}`;
      const legacy = new Dexie(name);
      legacy.version(Number(version)).stores(schema);
      await legacy.open();
      const date = '2025-01-01T00:00:00.000Z';
      await legacy.table('appMeta').put({ key: 'databaseCreatedAt', value: date, updatedAt: date });
      if (schema.businessProfiles) await legacy.table('businessProfiles').put({ id: 'primary', name: 'Migration fixture', country: 'Ghana', currency: 'GHS', businessType: 'Retail', createdAt: date, updatedAt: date });
      if (schema.products) await legacy.table('products').put({ id: 'fixture-product', businessProfileId: 'primary', name: 'Rice', normalizedName: 'rice', stockQuantity: 7, sellingPriceMinor: 250, costPriceMinor: 100, lowStockThreshold: 1, createdAt: date, updatedAt: date });
      legacy.close();
      const upgraded = new TallybookDB(name);
      try {
        await initializeDatabase(upgraded);
        return { version: upgraded.verno, expected: DATABASE_SCHEMA_VERSION, created: (await upgraded.appMeta.get('databaseCreatedAt')).value, product: await upgraded.products.get('fixture-product'), events: await upgraded.inventoryCostEvents.count() };
      } finally { upgraded.close(); await Dexie.delete(name); }
    }, { version, schema });
    expect(result.version, `schema ${version}`).toBe(result.expected);
    expect(schemas[result.expected - 1], 'freeze the previous schema when adding a migration').toBeDefined();
    expect(result.created).toBe('2025-01-01T00:00:00.000Z');
    if (schema.products) expect(result.product.stockQuantity).toBe(7);
    expect(result.events).toBe(0); // No fabricated legacy receipts or costs.
  }
});

test('new setup displays Ghana, GHS, MoMo and provider fields', async ({ page }) => {
  await page.goto('/business');
  await expect(page.getByRole('heading', { name: 'Set up your business', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Country', exact: true })).toContainText('Ghana');
  await expect(page.getByRole('combobox', { name: 'Currency', exact: true })).toContainText('GHS');
  await expect(page.getByRole('combobox', { name: 'Usual payment method', exact: true })).toContainText('Mobile Money');
  await expect(page.getByRole('textbox', { name: 'Card provider Optional', exact: true })).toBeVisible();
});

test('owner explicitly configures tax and prepared quotation reaches a saved offer', async ({ page }) => {
  await page.goto('/business');
  await page.evaluate(async () => {
    const {saveBusinessProfile}=await import('/src/features/business/businessProfile.ts');
    await saveBusinessProfile({name:'Browser QA',country:'Ghana',currency:'GHS',businessType:'Retail shop'});
  });
  await page.reload();
  await unlockFixtureOwner(page);
  await expect(page.getByRole('checkbox',{name:'Apply tax to future sales'})).not.toBeChecked();
  await page.getByRole('checkbox',{name:'Apply tax to future sales'}).check();
  await page.getByRole('combobox',{name:'Tax registration status'}).selectOption('registered');
  await page.getByRole('textbox',{name:'Tax rate percent'}).fill('10');
  await page.getByRole('combobox',{name:'Tax price mode'}).selectOption('exclusive');
  await page.getByRole('button',{name:'Save tax settings',exact:true}).click();
  await expect.poll(()=>page.evaluate(async()=>{const {db}=await import('/src/db/TallybookDB.ts');return (await db.businessProfiles.get('primary'))?.taxPolicy?.enabled;})).toBe(true);
  await page.evaluate(async () => {
    const {createProduct}=await import('/src/features/inventory/inventory.ts');
    const {createCustomer}=await import('/src/features/customers/customers.ts');
    const {prepareQuotationHandoff}=await import('/src/features/customers/quotationHandoff.ts');
    const product=await createProduct({name:'Rice',categoryId:'uncategorized',sellingPrice:'10',costPrice:'1',initialStock:'3',lowStockThreshold:'1'},'GHS');
    const customer=await createCustomer({name:'Test Customer',phone:'0200000000',status:'active'});
    const token=prepareQuotationHandoff({companyId:'primary',currency:'GHS',customerId:customer.id,lines:[{productId:product.id,quantity:2,priceMinor:1000}]});
    history.pushState(null,'',`/quotations?draft=${token}`);window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByText('Rice × 2',{exact:true})).toBeVisible();
  await expect(page.getByText(/Total offer:.*22/)).toBeVisible();
  await page.getByRole('button',{name:'Save draft quotation',exact:true}).click();
  await expect(page.getByText('DRAFT',{exact:true})).toBeVisible();
  const records=await page.evaluate(async()=>{const {db}=await import('/src/db/TallybookDB.ts');return {quotes:await db.quotations.toArray(),sales:await db.sales.count(),product:await db.products.toArray()};});
  expect(records.quotes).toHaveLength(1);expect(records.quotes[0]).toMatchObject({totalMinor:2200,tax:{taxMinor:200}});
  expect(records.sales).toBe(0);expect(records.product[0].stockQuantity).toBe(3);
});

test('a populated v35 ledger preserves company-scoped financial history and owner locks across reopen', async ({page}) => {
  await page.goto('/');
  const result = await page.evaluate(async schema => {
    const {TallybookDB, initializeDatabase} = await import('/src/db/TallybookDB.ts');
    const Dexie = Object.getPrototypeOf(TallybookDB);
    const name = 'release-populated-' + crypto.randomUUID();
    const old = new Dexie(name);
    old.version(35).stores(schema);
    const at = '2026-09-01T08:30:00.000Z';
    const tables = ['sales','saleLines','payments','purchases','supplierPayableEntries'];
    const snapshot = async db => Object.fromEntries(await Promise.all(tables.map(async table =>
      [table,await db.table(table).orderBy(':id').toArray()])));
    let upgraded;
    try {
      await old.open();
      for (const [company,units] of [['primary',2],['second',3]]) {
        const total = units * 250, saleId = company+'-sale', purchaseId = company+'-purchase';
        await old.table('businessProfiles').put({id:company,name:'Fixture '+company,country:'Ghana',currency:'GHS',createdAt:at,updatedAt:at});
        await old.table('sales').put({id:saleId,businessProfileId:company,receiptNumber:1,createdAt:at,
          paymentMethod:'cash',submissionKey:'sale-retry-1',currency:'GHS',subtotalMinor:total,discountMinor:0,
          totalMinor:total,amountPaidMinor:total,outstandingMinor:0});
        await old.table('saleLines').put({id:company+'-line',businessProfileId:company,saleId,productId:'sku-'+company,
          quantity:units,unitPriceMinor:250,lineTotalMinor:total});
        await old.table('payments').put({id:company+'-payment',businessProfileId:company,saleId,method:'cash',amountMinor:total,createdAt:at});
        await old.table('purchases').put({id:purchaseId,businessProfileId:company,supplierId:'supplier-'+company,
          submissionKey:'purchase-retry-1',currency:'GHS',totalCostMinor:1000,createdAt:at,purchaseDate:'2026-09-01'});
        await old.table('supplierPayableEntries').put({id:company+'-recognition',businessProfileId:company,purchaseId,
          supplierId:'supplier-'+company,currency:'GHS',amountMinor:1000,kind:'recognition',submissionKey:'liability-retry-1',createdAt:at});
      }
      await old.table('staffMembers').put({id:'fixture-owner',businessProfileId:'primary',name:'Fixture owner',role:'owner',createdAt:at});
      const before = await snapshot(old);
      old.close();
      upgraded = new TallybookDB(name);
      await initializeDatabase(upgraded);
      upgraded.close();
      await upgraded.open();
      return {before,after:await snapshot(upgraded),
        governed:(await upgraded.businessProfiles.get('primary')).staffGovernanceEnabled,
        otherGoverned:(await upgraded.businessProfiles.get('second')).staffGovernanceEnabled === true,
        events:await upgraded.centralSaleEvents.count() + await upgraded.centralOperationalEvents.count()};
    } finally {old.close(); upgraded?.close(); await Dexie.delete(name);}
  }, schemas[35]);
  expect(result.after).toEqual(result.before);
  expect(result.after.sales.map(s => s.totalMinor)).toEqual([500,750]);
  expect(result.governed).toBe(true);
  expect(result.otherGoverned).toBe(false);
  expect(result.events).toBe(0);
});

test('two private IndexedDB ledgers and the original survive tab workspace round trips', async ({page}) => {
  await page.goto('/');
  const visit = async (owner, value) => {
    await page.evaluate(owner => {
      if (owner) sessionStorage.setItem('tallybook.workspace.tab.v1', owner);
      else sessionStorage.removeItem('tallybook.workspace.tab.v1');
    }, owner);
    await page.reload();
    return page.evaluate(async value => {
      const {db} = await import('/src/db/TallybookDB.ts');
      if (value !== null) await db.appMeta.put({key:'fixture-recovery',value,updatedAt:'2026-11-01T00:00:00Z'});
      return (await db.appMeta.get('fixture-recovery'))?.value;
    },value);
  };
  await visit(null,'original');
  await visit('synthetic-a','owner A');
  await visit('synthetic-b','owner B');
  expect(await visit(null,null)).toBe('original');
  expect(await visit('synthetic-a',null)).toBe('owner A');
  expect(await visit('synthetic-b',null)).toBe('owner B');
});

test('loss of the synthetic device key preserves an unreadable pending sale through reload and flush', async ({page}) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const {submitSale} = await import('/src/cloud/shopOutbox.ts');
    await submitSale({userId:'fixture-owner',companyId:'fixture-company'},
      {submissionKey:'fixture-sale-00000001',storeId:'fixture-store',
        lines:[{productId:'fixture-product',quantity:1}],
        tenders:[{method:'cash',amountMinor:500,tenderedMinor:500}]}, 'Synthetic sale', async () => {throw Error('offline');});
    const db = await new Promise((resolve,reject) => {
      const open = indexedDB.open('tallybook-secure');
      open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error);
    });
    const tx = db.transaction('keys','readwrite');
    tx.objectStore('keys').clear();
    await new Promise((resolve,reject) => {tx.oncomplete=resolve; tx.onabort=()=>reject(tx.error);});
    db.close();
  });
  await page.reload();
  const result = await page.evaluate(async () => {
    const {readOutbox,flushOutbox,dismissQueuedSale} = await import('/src/cloud/shopOutbox.ts');
    const scope = {userId:'fixture-owner',companyId:'fixture-company'};
    let sends = 0;
    await flushOutbox(scope,async () => {sends++; throw Error('unexpected send');});
    const dismissed = await dismissQueuedSale(scope,'fixture-sale-00000001');
    const [row] = await readOutbox(scope);
    return {sends,dismissed,status:row?.status,unreadable:row?.unreadable};
  });
  expect(result).toEqual({sends:0,dismissed:false,status:'needs-review',unreadable:true});
});

test('two tabs without Web Locks keep one usable AES key during simultaneous first use', async ({page,context}) => {
  const peer = await context.newPage();
  await Promise.all([page.goto('/'),peer.goto('/')]);
  let arrived = 0;
  let release;
  const barrier = new Promise(resolve => {release = resolve;});
  for (const tab of [page,peer]) {
    await tab.exposeFunction('keyGenerationBarrier',async () => {
      if (++arrived === 2) release();
      await barrier;
    });
    await tab.evaluate(() => {
      Object.defineProperty(navigator,'locks',{configurable:true,value:undefined});
      const original = crypto.subtle.generateKey.bind(crypto.subtle);
      crypto.subtle.generateKey = async (...args) => {
        if (args[0]?.name === 'AES-GCM') await window.keyGenerationBarrier();
        return original(...args);
      };
    });
  }
  const [first,second] = await Promise.all([page,peer].map((tab,i) => tab.evaluate(async i => {
    const {deviceSealer} = await import('/src/cloud/secureStorage.ts');
    return (await deviceSealer()).seal('record-'+i,'synthetic-context');
  },i)));
  for (const [tab,record,expected] of [[page,second,'record-1'],[peer,first,'record-0']]) {
    expect(await tab.evaluate(async record => {
      const {deviceSealer} = await import('/src/cloud/secureStorage.ts');
      return (await deviceSealer()).open(record,'synthetic-context');
    },record)).toBe(expected);
  }
});
