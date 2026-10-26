import { test, expect } from '@playwright/test';

test.beforeEach(async ({page}) => {
  page.on('pageerror', error => console.error(error.message));
  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());
});

test('signed-out cloud account is denied without blocking offline sales', async ({page}) => {
  await page.goto('/cloud-account', {waitUntil:'domcontentloaded'});
  await expect(page).toHaveURL(/\/signin$/);
  await expect(page.getByRole('button', {name:'Sign in with Google'})).toBeVisible();
  expect(await page.evaluate(async () => (await indexedDB.databases()).some(db => db.name === 'tallybook-db'))).toBe(false);

  await page.goto('/sales', {waitUntil:'domcontentloaded'});
  await expect(page).toHaveURL(/\/sales$/);
  await expect(page.getByRole('link', {name:'Set up business'})).toBeVisible();
});

test('a local owner PIN locks and unlocks the business workspace', async ({page}) => {
  await page.goto('/business', {waitUntil:'domcontentloaded'});
  await page.getByRole('textbox', {name:'Business name'}).fill('Auth Browser Test');
  await page.getByRole('combobox', {name:'Business type'}).click();
  await page.getByRole('option', {name:'Retail shop'}).click();
  await page.getByRole('button', {name:'Save business'}).click();
  await expect(page.locator('#main-content').getByText('Auth Browser Test is saved on this device.')).toBeVisible();

  await page.goto('/staff', {waitUntil:'domcontentloaded'});
  await page.getByRole('textbox', {name:'Staff name'}).fill('Test Owner');
  await page.getByRole('textbox', {name:'New staff PIN'}).fill('123456');
  await page.getByRole('button', {name:'Create staff'}).click();
  await expect(page.getByRole('option', {name:'Test Owner (owner)'})).toBeAttached();

  await page.goto('/sales', {waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading', {name:'Tallybook is locked'})).toBeVisible();
  await page.goto('/staff', {waitUntil:'domcontentloaded'});
  await page.getByRole('combobox', {name:'Staff member'}).selectOption({label:'Test Owner (owner)'});
  await page.getByRole('textbox', {name:'Staff PIN'}).fill('123456');
  await page.getByRole('button', {name:'Unlock', exact:true}).click();
  await expect(page.getByRole('button', {name:'Lock this session'})).toBeVisible();
  await page.getByRole('textbox', {name:'Staff name'}).fill('Test Cashier');
  await page.getByRole('textbox', {name:'New staff PIN'}).fill('654321');
  await page.getByRole('button', {name:'Create staff'}).click();
  await expect(page.getByText('Test Cashier — cashier')).toBeVisible();
  await page.getByRole('button', {name:'Lock this session'}).click();
  await page.getByRole('combobox', {name:'Staff member'}).selectOption({label:'Test Cashier (cashier)'});
  await page.getByRole('textbox', {name:'Staff PIN'}).fill('654321');
  await page.getByRole('button', {name:'Unlock', exact:true}).click();
  await expect(page.getByRole('button', {name:'Lock this session'})).toBeVisible();
  await expect(page.getByRole('button', {name:'Create staff'})).toHaveCount(0);
  // A full reload deliberately clears the in-memory PIN session. Navigate
  // within the app to verify the current unlocked session instead.
  await page.getByRole('link', {name:'Sales (POS)'}).click();
  await expect(page.getByRole('heading', {name:'Add stock before you open the receipt.'})).toBeVisible();
});
