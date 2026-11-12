// Durable encrypted outbox core (PRD R1/R2): write-ahead, multi-tab, crash, ambiguity, confidentiality.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createOutbox, createSealer, bestAvailableLocks, inProcessLocks, memoryBackend, scopeKeyOf, MAX_UNCONFIRMED_ATTEMPTS} from '../client/src/cloud/outboxCore.ts';

const newKey = () => crypto.subtle.generateKey({name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
const scope = {userId: 'user-1', companyId: 'co-1'};
const sale = (key, extra = {}) => ({submissionKey: key, storeId: 's1', lines: [{productId: 'p-secret-eggs', quantity: 2}], amountTenderedMinor: 987654, ...extra});
class Rejected extends Error {}
class Unreachable extends Error {}
const isRejected = e => e instanceof Rejected;
const receipt = key => ({submissionKey: key, receiptNumber: 1});

async function rig(over = {}) {
  const backend = over.backend ?? memoryBackend();
  const key = over.key ?? await newKey();
  const sealer = createSealer(key);
  const lock = over.lock ?? inProcessLocks();
  const make = (extra = {}) => createOutbox({backend, sealer, lock, isRejected, ...over, ...extra});
  return {backend, key, sealer, lock, outbox: make(), make};
}

test('saves before sending and removes the record once the server confirms', async () => {
  const {outbox, backend} = await rig();
  let seenDuringSend = 0;
  const result = await outbox.submit(scope, sale('k1'), '2 x Eggs', async s => { seenDuringSend = (await backend.list(scopeKeyOf(scope))).length; return receipt(s.submissionKey); });
  assert.equal(seenDuringSend, 1);
  assert.equal(result.state, 'recorded');
  assert.deepEqual(await outbox.read(scope), []);
});

test('connection failure keeps the sale and re-sends it with the SAME key', async () => {
  const {outbox} = await rig();
  const first = await outbox.submit(scope, sale('k1'), 's', async () => { throw new Unreachable('offline'); });
  assert.equal(first.state, 'queued');
  const [entry] = await outbox.read(scope);
  assert.equal(entry.status, 'queued'); assert.equal(entry.ambiguous, true); assert.equal(entry.attempts, 1);
  const sent = [];
  const results = await outbox.flush(scope, async s => { sent.push(s.submissionKey); return receipt(s.submissionKey); });
  assert.deepEqual(sent, ['k1']);
  assert.equal(results[0].state, 'recorded');
  assert.deepEqual(await outbox.read(scope), []);
});

test('an ambiguous sale is looked up on the server first and is NOT re-sent when it was recorded', async () => {
  const {make} = await rig();
  const outbox = make({lookupReceipt: async s => receipt(s.submissionKey)});
  await outbox.submit(scope, sale('k1'), 's', async () => { throw new Unreachable('response lost'); });
  let sends = 0;
  const [r] = await outbox.flush(scope, async s => { sends++; return receipt(s.submissionKey); });
  assert.equal(sends, 0);
  assert.equal(r.state, 'recorded');
  assert.deepEqual(await outbox.read(scope), []);
});

test('when the server has no such sale it is sent exactly once; when the lookup fails nothing is sent', async () => {
  const {make} = await rig();
  let lookup = async () => null;
  const outbox = make({lookupReceipt: s => lookup(s)});
  await outbox.submit(scope, sale('k1'), 's', async () => { throw new Unreachable('x'); });
  lookup = async () => { throw new Unreachable('still offline'); };
  let sends = 0;
  const send = async s => { sends++; return receipt(s.submissionKey); };
  assert.equal((await outbox.flush(scope, send))[0].state, 'queued');
  assert.equal(sends, 0);
  assert.equal((await outbox.read(scope)).length, 1);
  lookup = async () => null;
  assert.equal((await outbox.flush(scope, send))[0].state, 'recorded');
  assert.equal(sends, 1);
});

test('two tabs flushing at once send each sale exactly once', async () => {
  const {backend, make} = await rig();
  const tabA = make(), tabB = make();
  for (const k of ['k1', 'k2', 'k3']) await tabA.submit(scope, sale(k), 's', async () => { throw new Unreachable('offline'); });
  const sends = [];
  const send = async s => { await new Promise(r => setTimeout(r, 5)); sends.push(s.submissionKey); return receipt(s.submissionKey); };
  const [a, b] = await Promise.all([tabA.flush(scope, send), tabB.flush(scope, send)]);
  assert.deepEqual(sends.sort(), ['k1', 'k2', 'k3']);
  assert.equal(a.filter(r => r.state === 'recorded').length + b.filter(r => r.state === 'recorded').length, 3);
  assert.equal((await backend.list(scopeKeyOf(scope))).length, 0);
});

test('two tabs recording different sales never overwrite each other', async () => {
  const {backend, make} = await rig();
  const tabA = make(), tabB = make();
  const offline = async () => { throw new Unreachable('offline'); };
  await Promise.all(Array.from({length: 20}, (_, i) => (i % 2 ? tabA : tabB).submit(scope, sale('k' + i), 's', offline)));
  assert.equal((await backend.list(scopeKeyOf(scope))).length, 20);
  assert.equal((await tabA.read(scope)).length, 20);
});

test('duplicate taps with the same key keep a single entry and a single send', async () => {
  const {outbox, backend} = await rig();
  let sends = 0;
  const send = async s => { sends++; await new Promise(r => setTimeout(r, 5)); return receipt(s.submissionKey); };
  const [x, y] = await Promise.all([outbox.submit(scope, sale('k1'), 's', send), outbox.submit(scope, sale('k1'), 's', send)]);
  assert.equal(sends, 1);
  assert.deepEqual([x.state, y.state].sort(), ['already-confirmed', 'recorded']);
  assert.equal((await backend.list(scopeKeyOf(scope))).length, 0);
});

test('a definite rejection is parked, never resent, and can be dismissed', async () => {
  const {outbox} = await rig();
  const r = await outbox.submit(scope, sale('k1'), 's', async () => { throw new Rejected('Only 1 left'); });
  assert.deepEqual(r, {state: 'rejected', error: 'Only 1 left'});
  let sends = 0;
  assert.deepEqual(await outbox.flush(scope, async () => { sends++; }), []);
  assert.equal(sends, 0);
  assert.equal((await outbox.read(scope))[0].status, 'rejected');
  assert.equal(await outbox.dismiss(scope, 'k1'), true);
  assert.deepEqual(await outbox.read(scope), []);
});

test('a sale left in "sending" by a killed tab is reconciled, not blindly resent', async () => {
  const {outbox, backend, sealer, make} = await rig();
  const sk = scopeKeyOf(scope);
  await backend.put(sk, 'k1', await sealer.seal(JSON.stringify({sale: sale('k1'), summary: 's', queuedAt: '2026-11-06T10:00:00.000Z', status: 'sending', attempts: 1, ambiguous: false}), `tallybook.outbox.v2|${sk}|k1`));
  const withLookup = make({lookupReceipt: async s => receipt(s.submissionKey)});
  let sends = 0;
  const [r] = await withLookup.flush(scope, async s => { sends++; return receipt(s.submissionKey); });
  assert.equal(r.state, 'recorded'); assert.equal(sends, 0);
  assert.equal((await outbox.read(scope)).length, 0);
});

test('repeated unconfirmed attempts move the sale to needs-review instead of looping forever', async () => {
  const {outbox} = await rig();
  const fail = async () => { throw new Unreachable('x'); };
  let last;
  for (let i = 0; i < MAX_UNCONFIRMED_ATTEMPTS; i++) last = i === 0 ? await outbox.submit(scope, sale('k1'), 's', fail) : (await outbox.flush(scope, fail))[0];
  assert.equal(last.state, 'needs-review');
  assert.equal((await outbox.read(scope))[0].status, 'needs-review');
  assert.deepEqual(await outbox.flush(scope, fail), []);
});

test('records are encrypted: no sale details appear in storage', async () => {
  const {outbox, backend} = await rig();
  await outbox.submit(scope, sale('k-visible-key'), 'Eggs for Ama Mensah', async () => { throw new Unreachable('offline'); });
  const dump = JSON.stringify([...backend.raw.entries()]);
  for (const secret of ['p-secret-eggs', '987654', 'Ama Mensah', 'storeId']) assert.ok(!dump.includes(secret), secret);
});

test('a record that cannot be opened is surfaced and never deleted by flush or a plain dismiss', async () => {
  const {backend, outbox} = await rig();
  await outbox.submit(scope, sale('k1'), 's', async () => { throw new Unreachable('offline'); });
  const other = createOutbox({backend, sealer: createSealer(await newKey()), lock: inProcessLocks(), isRejected});
  const [entry] = await other.read(scope);
  assert.equal(entry.unreadable, true); assert.equal(entry.status, 'needs-review');
  let sends = 0;
  assert.deepEqual(await other.flush(scope, async () => { sends++; }), []);
  assert.equal(await other.dismiss(scope, 'k1'), false);
  assert.equal(sends, 0);
  assert.equal((await backend.list(scopeKeyOf(scope))).length, 1);
  assert.equal(await other.dismiss(scope, 'k1', {force: true}), true);
});

test('a record moved to another key or another user cannot be opened (identity is authenticated)', async () => {
  const {backend, outbox} = await rig();
  await outbox.submit(scope, sale('k1'), 's', async () => { throw new Unreachable('offline'); });
  const sk = scopeKeyOf(scope);
  await backend.put(sk, 'k2', await backend.get(sk, 'k1'));
  const rows = await outbox.read(scope);
  assert.equal(rows.find(r => r.id === 'k2').unreadable, true);
  const intruder = {userId: 'user-2', companyId: 'co-1'};
  assert.deepEqual(await outbox.read(intruder), []);
  await backend.put(scopeKeyOf(intruder), 'k1', await backend.get(sk, 'k1'));
  assert.equal((await outbox.read(intruder))[0].unreadable, true);
});

test('legacy plaintext queue is imported, verified, and only then removed', async () => {
  const {outbox, backend} = await rig();
  const store = new Map([['legacy', JSON.stringify([{sale: sale('k1'), summary: 'x', queuedAt: '2026-11-01T00:00:00Z', status: 'pending'}, {sale: sale('k2'), summary: 'y', queuedAt: '2026-11-01T00:00:01Z', status: 'rejected', error: 'Only 1 left'}])]]);
  const legacy = {getItem: k => store.get(k) ?? null, removeItem: k => void store.delete(k)};
  const result = await outbox.migrateLegacy(scope, legacy, 'legacy');
  assert.deepEqual(result, {imported: 2, kept: false});
  assert.equal(store.has('legacy'), false);
  const rows = await outbox.read(scope);
  assert.deepEqual(rows.map(r => [r.id, r.status]), [['k1', 'queued'], ['k2', 'rejected']]);
  assert.equal(rows[0].ambiguous, true);
  assert.ok(!JSON.stringify([...backend.raw.values()]).includes('987654'));
});

test('legacy queue is kept when the import cannot be completed', async () => {
  const backend = memoryBackend();
  const failing = {...backend, put: async () => { throw new Error('quota exceeded'); }};
  const {outbox} = await rig({backend: failing});
  const store = new Map([['legacy', JSON.stringify([{sale: sale('k1'), summary: 'x', queuedAt: 'q', status: 'pending'}])]]);
  const legacy = {getItem: k => store.get(k) ?? null, removeItem: k => void store.delete(k)};
  await assert.rejects(outbox.migrateLegacy(scope, legacy, 'legacy'), /quota/);
  assert.equal(store.has('legacy'), true);
  const garbage = new Map([['legacy', '{not json']]);
  const g = await outbox.migrateLegacy(scope, {getItem: k => garbage.get(k) ?? null, removeItem: k => void garbage.delete(k)}, 'legacy');
  assert.deepEqual(g, {imported: 0, kept: true});
  assert.equal(garbage.has('legacy'), true);
});

test('separate bindings without Web Locks serialize work on the same pending sale', async t => {
  const descriptor = Object.getOwnPropertyDescriptor(navigator, 'locks');
  Object.defineProperty(navigator, 'locks', {configurable: true, value: undefined});
  t.after(() => descriptor ? Object.defineProperty(navigator, 'locks', descriptor) : delete navigator.locks);
  const first = bestAvailableLocks();
  const second = bestAvailableLocks();
  const started = Promise.withResolvers();
  const release = Promise.withResolvers();
  const order = [];
  const sending = first('sale-1', async () => {
    started.resolve();
    await release.promise;
    order.push('recorded');
  });
  await started.promise;
  const flushing = second('sale-1', async () => { order.push('reconcile'); });
  await Promise.resolve();
  release.resolve();
  await Promise.all([sending, flushing]);
  assert.deepEqual(order, ['recorded', 'reconcile']);
});

test('legacy cleanup retains a sale appended during encrypted import', async () => {
  const {outbox} = await rig();
  const original = [{sale: sale('k1'), status:'pending'}];
  const updated = [...original, {sale: sale('k2'), status:'pending'}];
  let reads = 0, removed = false;
  const legacy = {
    getItem: () => JSON.stringify(++reads === 1 ? original : updated),
    removeItem: () => { removed = true; },
  };
  const first = await outbox.migrateLegacy(scope, legacy, 'legacy');
  assert.equal(first.kept, true);
  assert.equal(removed, false);
  await outbox.migrateLegacy(scope, legacy, 'legacy');
  assert.equal(removed, true);
  assert.deepEqual((await outbox.read(scope)).map(row => row.id).sort(), ['k1','k2']);
});

test('a successful but mismatched server receipt is parked for review, never deleted or re-sent', async () => {
  const {outbox, backend} = await rig({validateReceipt: (sale, receipt) => receipt?.submissionKey === sale.submissionKey});
  const result = await outbox.submit(scope, sale('expected'), 'sale', async () => receipt('wrong'));
  assert.equal(result.state, 'needs-review');
  const [row] = await outbox.read(scope);
  assert.equal(row.sale.submissionKey, 'expected');
  assert.equal(row.status, 'needs-review');
  assert.equal(row.ambiguous, true);
  assert.equal((await backend.list(scopeKeyOf(scope))).length, 1);
  let sends = 0;
  assert.deepEqual(await outbox.flush(scope, async () => { sends++; return receipt('expected'); }), []);
  assert.equal(sends, 0);
});

test('a wrong receipt in ambiguous reconciliation is parked without sending or deleting the original', async () => {
  const {make, backend} = await rig();
  const outbox = make({
    validateReceipt: (sale, receipt) => receipt?.submissionKey === sale.submissionKey,
    lookupReceipt: async () => receipt('another-sale'),
  });
  await outbox.submit(scope, sale('expected'), 'sale', async () => { throw new Unreachable('response lost'); });
  let sends = 0;
  const [result] = await outbox.flush(scope, async () => { sends++; return receipt('expected'); });
  assert.equal(result.state, 'needs-review');
  assert.equal(sends, 0);
  assert.equal((await outbox.read(scope))[0].status, 'needs-review');
  assert.equal((await backend.list(scopeKeyOf(scope))).length, 1);
});

test('receipt validator exceptions fail closed, while matching receipts still clear the queue', async () => {
  const {make, backend} = await rig();
  const throws = make({validateReceipt: () => { throw new Error('bad response'); }});
  assert.equal((await throws.submit(scope, sale('bad'), 'sale', async () => receipt('bad'))).state, 'needs-review');
  assert.equal((await backend.list(scopeKeyOf(scope))).length, 1);
  const good = make({validateReceipt: (sale, receipt) => receipt?.submissionKey === sale.submissionKey});
  assert.equal((await good.submit(scope, sale('good'), 'sale', async () => receipt('good'))).state, 'recorded');
  assert.equal((await backend.list(scopeKeyOf(scope))).length, 1);
});
