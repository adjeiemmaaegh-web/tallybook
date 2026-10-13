import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { withCrossTabDataLock, TWO_DATABASE_LOCK_NAME } from '../client/src/features/backup/crossTabDataLock.mjs';

// Architectural coverage tests only: the client Dexie/React integration suite
// is still required before treating browser writes as verified.
const servicePaths = [
  ['sales/sales.ts', 'completeSale'],
  ['customers/quotations.ts', 'convertQuotationToSale'],
  ['purchases/purchases.ts', 'completePurchase'],
  ['inventory/inventory.ts', 'adjustStock'],
  ['purchases/supplierPayables.ts', 'recognizeUnpaidPurchase'],
  ['purchases/supplierPayables.ts', 'recordSupplierSettlement'],
  ['assistant/reversals.ts', 'executeLatestSaleReversal'],
  ['sales/cashPartialReturnPosting.ts', 'recordConfirmedCashPartialReturn'],
];
for (const [file, name] of servicePaths) {
  test(`retail write entrypoint ${name} acquires a Web Lock before starting its transaction`, () => {
    const source = readFileSync(new URL(`../client/src/features/${file}`, import.meta.url), 'utf8');
    const exported = source.indexOf(`export async function ${name}(`);
    const privateFunction = source.indexOf(`async function ${name}WhileLocked(`);
    assert.ok(exported >= 0 && privateFunction > exported, 'export must wrap a private transaction implementation');
    const guard = source.slice(exported, privateFunction);
    assert.match(guard, /withCrossTabDataLock\(["']shared["'],\s*\(\)\s*=>/);
    const body = source.slice(privateFunction);
    assert.match(body, /return database\.transaction\(["']rw["']/);
  });
}

test('nested quotation checkout uses the already-held outer transaction and does not await a new Web Lock', () => {
  const source = readFileSync(new URL('../client/src/features/sales/sales.ts', import.meta.url),'utf8');
  const begin = source.indexOf('export async function completeSale(');
  const end = source.indexOf('async function completeSaleWhileLocked(', begin);
  assert.match(source.slice(begin,end), /Dexie\.currentTransaction\s*\?/);
  const quote = readFileSync(new URL('../client/src/features/customers/quotations.ts', import.meta.url),'utf8');
  const exported = quote.indexOf('export async function convertQuotationToSale(');
  const privateFunction = quote.indexOf('async function convertQuotationToSaleWhileLocked(',exported);
  assert.match(quote.slice(exported,privateFunction), /withCrossTabDataLock\(["']shared["']/);
});

test('an exclusive recovery lock prevents starting a retail write, then releases on completion', async () => {
  let release;
  const waiting = new Promise(resolve => {release=resolve;});
  let locked = false;
  const manager = {
    async request(name, options, callback) {
      assert.equal(name, TWO_DATABASE_LOCK_NAME);
      assert.equal(options.ifAvailable, true);
      if (locked) return callback(null);
      locked = true;
      try { return await callback({name, mode:options.mode}); }
      finally { locked = false; }
    },
  };
  let entered;
  const acquired = new Promise(resolve => {entered=resolve;});
  const recovery = withCrossTabDataLock('exclusive', async () => {entered(); await waiting;}, manager);
  await acquired;
  let attempted = 0;
  await assert.rejects(withCrossTabDataLock('shared', () => {attempted++;}, manager), /Another tab/);
  assert.equal(attempted, 0, 'retail transaction must not start under an exclusive recovery lock');
  release();
  await recovery;
  assert.equal(await withCrossTabDataLock('shared', () => {attempted++; return 'committed';}, manager), 'committed');
  assert.equal(attempted, 1);
});
