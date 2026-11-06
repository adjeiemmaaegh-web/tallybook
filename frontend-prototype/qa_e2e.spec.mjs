import {test,expect} from '@playwright/test';
const pages=['dashboard','pos','sales','inventory','products','online-orders','purchases','quotations','stocktake','transfers','customers','expenses','reports','accounting','receipts','team','settings','profile','offline-queue','stages','qa'];
test('all business screens render without runtime errors',async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const route of pages){await page.goto('/#'+route);await expect(page.locator('.topbar h1')).not.toBeEmpty();await expect(page.locator('#main-content')).toContainText('TALLYBOOK');}
 expect(errors).toEqual([]);
 await page.goto('/#dashboard');await page.screenshot({path:info.outputPath('dashboard.png'),fullPage:true});
});
test('owner and employee first-run journeys',async({page})=>{
 await page.goto('/');await expect(page.getByText('Sell offline.')).toBeVisible();
 await page.locator('button[data-nav="role"]').first().click();
 await expect(page.getByText('I own this business')).toBeVisible();
 await page.locator('[data-nav="employee"]').click();
 await expect(page.getByText('Your employee ID')).toBeVisible();
 await page.locator('button[data-nav="role"]').first().click();
 await page.locator('[data-nav="business"]').click();
 await expect(page.getByText('Step 1 of 2')).toBeVisible();
 await page.getByLabel('Business name').fill('Test Business');
 await page.locator('button[data-category="Grocery"]').click();
 await page.locator('form[data-form="business"] button[type="submit"]').click();
 await expect(page.getByText('Step 2 of 2')).toBeVisible();
 await page.getByLabel('Store name').fill('Main Store');
 await page.locator('form[data-form="store"] button[type="submit"]').click();
 await expect(page.getByText('You’re ready')).toBeVisible();
 await page.locator('button[data-nav="dashboard"]').first().click();
 await expect(page.locator('h2').first()).toContainText('Good to see you');
});
test('sample checkout is functional but makes no network requests',async({page},info)=>{
 const remote=[];page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:4174/'))remote.push(r.url());});
 await page.goto('/#pos');
 await page.locator('button[data-add-cart="P101"]').first().click();
 await page.locator('button[data-action="checkout"]').click();
 await expect(page.getByRole('dialog')).toContainText('Review checkout');
 await page.locator('form[data-form="checkout"] button[type="submit"]').click();
 await expect(page.getByRole('dialog')).toContainText('Sample receipt');
 await expect(page.getByRole('dialog')).toContainText('no sale or payment has been posted');
 await page.screenshot({path:info.outputPath('simulated-receipt.png'),fullPage:true});
 expect(remote).toEqual([]);
});
test('empty, offline, loading and error presentation states',async({page})=>{
 await page.goto('/#inventory');await page.locator('#preview-mode').selectOption('empty');
 await expect(page.getByText('No items found')).toBeVisible();
 await page.goto('/#pos');await expect(page.getByText('No products found')).toBeVisible();
 await page.locator('#preview-mode').selectOption('offline');
 await expect(page.getByText('Offline preview.')).toBeVisible();
 await page.locator('#preview-mode').selectOption('loading');
 await expect(page.getByText('Downloading catalogue…')).toBeVisible();
 await page.locator('#preview-mode').selectOption('error');
 await expect(page.getByText('Catalogue synchronization failed.')).toBeVisible();
});
test('mobile menu, search and filter interactions',async({page},info)=>{
 await page.goto('/#dashboard');
 if(info.project.name==='mobile-chromium'){
   await page.getByRole('button',{name:'Open menu'}).click();
   await expect(page.locator('.sidebar')).toHaveClass(/open/);
   await page.locator('a.side-link[data-nav="products"]').click();
 }else{
   await page.locator('a.side-link[data-nav="products"]').click();
 }
 await expect(page.locator('.topbar h1')).toHaveText('Products');
 await page.locator('#global-search').fill('jasmine');
 await expect(page.getByText('Premium Jasmine Rice 5kg')).toBeVisible();
 await page.screenshot({path:info.outputPath('products-filter.png'),fullPage:true});
});
