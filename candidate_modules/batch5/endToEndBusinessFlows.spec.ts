import { test } from '@playwright/test';

/** Test environment must provide disposable seeded company and permissions. */
test('sales workflow acceptance placeholder fails closed until fixture configured', async () => {
  test.skip(!process.env.TALLYBOOK_QA_SALES_URL, 'Sales test fixture not configured; no fabricated E2E pass');
  throw new Error('Unimplemented candidate: a configured URL cannot certify persisted sale, receipt and stock invariants. Run qa/browser-release.spec.mjs and the authoritative sales service tests.');
  // TODO: instrument sale creation, receipt proof and ledger reconciliation using disposable fixtures.
});
test('return workflow acceptance placeholder fails closed until fixture configured', async () => {
  test.skip(!process.env.TALLYBOOK_QA_RETURNS_URL, 'Returns test fixture not configured; no fabricated E2E pass');
  throw new Error('Unimplemented candidate: a configured URL cannot certify refund policy, stock, debt and exactly-once disbursement. Run the authoritative refund service and PostgreSQL tests.');
  // TODO: assert policy, stock, debt, refund evidence against real Dexie adapters.
});
