import { test, expect } from '@playwright/test';

/** E2E acceptance requires a built/served app and configured baseURL. */
test('app loads and presents accessible document', async ({page}) => {
  test.skip(!process.env.TALLYBOOK_QA_BASE_URL, 'Set TALLYBOOK_QA_BASE_URL for actual app acceptance');
  await page.goto(process.env.TALLYBOOK_QA_BASE_URL!);
  await expect(page.locator('body')).toBeVisible();
  await expect(page.locator('body')).not.toBeEmpty();
});
test('offline reload explicitly requires app scenario fixtures', async ({page}) => {
  test.skip(!process.env.TALLYBOOK_QA_OFFLINE_URL, 'Dedicated offline fixture not configured');
  await page.goto(process.env.TALLYBOOK_QA_OFFLINE_URL!);
  await page.context().setOffline(true);
  await page.reload();
  await expect(page.locator('body')).toBeVisible();
});
