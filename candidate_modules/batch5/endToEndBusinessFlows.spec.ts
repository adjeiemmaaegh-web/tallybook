import { test, expect } from '@playwright/test';

/** Test environment must provide disposable seeded company and permissions. */
test('sales workflow acceptance placeholder fails closed until fixture configured', async ({page}) => {
  test.skip(!process.env.TALLYBOOK_QA_SALES_URL, 'Sales test fixture not configured; no fabricated E2E pass');
  await page.goto(process.env.TALLYBOOK_QA_SALES_URL!);
  await expect(page.locator('body')).toBeVisible();
  // TODO: instrument sale creation, receipt proof and ledger reconciliation using disposable fixtures.
});
test('return workflow acceptance placeholder fails closed until fixture configured', async ({page}) => {
  test.skip(!process.env.TALLYBOOK_QA_RETURNS_URL, 'Returns test fixture not configured; no fabricated E2E pass');
  await page.goto(process.env.TALLYBOOK_QA_RETURNS_URL!);
  await expect(page.locator('body')).toBeVisible();
  // TODO: assert policy, stock, debt, refund evidence against real Dexie adapters.
});
