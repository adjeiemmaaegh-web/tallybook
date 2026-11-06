// Stage B: the public root is now guarded by a verified owner-account
// boundary. The old screenshot spec bootstrapped an unauthenticated local
// company in IndexedDB and expected to bypass the owner gate. That expectation
// is no longer valid. Visual coverage of an authenticated owner dashboard
// requires a separate controlled account fixture in Stage C.
import { test, expect } from '@playwright/test';

test('signed-out visitors cannot bypass the owner device ledger on desktop and mobile', async ({page}, testInfo) => {
  for (const viewport of [
    {width:1536,height:1024}, {width:1440,height:900}, {width:1024,height:768},
    {width:768,height:1024}, {width:390,height:844}, {width:320,height:700}
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/', {waitUntil:'domcontentloaded'});
    // CI intentionally has no real Supabase credentials. In that environment
    // the secure entry gate shows an account-verification error instead of
    // exposing the ledger. An authenticated cloud configuration redirects to
    // /account. Both must fail closed.
    await expect(page.getByRole('heading', {
      name:/Tallybook account|We couldn't check your account|Connect once to open Tallybook/
    })).toBeVisible();
    await expect(page.getByRole('heading',{name:'Sales Overview'})).toHaveCount(0);
    await expect(page.locator('.premium-kpis')).toHaveCount(0);
    const dims = await page.evaluate(() => ({
      scroll:document.documentElement.scrollWidth,
      client:document.documentElement.clientWidth
    }));
    expect(dims.scroll, `Login page must not overflow at ${viewport.width}px`)
      .toBeLessThanOrEqual(dims.client + 1);
    await page.screenshot({path:testInfo.outputPath(`signed-out-entry-${viewport.width}.png`),fullPage:true});
  }
});
