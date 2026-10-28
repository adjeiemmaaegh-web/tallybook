import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allocateSavedInvoiceMinor,
  planPartialSaleReturn,
} from '../client/src/features/sales/partialReturnPlan.mjs';

// Financial rounding cannot depend on the user's operating-system locale.
test('one-cent Hamilton tie uses fixed code-unit line ID ordering', () => {
  const lines = [
    { id: 'a', lineTotalMinor: 1 },
    { id: '_', lineTotalMinor: 1 },
  ];
  assert.deepEqual(allocateSavedInvoiceMinor(1, lines), { _: 1, a: 0 });
  assert.deepEqual(allocateSavedInvoiceMinor(1, [...lines].reverse()), { _: 1, a: 0 });
});

test('the same invoice preserves exact totals despite line input permutation', () => {
  const lines = [
    { id: 'z', lineTotalMinor: 1 },
    { id: 'A', lineTotalMinor: 1 },
    { id: '_', lineTotalMinor: 1 },
    { id: 'a', lineTotalMinor: 1 },
  ];
  const first = allocateSavedInvoiceMinor(3, lines);
  const second = allocateSavedInvoiceMinor(3, [...lines].reverse());
  assert.deepEqual(first, second);
  assert.equal(Object.values(first).reduce((sum, x) => sum + x, 0), 3);
  assert.deepEqual(first, { A: 1, _: 1, a: 1, z: 0 });
});

test('partial-return draft line order is independent of locale and request order', () => {
  const sale = {
    id: 'sale-1', businessProfileId: 'company-1',
    subtotalMinor: 2, discountMinor: 0, totalMinor: 2,
    amountPaidMinor: 2, outstandingMinor: 0,
  };
  const lines = [
    { id: 'a', saleId: 'sale-1', businessProfileId: 'company-1', quantity: 1, unitPriceMinor: 1, lineTotalMinor: 1 },
    { id: '_', saleId: 'sale-1', businessProfileId: 'company-1', quantity: 1, unitPriceMinor: 1, lineTotalMinor: 1 },
  ];
  const request = [{ saleLineId: 'a', quantity: 1 }, { saleLineId: '_', quantity: 1 }];
  const draft = planPartialSaleReturn(sale, lines, [], request);
  const reordered = planPartialSaleReturn(sale, [...lines].reverse(), [], [...request].reverse());
  assert.equal(draft.status, 'DRAFT_ONLY_NO_FINANCIAL_OR_STOCK_POSTING');
  assert.deepEqual(draft.lines.map(row => row.saleLineId), ['_', 'a']);
  assert.deepEqual(draft, reordered);
  assert.equal(draft.draftAmountMinor, 2);
});

test('locale collation cannot redirect a rounding penny to another sale line', () => {
  const original = String.prototype.localeCompare;
  // Simulates a runtime whose collation reverses the chosen line IDs.
  String.prototype.localeCompare = function (other) {
    const left = String(this);
    return left === String(other) ? 0 : (left < String(other) ? 1 : -1);
  };
  try {
    const result = allocateSavedInvoiceMinor(1, [
      { id: 'a', lineTotalMinor: 1 },
      { id: '_', lineTotalMinor: 1 },
    ]);
    assert.deepEqual(result, { _: 1, a: 0 });
  } finally {
    String.prototype.localeCompare = original;
  }
});
