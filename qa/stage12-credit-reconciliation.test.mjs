import test from 'node:test';
import assert from 'node:assert/strict';
import { checkedMinorSum, checkedCreditExposure, reconcileCreditLedger } from '../client/src/features/sales/creditLedger.mjs';
const sale = (id, outstandingMinor, customerId = 'customer-a') => ({ id, customerId, outstandingMinor });
const reversal = (originalSaleId, reversedOutstandingMinor, customerId = 'customer-a') => ({ originalSaleId, reversedOutstandingMinor, customerId });
const repayment = (amountMinor) => ({ amountMinor });

test('credit exposure subtracts persisted NEGATIVE reversal deltas and repayments before extending credit', () => {
  const sales = [sale('s1', 500), sale('s2', 200)];
  const reversals = [reversal('s2', -200)];
  assert.deepEqual(reconcileCreditLedger(sales, reversals, [repayment(200)]), { salesOutstandingMinor: 500, repaidMinor: 200, outstandingMinor: 300 });
  assert.equal(checkedCreditExposure(sales, reversals, [repayment(200)], 30), 330);
});
test('full reversal frees exactly its original unpaid credit and cannot create an artificial balance', () => {
  assert.equal(checkedCreditExposure([sale('s1', 400)], [reversal('s1', -400)], [], 150), 150);
  assert.equal(checkedCreditExposure([sale('s1', 0)], [reversal('s1', 0)], [], 0), 0);
});
test('rejects positive reversal amounts or wrong reversal magnitude', () => {
  for (const amount of [100, -99, -101, 0, NaN, 1.5]) {
    assert.throws(() => reconcileCreditLedger([sale('s1', 100)], [reversal('s1', amount)], []), /reversal/);
  }
});
test('rejects orphan/duplicate reversals, duplicated sales, mismatched customers and invalid identities', () => {
  assert.throws(() => reconcileCreditLedger([], [reversal('unknown', -50)], []), /reversal/);
  assert.throws(() => reconcileCreditLedger([sale('s1', 100)], [reversal('s1', -100), reversal('s1', -100)], []), /reversal/);
  assert.throws(() => reconcileCreditLedger([sale('s1', 100), sale('s1', 100)], [], []), /identities/);
  assert.throws(() => reconcileCreditLedger([sale('s1', 100)], [reversal('s1', -100, 'foreign-customer')], []), /reversal/);
  assert.throws(() => reconcileCreditLedger([{ id: '', outstandingMinor: 100 }], [], []), /identities/);
});
test('rejects unsafe sums, negative and fractional source values', () => {
  assert.throws(() => checkedMinorSum([repayment(Number.MAX_SAFE_INTEGER), repayment(1)], 'amountMinor'));
  assert.throws(() => checkedMinorSum([repayment(-1)], 'amountMinor'));
  assert.throws(() => checkedMinorSum([repayment(1.5)], 'amountMinor'));
  assert.throws(() => checkedCreditExposure([sale('s1', Number.MAX_SAFE_INTEGER)], [], [], 1));
  assert.throws(() => checkedCreditExposure([sale('s1', Number.MAX_SAFE_INTEGER), sale('s2', 1)], [], [], 0));
});
test('rejects over-repayment or negative net exposure, not silently clamping to zero', () => {
  assert.throws(() => checkedCreditExposure([], [], [repayment(3)], 5), /reconciliation/);
  assert.throws(() => checkedCreditExposure([sale('s1', 100)], [reversal('s1', -100)], [repayment(1)]), /reconciliation/);
  assert.throws(() => checkedCreditExposure([], [], [], -1));
});
test('allows an exactly settled customer to receive new credit', () => {
  assert.equal(checkedCreditExposure([sale('s1', 200)], [], [repayment(200)], 300), 300);
});
