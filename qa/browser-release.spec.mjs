import {unlockFixtureOwner} from './local-owner-fixture.mjs';
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const { schemas } = JSON.parse(readFileSync(new URL('./fixtures/legacy-schemas.json', import.meta.url), 'utf8'));

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
