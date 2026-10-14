import { test, expect } from '@playwright/test';

test('premium home visual evidence on desktop and mobile with Clementia', async ({ page }, testInfo) => {
  await page.goto('/business', { waitUntil: 'networkidle' });
  await page.waitForLoadState('networkidle');
  await expect.poll(() => page.evaluate(() => document.readyState)).toBe('complete');
  await page.evaluate(async () => {
    const { saveBusinessProfile } = await import('/src/features/business/businessProfile.ts');
    await saveBusinessProfile({ name: 'Visual QA Shop', country: 'Ghana', currency: 'GHS', businessType: 'Retail' });
  });
  for (const viewport of [{ width: 1536, height: 1024 }, { width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 700 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Welcome to Tallybook/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Quick actions' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sales Overview' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Getting Started with Tallybook' })).toBeVisible();
    await expect(page.locator('.premium-step-cta')).toHaveCount(5);
    await expect(page.locator('.premium-step.done .premium-step-cta')).toContainText(['Review setup']);
    await expect(page.locator('.premium-step:not(.done) .premium-step-cta')).toHaveCount(4);
    await expect(page.locator('.premium-step:not(.done) .premium-step-cta').first()).toHaveText('Get started →');
    await expect(page.getByRole('heading', { name: 'Tips for Beginners' })).toBeVisible();
    await expect(page.locator('.today-dashboard')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Expenses Today' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Search products in inventory' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'View alerts' })).toBeVisible();
    if (viewport.width >= 1024) {
      await expect(page.locator('.premium-rail-setup')).toBeVisible();
      await expect(page.locator('.premium-rail-setup')).toHaveAttribute('href', '/#getting-started');
      await expect(page.locator('#getting-started')).toBeVisible();
      await expect(page.locator('.clementia-launcher-label')).toBeVisible();
      await page.locator('.premium-rail-setup').click();
      await expect(page).toHaveURL(/#getting-started$/);
      await expect(page.locator('#getting-started')).toBeVisible();
    }
    await expect(page.locator('.premium-line-chart svg')).toBeVisible();
    const layout = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(layout.scroll, `Horizontal overflow at ${viewport.width}px`).toBeLessThanOrEqual(layout.client + 1);
    await expect(page.locator('.premium-line-chart svg polyline')).toHaveCount(1);
    await expect(page.locator('.premium-line-chart svg text')).toHaveCount(5);
    const ticks = await page.locator('.premium-line-chart svg text').allTextContents();
    expect(new Set(ticks).size).toBe(5);
    await expect(page.locator('.premium-step.done')).toHaveCount(1);
    await expect(page.locator('.premium-chart-empty-note')).toContainText('No sales yet');
    await expect(page.locator('.clementia-launcher .clementia-avatar svg')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Let Clementia assist you' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`home-${viewport.width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Let Clementia assist you' }).click();
    await expect(page.getByRole('dialog', { name: 'Clementia assistant' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`clementia-${viewport.width}.png`), fullPage: true });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Clementia assistant' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Let Clementia assist you' })).toBeFocused();
    if (viewport.width < 640) {
      await expect(page.getByRole('link', { name: 'Business settings' })).toBeHidden();
      await expect(page.getByRole('link', { name: 'Backup', exact: true })).toBeHidden();
      await expect(page.getByRole('link', { name: 'View alerts' })).toBeVisible();
      const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      if (width.scroll > width.client + 1) {
        const offenders = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > document.documentElement.clientWidth + 1 && getComputedStyle(el).position !== 'fixed'; }).slice(0, 12).map(el => ({ tag: el.tagName, className: String(el.className).slice(0, 100), right: Math.round(el.getBoundingClientRect().right) })));
        console.log('Mobile overflow offenders:', JSON.stringify(offenders));
      }
      expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
    }
    if (viewport.width < 1024) {
      await page.getByRole('button', { name: 'Open navigation menu' }).click();
      await expect(page.getByRole('dialog', { name: 'Mobile navigation' })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('mobile-navigation.png'), fullPage: true });
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: 'Mobile navigation' })).toHaveCount(0);
    }
  }
});
