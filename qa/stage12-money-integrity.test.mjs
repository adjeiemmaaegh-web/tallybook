import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCheckoutLines } from '../client/src/features/sales/checkoutMoney.mjs';
test('calculates exact line totals and subtotal in minor units', () => {
  assert.deepEqual(calculateCheckoutLines([{productId:'p1', quantity:2, unitPriceMinor:125},{productId:'p2',quantity:3,unitPriceMinor:200}]), {subtotalMinor:850,lines:[{productId:'p1',quantity:2,unitPriceMinor:125,lineTotalMinor:250},{productId:'p2',quantity:3,unitPriceMinor:200,lineTotalMinor:600}]});
});
test('rejects overflow in line total', () => assert.throws(() => calculateCheckoutLines([{productId:'p',quantity:9999999,unitPriceMinor:Number.MAX_SAFE_INTEGER}]), /safe money/));
test('rejects overflow in accumulated subtotal', () => assert.throws(() => calculateCheckoutLines([{productId:'a',quantity:1,unitPriceMinor:Number.MAX_SAFE_INTEGER},{productId:'b',quantity:1,unitPriceMinor:1}]), /subtotal/));
test('rejects negative, fractional and unsafe prices', () => { for (const v of [-1,1.5,Infinity,NaN,Number.MAX_SAFE_INTEGER+1]) assert.throws(() => calculateCheckoutLines([{productId:'p',quantity:1,unitPriceMinor:v}]), /Invalid/); });
test('rejects invalid quantities and missing product identifiers', () => { for (const line of [{productId:'',quantity:1,unitPriceMinor:2},{productId:'p',quantity:0,unitPriceMinor:2},{productId:'p',quantity:1.1,unitPriceMinor:2}]) assert.throws(() => calculateCheckoutLines([line]),/Invalid/); });
