import test from 'node:test';
import assert from 'node:assert/strict';
import { getRepaymentTargetsFromLedger as options } from '../client/src/features/credit/repaymentTargets.mjs';

const scope = { customerId: 'customer-a', businessProfileId: 'business-a', currency: 'GHS' };
const sale = (id, outstandingMinor = 1200, extra = {}) => ({
  id, businessProfileId: scope.businessProfileId, customerId: scope.customerId,
  receiptNumber: `TB-${id}`, outstandingMinor, currency: 'GHS', ...extra,
});
const repayment = (amountMinor, saleAllocations, extra = {}) => ({
  id: `payment-${amountMinor}`, amountMinor, currency: 'GHS', businessProfileId: scope.businessProfileId, customerId: scope.customerId,
  ...(saleAllocations === undefined ? {} : { saleAllocations }), ...extra,
});
const reversal = (id, amount = 1200, extra = {}) => ({
  originalSaleId: id, customerId: scope.customerId, businessProfileId: scope.businessProfileId,
  reversedOutstandingMinor: -amount, ...extra,
});

test('saved currency and still-unpaid sale appear as an optional explicit target', () => {
  assert.deepEqual(options([sale('1'), sale('2', 500)], [], [], scope), {
    canLink: true, reason: null, unallocatedMinor: 0,
    targets: [{saleId:'1',receiptNumber:'TB-1',remainingMinor:1200}, {saleId:'2',receiptNumber:'TB-2',remainingMinor:500}],
  });
});
test('existing linked repayment reduces only its original sale remaining allocation', () => {
  const result = options([sale('1'), sale('2')], [], [repayment(400,[{saleId:'1',amountMinor:400}])], scope);
  assert.deepEqual(result.targets.map(row => row.remainingMinor), [800, 1200]);
});
test('fully repaid and reversed sales are excluded, without losing a remaining sale', () => {
  const result = options([sale('1'),sale('2'),sale('3')],[reversal('2')], [repayment(1200,[{saleId:'1',amountMinor:1200}])],scope);
  assert.deepEqual(result.targets.map(row=>row.saleId), ['3']);
});
test('historical customer-level repayment prevents new sale-linked choices', () => {
  const result = options([sale('1'), sale('2')], [], [repayment(200)], scope);
  assert.equal(result.canLink, false);
  assert.match(result.reason, /earlier payments/);
  assert.deepEqual(result.targets, []);
  assert.equal(result.unallocatedMinor, 200);
});
test('mixed saved allocations and unknown historical payment remain blocked', () => {
  const result = options([sale('1'),sale('2')],[],[repayment(500,[{saleId:'1',amountMinor:500}]),repayment(100)],scope);
  assert.equal(result.canLink, false);
  assert.deepEqual(result.targets, []);
});
test('mixed legacy unknown and modern verified debt cannot be shown as one balance', () => {
  assert.throws(() => options([sale('old',1200,{currency:undefined}),sale('new')],[],[],scope), /unverified historical/);
  assert.equal(options([sale('old',1200,{currency:undefined})],[],[],scope).canLink,false);
});
test('changed currency is not relabeled or silently made payable in current currency', () => {
  assert.deepEqual(options([sale('usd', 1200, {currency:'USD'})],[],[],scope).targets,[]);
  assert.equal(options([sale('usd', 1200, {currency:'USD'})],[],[],scope).canLink,false);
});
test('duplicate and missing source sale identities are rejected before offering targets', () => {
  assert.throws(()=>options([sale('1'),sale('1')],[],[],scope),/duplicate/);
  assert.throws(()=>options([sale('1')],[],[repayment(30,[{saleId:'missing',amountMinor:30}])],scope),/missing/);
});
test('foreign-company and foreign-customer data cannot enter a selection', () => {
  assert.throws(()=>options([sale('1',1200,{businessProfileId:'other'})],[],[],scope),/another customer or business/);
  assert.throws(()=>options([sale('1')],[],[repayment(100,undefined,{customerId:'other'})],scope),/another customer or business/);
  assert.throws(()=>options([sale('1')],[reversal('1',1200,{businessProfileId:'other'})],[],scope),/another customer or business/);
});
test('invalid balances and allocations are rejected rather than shown', () => {
  assert.throws(()=>options([sale('1',-3)],[],[],scope),/invalid/);
  assert.throws(()=>options([sale('1')],[],[repayment(1201)],scope),/reconciliation/);
  assert.throws(()=>options([sale('1')],[],[repayment(1201,[{saleId:'1',amountMinor:1201}])],scope),/exceed/);
});
test('receipt identity must exist before a credit sale can be offered', () => {
  assert.throws(()=>options([sale('1',1200,{receiptNumber:''})],[],[],scope),/receipt/);
});
test('scope must be explicit', () => {
  assert.throws(()=>options([sale('1')],[],[],{...scope,currency:''}),/scope/);
  assert.throws(()=>options([sale('1')],[],[],{...scope,businessProfileId:''}),/scope/);
});
