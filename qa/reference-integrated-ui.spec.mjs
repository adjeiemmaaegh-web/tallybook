import {test, expect} from '@playwright/test';

test('public welcome links a new visitor to account entry on desktop and narrow phones',async({page},info)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/welcome');
  await expect(page.getByRole('heading',{name:/Your business\.\s*Beautifully in hand/i})).toBeVisible();
  await expect(page.getByRole('link',{name:/Create your account/})).toHaveAttribute('href','/signin');
  await expect(page.getByRole('link',{name:/I already have an account/})).toHaveAttribute('href','/signin');
  await expect(page.getByText(/Account creation and cloud access require an internet connection/)).toBeVisible();
  await expect(page.locator('.tb-welcome-phone')).toBeVisible();
  await page.screenshot({path:info.outputPath('welcome-desktop.png'),fullPage:true});
  for(const width of [390,320]){
    await page.setViewportSize({width,height:844});
    await page.screenshot({path:info.outputPath('welcome-'+width+'.png'),fullPage:true});
    const size=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
    expect(size.scroll,'public welcome must not overflow '+width+'px phones').toBeLessThanOrEqual(size.client+1);
    await expect(page.getByRole('link',{name:/Create your account/})).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('shared shop welcome directs unsigned users to the real account, with no fabricated checkout',async({page},info)=>{
  await page.goto('/shop');
  await expect(page.locator('.shop-landing .tb-welcome')).toBeVisible();
  await expect(page.getByRole('link',{name:/Create your account/})).toHaveAttribute('href','/signin');
  await expect(page.getByRole('link',{name:/I already have an account/})).toHaveAttribute('href','/signin');
  await expect(page.getByText(/Account creation and cloud access require an internet connection/)).toBeVisible();
  await expect(page.getByText(/not real financial data/i)).toHaveCount(0);
  await page.screenshot({path:info.outputPath('shared-shop-welcome.png'),fullPage:true});
});

test('account page keeps live sign-in workflow and uses account-first layout',async({page},info)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/signin');
  await expect(page.getByRole('heading',{name:'Welcome back'})).toBeVisible();
  await expect(page.getByRole('heading',{name:/Your business\.\s*Beautifully in hand/i})).toBeVisible();
  await expect(page.getByRole('link',{name:/Open your device ledger/})).toHaveAttribute('href','/');
  await expect(page.locator('.tb-account-form')).toBeVisible();
  // Authentication must still be handled by the real Supabase account page;
  // do not submit credentials or simulate account creation in visual QA.
  await page.screenshot({path:info.outputPath('real-auth.png'),fullPage:true});
  expect(errors).toEqual([]);
});

test('protected device-local ledger does not bypass owner verification for a new browser',async({page})=>{
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Good to see you'})).toHaveCount(0);
  await expect(page.locator('.tb-dashboard-till-total')).toHaveCount(0);
  await expect(page).toHaveURL(/\/welcome$/);
  expect(await page.evaluate(async () => (await indexedDB.databases()).some(db => db.name === 'tallybook-db'))).toBe(false);
});

test('verified account without a shop sees both role cards on a phone', async ({page}, info) => {
  const user = {id: 'b8841a77-6172-4f74-adbe-024b7d6c0010', email: 'tester@example.invalid', user_metadata: {}};
  await page.setViewportSize({width: 390, height: 844});
  await page.addInitScript(user => {
    localStorage.setItem('sb-qa-auth-token', JSON.stringify({
      access_token: 'role-selection-test-access-token', refresh_token: 'fixture-only',
      token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, user
    }));
  }, user);
  await page.route('https://qa.invalid/auth/v1/user', route => route.fulfill({json: user}));
  for (const table of ['businesses', 'business_members']) {
    await page.route('https://qa.invalid/rest/v1/' + table + '?**', route => route.fulfill({json: []}));
  }
  await page.goto('/signin');
  await expect(page.getByRole('heading', {name: 'What will your role be?'})).toBeInViewport();
  await expect(page.getByRole('button', {name: 'I own a business'})).toBeInViewport({ratio: 1});
  const employee = page.getByRole('button', {name: 'I work for someone else'});
  await expect(employee).toBeInViewport({ratio: 1});
  await expect(page.getByLabel('What should we call you?')).toBeHidden();
  await page.screenshot({path: info.outputPath('verified-role-selection-mobile.png')});
  await employee.click();
  await expect(page.getByLabel('Invitation code')).toBeVisible();
});

test('a verified owner opens Clementia alongside an unlinked PIN-less ledger', async ({page}) => {
  const user = {id:'b8841a77-6172-4f74-adbe-024b7d6c0010',email:'owner@example.invalid',user_metadata:{}};
  const company = '1b841a77-6172-4f74-adbe-024b7d6c0011';
  await page.addInitScript(user => {
    localStorage.setItem('sb-qa-auth-token',JSON.stringify({
      access_token:'private-ledger-fixture-access-token',refresh_token:'fixture-only',
      token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,
      user: JSON.parse(sessionStorage.getItem('qa-test-identity') || 'null') || user
    }));
  },user);
  await page.route('https://qa.invalid/auth/v1/user',route=>route.fulfill({json:user}));
  await page.route('https://qa.invalid/rest/v1/businesses?**',route=>route.fulfill({json:[{id:company,owner_id:user.id,name:'Cloud shop'}]}));
  await page.route('https://qa.invalid/rest/v1/business_members?**',route=>route.fulfill({json:[{business_id:company,user_id:user.id,role:'owner'}]}));
  await page.goto('/welcome');
  await page.evaluate(async () => {
    const {saveBusinessProfile} = await import('/src/features/business/businessProfile.ts');
    await saveBusinessProfile({name:'Original private shop',country:'Ghana',currency:'GHS',businessType:'Retail'});
  });
  await page.goto('/');
  await page.getByRole('button',{name:'Open my private workspace'}).click();
  await expect(page.getByRole('link',{name:'Enter business details'})).toBeVisible();
  await page.goto('/business');
  await page.getByRole('textbox',{name:'Business name'}).fill('New owner workspace');
  await page.getByRole('combobox',{name:'Business type'}).click();
  await page.getByRole('option',{name:'Retail shop'}).click();
  await page.getByRole('button',{name:'Save business'}).click();
  await expect.poll(() => page.evaluate(async () => {
    const {db} = await import('/src/db/TallybookDB.ts');
    return (await db.businessProfiles.toArray()).map(p=>p.name);
  })).toEqual(['New owner workspace']);
  await page.goto('/assistant');
  await expect(page.getByRole('heading',{name:/Meet Clementia/})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading',{name:/Meet Clementia/})).toBeVisible();
  expect(await page.evaluate(async () => {
    const {TallybookDB,DATABASE_NAME} = await import('/src/db/TallybookDB.ts');
    const legacy = new TallybookDB(DATABASE_NAME);
    try { return (await legacy.businessProfiles.toArray()).map(p=>p.name); }
    finally { legacy.close(); }
  })).toEqual(['Original private shop']);
  // Switch to a different Google identity in the same tab. The first
  // account's selected database is still in sessionStorage when this starts.
  const other = {...user, id:'4711ca99-43ac-4aae-aacd-73e58cdef255'};
  await page.route('https://qa.invalid/auth/v1/user',route=>route.fulfill({json:other}));
  await page.route('https://qa.invalid/rest/v1/businesses?**',route=>route.fulfill({json:[{id:company,owner_id:other.id,name:'Second shop'}]}));
  await page.route('https://qa.invalid/rest/v1/business_members?**',route=>route.fulfill({json:[{business_id:company,user_id:other.id,role:'owner'}]}));
  await page.evaluate(other => sessionStorage.setItem('qa-test-identity',JSON.stringify(other)),other);
  await page.goto('/assistant');
  await expect(page.getByRole('button',{name:'Open my private workspace'})).toBeVisible();
  await expect(page.getByText('New owner workspace',{exact:true})).toHaveCount(0);
});

test('signed-in attendant opening an owner dashboard link lands at the till and can review personal sales', async ({page}) => {
  const user = {id:'b8841a77-6172-4f74-adbe-024b7d6c0010',email:'attendant@example.invalid',user_metadata:{}};
  const company = '1b841a77-6172-4f74-adbe-024b7d6c0011';
  const owner = '1b841a77-6172-4f74-adbe-024b7d6c0012';
  await page.addInitScript(user => localStorage.setItem('sb-qa-auth-token', JSON.stringify({
    user, access_token:'navigation-fixture', refresh_token:'fixture-only', token_type:'bearer',
    expires_at:Math.floor(Date.now()/1000)+3600
  })),user);
  await page.route('https://qa.invalid/auth/v1/user',route=>route.fulfill({json:user}));
  await page.route('https://qa.invalid/rest/v1/businesses?**',route=>route.fulfill({json:[{id:company,name:'Fixture shop',owner_id:owner}]}));
  await page.route('https://qa.invalid/rest/v1/business_members?**',route=>route.fulfill({json:[{business_id:company,user_id:user.id,role:'attendant'}]}));
  await page.route('https://qa.invalid/rest/v1/rpc/tallybook_shop',route=>{
    const action = route.request().postDataJSON().p_action;
    if (action === 'listSales') return route.fulfill({json:{sales:[]}});
    if (action !== 'overview') return route.abort();
    return route.fulfill({json:{companyId:company,role:'attendant',currency:'GHS',
      stores:[{id:'store-a',name:'Fixture store',status:'active'}],products:[],stock:[],members:[],pendingInvites:[]}});
  });
  await page.goto('/shop?view=dashboard');
  const tabs = page.getByRole('navigation',{name:'Shop sections'});
  await expect(tabs.getByRole('button',{name:'Sell',exact:true})).toHaveAttribute('aria-pressed','true');
  for (const name of ['Dashboard','Team','Stock','Customers']) {
    await expect(tabs.getByRole('button',{name,exact:true})).toHaveCount(0);
  }
  await tabs.getByRole('button',{name:'My sales'}).click();
  await expect(page.getByRole('heading',{name:'My sales',exact:true})).toBeVisible();
});
