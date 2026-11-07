import {test, expect} from '@playwright/test';

test('new local device shows reference-inspired first-run page without claiming cloud signup is required',async({page},info)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading',{name:/Your business\.\s*Beautifully in hand/i})).toBeVisible();
  await expect(page.getByRole('link',{name:/Set up this device/})).toHaveAttribute('href','/business');
  await expect(page.getByRole('link',{name:/Use a shared shop/})).toHaveAttribute('href','/shop');
  await expect(page.getByText(/Local records stay in this browser/)).toBeVisible();
  await expect(page.locator('.tb-welcome-phone')).toBeVisible();
  await page.screenshot({path:info.outputPath('first-run-local.png'),fullPage:true});
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
  await expect(page.getByRole('link',{name:/Open the local workspace/})).toHaveAttribute('href','/');
  await expect(page.locator('.tb-account-form')).toBeVisible();
  // Authentication must still be handled by the real Supabase account page;
  // do not submit credentials or simulate account creation in visual QA.
  await page.screenshot({path:info.outputPath('real-auth.png'),fullPage:true});
  expect(errors).toEqual([]);
});

test('local dashboard and operations retain real routes, data placeholders and readable mobile surfaces',async({page},info)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/business');
  await page.evaluate(async()=>{
    const {saveBusinessProfile}=await import('/src/features/business/businessProfile.ts');
    await saveBusinessProfile({name:'Reference QA Shop',country:'Ghana',currency:'GHS',businessType:'Retail'});
  });
  for(const viewport of [{width:390,height:844},{width:768,height:1024},{width:1440,height:900}]){
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.getByRole('heading',{name:'Good to see you'})).toBeVisible();
    await expect(page.getByLabel('Today at the till')).toBeVisible();
    await expect(page.getByRole('link',{name:/Open POS/})).toHaveAttribute('href','/sales');
    await expect(page.getByRole('link',{name:/Add product/}).first()).toHaveAttribute('href','/inventory');
    await expect(page.getByText('Reference QA Shop',{exact:false}).first()).toBeVisible();
    await expect(page.locator('.tb-dashboard-till-total')).not.toBeEmpty();
    for(const route of ['/inventory','/sales','/purchases','/customers','/reports']){
      await page.goto(route);
      await expect(page.locator(`${route==='\/inventory'?'.inventory-hero':route==='\/sales'?'.sales-hero':route==='\/purchases'?'.purchases-hero':route==='\/customers'?'.customers-hero':'.reports-hero'}`)).toBeVisible();
      const size=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
      expect(size.scroll,route+' should not force horizontal scrolling at '+viewport.width).toBeLessThanOrEqual(size.client+1);
    }
    await page.goto('/');
    await page.screenshot({path:info.outputPath('real-dashboard-'+viewport.width+'.png'),fullPage:true});
  }
  expect(errors).toEqual([]);
});
