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
    await page.goto('/shop', { waitUntil: 'domcontentloaded' });

    const heading = page.getByRole('heading', { name: 'Run your shop from your phone', exact: true });
    const signIn = page.getByRole('link', { name: 'Sign in or create an account', exact: true });
    await expect(heading).toBeVisible();
    await expect(signIn).toBeVisible();
    await expect(signIn).toHaveAttribute('href', '/signin');
    await expect(page.getByText('Sell offline.', { exact: false })).toBeVisible();
    await expect(page.getByText('You stay in control.', { exact: false })).toBeVisible();
    await expect(page.getByText('Clear records.', { exact: false })).toBeVisible();

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
    await expect(page.getByRole('heading', { name: 'Tallybook account' })).toBeVisible();
    expect(errors, 'Navigation to sign-in must not raise client exceptions').toEqual([]);
  });
}
