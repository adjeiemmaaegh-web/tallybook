import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectReceivableCurrency, assertReceivableWriteCurrency, reconcileCreditLedger, checkedCreditExposure, reconcileRepaymentAllocations } from '../client/src/features/sales/creditLedger.mjs';
const sale = (id, currency, outstandingMinor = 1200) => ({id, businessProfileId:'shop-a', customerId:'customer-a', currency, outstandingMinor});
const repayment = (id, currency, amountMinor = 200) => ({id, businessProfileId:'shop-a', customerId:'customer-a', currency, amountMinor});

test('reconciles one verified denomination and accepts a matching write currency', () => {
  const sales = [sale('a','GHS',1200),sale('b','GHS',300)];
  const payments = [repayment('r1','GHS',400)];
  assert.deepEqual(inspectReceivableCurrency(sales, payments), {currency:'GHS',hasUnknownMoney:false});
  assert.equal(assertReceivableWriteCurrency(sales,payments,'GHS'), 'GHS');
  assert.equal(checkedCreditExposure(sales,[],payments,100),1200);
});

test('rejects GHS and USD amounts instead of silently adding incomparable monetary values', () => {
  const sales = [sale('a','GHS'),sale('b','USD')];
  assert.throws(() => reconcileCreditLedger(sales,[],[]), /combines currencies/);
  assert.throws(() => checkedCreditExposure(sales,[],[],100), /combines currencies/);
  assert.throws(() => assertReceivableWriteCurrency([sale('a','GHS')],[], 'USD'),/different currency/);
  assert.throws(() => reconcileCreditLedger([sale('a','GHS')],[],[repayment('r1','USD')]), /combines currencies/);
});

test('rejects mixed modern and unverifiable historical monetary records', () => {
  assert.throws(() => reconcileCreditLedger([sale('a',undefined),sale('b','GHS')],[],[]), /unverified historical/);
  assert.throws(() => reconcileCreditLedger([sale('a','GHS')],[],[repayment('r1',undefined)]), /unverified historical/);
  assert.throws(() => reconcileCreditLedger([sale('a',undefined)],[],[repayment('r1','GHS')]), /unverified historical/);
});

test('preserves legacy-only read arithmetic but rejects posting in a guessed currency', () => {
  const sales = [sale('a',undefined,1500)];
  const payments = [repayment('r1',undefined,200)];
  assert.deepEqual(inspectReceivableCurrency(sales,payments),{currency:null,hasUnknownMoney:true});
  assert.equal(reconcileCreditLedger(sales,[],payments).outstandingMinor,1300);
  assert.throws(() => assertReceivableWriteCurrency(sales,payments,'GHS'), /no verified currency/);
});

test('allows settled zero-value historical rows without assuming a currency for them', () => {
  const sales = [sale('old',undefined,0),sale('new','GHS',700)];
  assert.deepEqual(inspectReceivableCurrency(sales,[]),{currency:'GHS',hasUnknownMoney:false});
  assert.equal(assertReceivableWriteCurrency(sales,[],'GHS'),'GHS');
  assert.deepEqual(inspectReceivableCurrency([sale('zero',undefined,0)],[]),{currency:null,hasUnknownMoney:false});
  assert.equal(assertReceivableWriteCurrency([sale('zero',undefined,0)],[],'GHS'),'GHS');
});

test('does not ignore corrupted currency evidence or invalid money', () => {
  for (const bad of ['ghs','USDX','',12,null,'US$']) {
    assert.throws(() => inspectReceivableCurrency([sale('bad',bad)],[]), /invalid currency/);
  }
  assert.throws(() => inspectReceivableCurrency([sale('bad','GHS',1.5)],[]),/invalid monetary/);
  assert.throws(() => inspectReceivableCurrency([], [repayment('bad','GHS',-1)]),/invalid monetary/);
  assert.throws(() => assertReceivableWriteCurrency([], [], 'usd'),/three-letter/);
});

test('does not allow a zero-value record with a corrupt currency snapshot', () => {
  assert.throws(() => inspectReceivableCurrency([sale('bad','BAD!',0)],[]), /invalid currency/);
});


test('sale-linked repayments cannot combine one-sided or conflicting currency evidence', () => {
  const linked = currency => ({ ...repayment('r1', currency, 200), saleAllocations:[{saleId:'s1',amountMinor:200}] });
  assert.throws(() => reconcileRepaymentAllocations([sale('s1','GHS')],[],[linked('USD')]), /currenc/);
  assert.throws(() => reconcileRepaymentAllocations([sale('s1','GHS')],[],[linked(undefined)]), /currenc/);
  assert.throws(() => reconcileRepaymentAllocations([sale('s1',undefined)],[],[linked('GHS')]), /currenc/);
  assert.throws(() => reconcileRepaymentAllocations([sale('s1',undefined)],[],[linked(undefined)]), /currenc/);
});
