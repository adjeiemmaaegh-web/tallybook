import assert from 'node:assert/strict';
import test from 'node:test';
import {openStockCount} from '../client/src/cloud/purchaseRetry.ts';

test('a count committed before disconnect is replayed once after reopening the panel', async () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  const counts = new Set();
  let disconnect = true;
  const start = async (company, input) => {
    assert.equal(company, 'test-shop');
    counts.add(input.countId);
    if (disconnect) {
      disconnect = false;
      throw Error('response lost');
    }
  };
  const submit = () => openStockCount('test-owner', 'test-shop',
    {storeId:'test-store', productId:'test-product'}, storage, start);
  await assert.rejects(submit(), /response lost/);
  await submit();
  assert.equal(counts.size, 1);
  await submit();
  assert.equal(counts.size, 2);
});
