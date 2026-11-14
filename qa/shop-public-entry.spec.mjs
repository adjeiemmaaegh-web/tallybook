import { test, expect } from '@playwright/test';

/**
 * Public entry acceptance for the production-target /shop route.
 * Deliberately exercises a fresh, signed-out browser profile. This does not
 * require a Supabase test user or weaken the device-ledger account gate.
 * The protected local-ledger browser cases remain separate release blockers.
 */
for (const viewport of [
  { width: 390, height: 844, label: 'mobile' },
  { width: 1280, height: 900, label: 'desktop' },
]) {
  test('signed-out shared shop welcomes a new visitor on ' + viewport.label, async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const networkFailures = [];
    page.on('requestfailed', request => networkFailures.push(request.method() + ' ' + request.url() + ': ' + (request.failure()?.errorText ?? 'unknown')));
    const response = await page.goto('/shop', { waitUntil: 'domcontentloaded' });
    expect(response?.ok(), 'The public entry HTML request must succeed').toBe(true);

    const heading = page.getByRole('heading', { name: /Your business\.\s*Beautifully in hand/i });
    const signIn = page.getByRole('link', { name: 'Create your account', exact: true });
    try {
      await expect(heading).toBeVisible();
    } catch (cause) {
      // Diagnostics only: do not retry or silently pass a blank public entry.
      console.log('PUBLIC_ENTRY_FAILURE', JSON.stringify({
        browser: testInfo.project.name, viewport: viewport.label, url: page.url(),
        htmlStatus: response?.status(), body: (await page.locator('body').innerText().catch(() => 'body inaccessible')).slice(0, 900),
        clientErrors: errors, networkFailures: networkFailures.slice(0, 12)
      }));
      await page.screenshot({path: testInfo.outputPath('entry-failure.png'), fullPage: true}).catch(() => {});
      throw cause;
    }
    await expect(signIn).toBeVisible();
    await expect(signIn).toHaveAttribute('href', '/signin');
    await expect(page.getByText('Offline-first local records', { exact: false })).toBeVisible();
    await expect(page.getByText('Owner-controlled access', { exact: false })).toBeVisible();
    await expect(page.getByText('Team shop option', { exact: false })).toBeVisible();

    await expect(page.getByRole('button', {name: /complete sale/i})).toHaveCount(0);
    expect(await page.evaluate(async () => (await indexedDB.databases()).some(db => db.name === 'tallybook-db'))).toBe(false);

    const bounds = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    }));
    expect(bounds.documentWidth, 'The signed-out welcome must not overflow horizontally')
      .toBeLessThanOrEqual(bounds.viewportWidth + 1);
    expect(errors, 'The signed-out welcome must not raise uncaught client exceptions').toEqual([]);

    await page.screenshot({ path: testInfo.outputPath('shop-entry-' + viewport.label + '.png'), fullPage: true });
    await signIn.click();
    await expect(page).toHaveURL(/\/signin$/);
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    expect(errors, 'Navigation to sign-in must not raise client exceptions').toEqual([]);
  });
}
