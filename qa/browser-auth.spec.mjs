import { test, expect } from '@playwright/test';

test.beforeEach(async ({page}) => {
  page.on('pageerror', error => console.error(error.message));
  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());
});

test('a signed-out account page stays outside the ledger', async ({page}) => {
  await page.goto('/cloud-account');
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole('heading', {name:'Welcome to Tallybook'})).toBeVisible();
  expect(await page.evaluate(async () => (await indexedDB.databases()).some(db => db.name === 'tallybook-db'))).toBe(false);
  await page.goto('/sales');
  await expect(page.getByRole('link', {name:'Set up business'})).toBeVisible();
  await expect(page.getByRole('button', {name:'Complete sale'})).toHaveCount(0);
});

test('a local owner PIN locks and unlocks the business workspace', async ({page}) => {
  await page.goto('/business', {waitUntil:'domcontentloaded'});
  await page.getByRole('textbox', {name:'Business name'}).fill('Auth Browser Test');
  await page.getByRole('combobox', {name:'Business type'}).click();
  await page.getByRole('option', {name:'Retail shop'}).click();
  await page.getByRole('button', {name:'Save business'}).click();
  await expect(page.getByRole('link',{name:'Go to staff unlock'})).toBeVisible();

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
  await expect(page.getByRole('link', {name:'Open Tallybook account'})).toHaveCount(0);
  await page.getByRole('combobox', {name:'Staff member'}).selectOption({label:'Test Cashier (cashier)'});
  await page.getByRole('textbox', {name:'Staff PIN'}).fill('654321');
  await page.getByRole('button', {name:'Unlock', exact:true}).click();
  await expect(page.getByRole('button', {name:'Lock this session'})).toBeVisible();
  await expect(page.getByRole('button', {name:'Create staff'})).toHaveCount(0);
  // A full reload deliberately clears the in-memory PIN session. Navigate
  // within the app to verify the current unlocked session instead.
  const cashierNav = page.getByRole('navigation', {name:'Cashier navigation'});
  await expect(cashierNav).toBeVisible();
  await expect(page.getByRole('link', {name:'Reports', exact:true})).toHaveCount(0);
  await page.evaluate(() => window.history.pushState(null, '', '/reports'));
  await expect(page).toHaveURL(/\/sales$/);
  await expect(cashierNav.getByRole('link', {name:'Sales', exact:true})).toHaveAttribute('aria-current','page');
  await cashierNav.getByRole('link', {name:'Sales',exact:true}).click();
  await expect(page.getByRole('heading', {name:'Add stock before you open the receipt.'})).toBeVisible();
});

test('missing staff rows cannot reopen a protected local business', async ({page}) => {
  await page.goto('/business', {waitUntil:'domcontentloaded'});
  await page.getByRole('textbox', {name:'Business name'}).fill('Protected Browser Test');
  await page.getByRole('combobox', {name:'Business type'}).click();
  await page.getByRole('option', {name:'Retail shop'}).click();
  await page.getByRole('button', {name:'Save business'}).click();
  await expect(page.getByRole('link',{name:'Go to staff unlock'})).toBeVisible();
  await page.goto('/staff', {waitUntil:'domcontentloaded'});
  await page.getByRole('textbox', {name:'Staff name'}).fill('Protected Owner');
  await page.getByRole('textbox', {name:'New staff PIN'}).fill('123456');
  await page.getByRole('button', {name:'Create staff'}).click();
  await expect(page.getByRole('option', {name:'Protected Owner (owner)'})).toBeAttached();
  await page.evaluate(async () => {
    const {db}=await import('/src/db/TallybookDB.ts');
    await db.staffMembers.clear();
  });
  await page.goto('/sales', {waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading', {name:'Tallybook is locked'})).toBeVisible();
  await page.goto('/staff', {waitUntil:'domcontentloaded'});
  await expect(page.getByRole('alert').getByText(/protected company has no staff records/i)).toBeVisible();
  await expect(page.getByRole('button', {name:'Create staff'})).toHaveCount(0);
});

test('non-extractable device key survives browser reload outside business backups',async({page})=>{
  await page.goto('/sales',{waitUntil:'domcontentloaded'});
  const scope={supabaseOrigin:'https://test.supabase.co',
    userId:'11111111-1111-4111-8111-111111111111',
    cloudCompanyId:'22222222-2222-4222-8222-222222222222',
    localCompanyId:'localA',staffId:'staffA',shopId:'shopA',deviceId:'browserKeyA'};
  const created=await page.evaluate(async scope=>{
    const {createPendingDeviceKey,activateDeviceKey}=await import('/src/features/sync/deviceKeyVault.ts');
    const user=async()=>scope.userId,local=()=>({companyId:scope.localCompanyId,staffId:scope.staffId});
    const pending=await createPendingDeviceKey(scope,user,local);
    await activateDeviceKey(scope,{companyId:scope.cloudCompanyId,storeId:scope.shopId,
      userId:scope.userId,staffId:scope.staffId,deviceId:scope.deviceId,
      publicKeyBound:true,hardwareBound:false},user,local);
    return pending.publicKeySpkiPem;
  },scope);
  expect(created).toContain('BEGIN PUBLIC KEY');
  await page.reload();
  const reloaded=await page.evaluate(async scope=>{
    const {loadActiveDeviceKey,forgetDeviceKey}=await import('/src/features/sync/deviceKeyVault.ts');
    const user=async()=>scope.userId,local=()=>({companyId:scope.localCompanyId,staffId:scope.staffId});
    const key=await loadActiveDeviceKey(scope,user,local);
    const signature=await crypto.subtle.sign('Ed25519',key,new TextEncoder().encode('reload-proof'));
    await forgetDeviceKey(scope,user,local);
    return {extractable:key.extractable,signatureBytes:signature.byteLength};
  },scope);
  expect(reloaded).toEqual({extractable:false,signatureBytes:64});
});


test('a disconnected shared till preserves a scoped sale across browser restart and posts once', async ({playwright, browserName}, info) => {
  const origin = 'http://127.0.0.1:4176';
  const scope = {userId:'fixture-attendant', companyId:'fixture-store'};
  const sale = {submissionKey:'fixture-sale-001', storeId:'store-a', clientRecordedAt:'2026-11-01T12:00:00Z',
    lines:[{productId:'rice',quantity:2}], tenders:[{method:'cash',amountMinor:900,tenderedMinor:1000}]};
  const posted = [];
  const start = async () => {
    const context = await playwright[browserName].launchPersistentContext(info.outputPath('restart-profile'), {
      headless: true,
      channel: info.project.use.channel,
    });
    try {
      await context.route(origin+'/outbox-fixture', route => route.fulfill({contentType:'text/html',body:'<title>Fixture</title>'}));
      await context.route('**/src/cloud/shopClient.ts*', route => route.fulfill({
        contentType:'application/javascript',
        body:'export class ShopRejectedError extends Error {}; export const listShopSales = async () => [];'
      }));
      const page = await context.newPage();
      await page.exposeFunction('recordFixtureSale', payload => {
        posted.push(payload);
        return {submissionKey:payload.submissionKey, receiptNumber:1};
      });
      await page.goto(origin+'/outbox-fixture');
      await page.evaluate(async () => {window.outbox = await import('/src/cloud/shopOutbox.ts');});
      return {context,page};
    } catch (error) {await context.close(); throw error;}
  };
  const first = await start();
  try {
    await first.context.setOffline(true);
    const result = await first.page.evaluate(async ({scope,sale}) => window.outbox.submitSale(scope,sale,'fixture sale',async () => {
      if (navigator.onLine) throw Error('Fixture unexpectedly online');
      throw new TypeError('Offline');
    }), {scope,sale});
    expect(result.state).toBe('queued');
  } finally {await first.context.close();}
  const second = await start();
  try {
    await second.context.setOffline(true);
    const visible = await second.page.evaluate(async scope => {
      const rows = await window.outbox.readOutbox(scope);
      const foreignUser = await window.outbox.readOutbox({...scope,userId:'other'});
      const foreignShop = await window.outbox.readOutbox({...scope,companyId:'other'});
      return {sale:rows[0]?.sale,count:rows.length,other:[foreignUser.length,foreignShop.length]};
    },scope);
    expect(visible).toEqual({sale,count:1,other:[0,0]});
    await second.context.setOffline(false);
    const delivered = await second.page.evaluate(async scope => {
      const first = await window.outbox.flushOutbox(scope,window.recordFixtureSale);
      const next = await window.outbox.flushOutbox(scope,window.recordFixtureSale);
      return [first.map(r=>r.state),next.length,(await window.outbox.readOutbox(scope)).length];
    },scope);
    expect(delivered).toEqual([['recorded'],0,0]);
    expect(posted).toEqual([sale]);
  } finally {await second.context.close();}
});


test('account settings never mounts the local ledger database',async({page})=>{
  await page.goto('/settings');
  expect(await page.evaluate(async()=> (await indexedDB.databases()).some(db=>db.name==='tallybook-db'))).toBe(false);
});
