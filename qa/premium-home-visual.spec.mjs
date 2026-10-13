import { test, expect } from '@playwright/test';

test('premium home visual evidence on desktop and mobile with Clementia', async ({ page }, testInfo) => {
  await page.goto('/business');
  await page.evaluate(async () => {
    const { saveBusinessProfile } = await import('/src/features/business/businessProfile.ts');
    await saveBusinessProfile({ name: 'Visual QA Shop', country: 'Ghana', currency: 'GHS', businessType: 'Retail' });
  });
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Welcome to Tallybook/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Quick actions' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sales Overview' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Getting Started with Tallybook' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tips for Beginners' })).toBeVisible();
    await expect(page.locator('.today-dashboard')).toHaveCount(0);
    await expect(page.getByRole('img', { name: 'Clementia illustrated assistant' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Let Clementia assist you' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`home-${viewport.width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Let Clementia assist you' }).click();
    await expect(page.getByRole('dialog', { name: 'Clementia assistant' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`clementia-${viewport.width}.png`), fullPage: true });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Clementia assistant' })).toHaveCount(0);
    if (viewport.width < 1024) {
      await page.getByRole('button', { name: 'Open navigation menu' }).click();
      await expect(page.getByRole('dialog', { name: 'Mobile navigation' })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('mobile-navigation.png'), fullPage: true });
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: 'Mobile navigation' })).toHaveCount(0);
    }
  }
});
