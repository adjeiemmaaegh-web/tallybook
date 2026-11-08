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
  await expect(page.getByRole('heading',{name:'Welcome to Tallybook'})).toBeVisible();
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
