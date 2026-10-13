import test from 'node:test';
import assert from 'node:assert/strict';
import { auditReceivableRecords } from '../client/src/features/reliability/receivableAudit.mjs';
const company = 'primary';
const customer = id => ({id, businessProfileId: company});
const sale = (id, debt = 500, customerId = 'alice', currency = 'GHS') => ({
  id, businessProfileId: company, customerId, receiptNumber: `TB-${id}`,
  totalMinor: debt, amountPaidMinor: 0, outstandingMinor: debt, ...(currency ? {currency} : {})
});
const reversal = (s, changes = {}) => ({id: `rev-${s.id}`, businessProfileId: company, originalSaleId: s.id,
  originalReceiptNumber: s.receiptNumber, customerId: s.customerId,
  reversedSaleTotalMinor: -s.totalMinor, reversedReceivedMinor: -s.amountPaidMinor,
  reversedOutstandingMinor: -s.outstandingMinor, ...changes});
const payment = (id, amountMinor, parts, currency = 'GHS') => ({id, businessProfileId: company, customerId: 'alice', amountMinor,
  ...(currency ? {currency} : {}), ...(parts === undefined ? {} : {saleAllocations: parts}) });
const part = (saleId, amountMinor) => ({saleId, amountMinor});
const inspect = (sales = [], reversals = [], repayments = [], customers = [customer('alice')]) =>
  auditReceivableRecords(company, customers, sales, reversals, repayments);
const codes = records => records.map(row => row.code);

test('clean paid sale and unapplied historical repayment are independently auditable', () => {
  assert.deepEqual(inspect([sale('a', 500)], [], [payment('old', 150)]), []);
  assert.deepEqual(inspect([sale('a', 500)], [], [payment('linked', 200, [part('a', 200)])]), []);
});
test('valid full reversal of another sale does not invalidate an allocated repayment', () => {
  const a = sale('a', 500), b = sale('b', 50);
  assert.deepEqual(inspect([a,b], [reversal(b)], [payment('p', 200, [part('a', 200)])]), []);
});
test('rejects duplicate reversals even if identifiers differ', () => {
  const a = sale('a');
  assert.ok(codes(inspect([a], [reversal(a), reversal(a, {id:'another'})])).includes('receivable-reversal'));
});
test('rejects orphan, cross-company and incorrect reversal magnitude/sign/receipt/customer', () => {
  const a = sale('a');
  const problems = [reversal(a,{originalSaleId:'missing'}), reversal(a,{businessProfileId:'other'}),
    reversal(a,{reversedOutstandingMinor:500}), reversal(a,{reversedOutstandingMinor:-1}),
    reversal(a,{originalReceiptNumber:'wrong'}), reversal(a,{customerId:'bob'})];
  for (const row of problems) assert.ok(codes(inspect([a], [row])).includes('receivable-reversal'));
});
test('rejects repayment exceeding original customer balance, including cumulative excess', () => {
  assert.ok(codes(inspect([sale('a', 100)],[],[payment('one',101)])).includes('receivable-balance'));
  assert.ok(codes(inspect([sale('a', 100)],[],[payment('one',60),payment('two',41)])).includes('receivable-balance'));
});
test('rejects repayment of already reversed credit', () => {
  const a = sale('a',100);
  const found = codes(inspect([a], [reversal(a)], [payment('one',1)]));
  assert.ok(found.includes('receivable-balance'));
});
test('rejects missing, duplicate and foreign repayment allocation links', () => {
  const a = sale('a'); const b = sale('b', 100, 'bob');
  for (const parts of [[part('missing',50)], [part('a',25),part('a',25)], [part('b',50)]])
    assert.ok(codes(inspect([a,b], [], [payment('p',50,parts)], [customer('alice'),customer('bob')])).includes('receivable-allocation'));
});
test('rejects allocation to reversed sale, wrong currency and a short allocation total', () => {
  const a = sale('a');
  assert.ok(codes(inspect([a],[reversal(a)],[payment('p',50,[part('a',50)])])).includes('receivable-allocation'));
  assert.ok(codes(inspect([a],[],[payment('p',50,[part('a',50)],'USD')])).includes('receivable-allocation'));
  assert.ok(codes(inspect([a],[],[payment('p',50,[part('a',25)])])).includes('receivable-allocation'));
});
test('rejects allocations cumulatively exceeding the source sale despite a different customer sale balance', () => {
  const a = sale('a',100), b = sale('b',500);
  assert.ok(codes(inspect([a,b],[],[payment('one',75,[part('a',75)]),payment('two',26,[part('a',26)])])).includes('receivable-allocation'));
});
test('rejects invalid amounts, unsafe overflow and unexpected scopes without changing inputs', () => {
  const a = sale('a');
  const source = [a]; const original = structuredClone(source);
  const examples = [payment('p',0), payment('p',1.25), payment('p',Number.MAX_SAFE_INTEGER+1),
    {...payment('p',1), businessProfileId:'other'}, {...payment('p',1),customerId:'missing'}];
  for (const row of examples) assert.ok(codes(inspect(source,[],[row])).includes('receivable-repayment'));
  assert.ok(codes(inspect([sale('a',Number.MAX_SAFE_INTEGER),sale('b',1)])).includes('receivable-balance'));
  assert.deepEqual(source,original);
});
test('does not treat a historical unverified currency as GHS or sum GHS with USD', () => {
  assert.deepEqual(inspect([sale('a',100,'alice',null)],[],[payment('p',50,undefined,null)]),[]);
  assert.ok(codes(inspect([sale('a',100,'alice',null),sale('b',100,'alice','GHS')])).includes('receivable-currency'));
  assert.ok(codes(inspect([sale('a',100,'alice','GHS'),sale('b',100,'alice','USD')])).includes('receivable-currency'));
  assert.ok(codes(inspect([sale('a',100)],[],[payment('p',50,undefined,'usd')])).includes('receivable-currency'));
});
test('rejects orphan credit sales and company-mismatched source references', () => {
  assert.ok(codes(inspect([sale('a',10,'missing')])).includes('receivable-sale'));
  assert.ok(codes(inspect([sale('a',10,null)])).includes('receivable-sale'));
  assert.ok(codes(inspect([{...sale('a'),businessProfileId:'other'}])).includes('receivable-sale'));
});
test('rejects malformed allocation lists and negative/unrepresentable source money', () => {
  const a = sale('a');
  for (const invalid of [[],[], 'not-array', [part('a',-1)], [part('a', 1.5)], [part('a',50),part('a',0)]]) {
    assert.ok(codes(inspect([a],[],[payment('p',50,invalid)])).includes('receivable-allocation'));
  }
  assert.ok(codes(inspect([sale('a',-1)])).includes('receivable-sale'));
});
