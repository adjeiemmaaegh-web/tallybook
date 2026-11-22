/** Deterministic multi-device offline-sync simulation against the REAL ingest + signature-verification code.
 *  Simulation only: in-memory store, generated device keys. Not real-device acceptance. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { centralEventSigningBytes } from '../centralEventTrust.mjs';
import { createCentralSaleIngestService } from '../centralSaleIngest.mjs';

function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; }; }
const BIZ = 'biz1', SHOP = 'shop1';

function world(deviceCount) {
  const devices = [];
  for (let i = 0; i < deviceCount; i++) {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    devices.push({ id: `dev${i}`, staffId: `staff${i}`, actorId: `user${i}`, privateKey,
      pem: publicKey.export({ type: 'spki', format: 'pem' }), active: true, queue: [], localTotal: 0 });
  }
  const events = new Map(); // `${biz}|${op}` -> row (unique operation index)
  let sessionOk = true;
  const store = { async transaction(fn) {
    const staged = [];
    const tx = {
      async assertActiveSession() { return sessionOk; },
      async getMembership(businessId, actorId) { const d = devices.find(x => x.actorId === actorId); return d && { businessId, actorId, staffId: d.staffId, role: 'attendant', active: d.active }; },
      async getDevice(businessId, id) { const d = devices.find(x => x.id === id); return d && { businessId, id, shopId: SHOP, staffId: d.staffId, actorId: d.actorId, active: d.active, publicKeySpkiPem: d.pem }; },
      async getShop(businessId, id) { return { businessId, id, active: true }; },
      async getStaff(businessId, id) { return { businessId, id, active: true }; },
      async isAssigned() { return true; },
      async getEvent(b, op) { return events.get(`${b}|${op}`) ?? null; },
      async insertEvent(row) { const k = `${row.businessId}|${row.operationId}`; if (events.has(k)) { const e = new Error('dup'); e.code = '23505'; throw e; } staged.push([k, row]); },
    };
    const out = await fn(tx); for (const [k, r] of staged) events.set(k, r); return out;
  } };
  const svc = createCentralSaleIngestService({ store, clock: () => 1_800_000_000_000,
    resolveSession: async s => ({ active: true, userId: s.userId, sessionId: `sess-${s.userId}`, expiresAtEpochMs: 1_900_000_000_000 }) });
  return { devices, events, svc };
}
function makeSale(dev, n, rand) {
  const total = 100 + Math.floor(rand() * 9000);
  const sid = `${dev.id}-${n}`, op = `sale:${sid}`;
  const payload = { id: op, businessProfileId: BIZ, operationId: op, entityId: sid, kind: 'sale.completed', payloadVersion: 1,
    deliveryStatus: 'local_only', shopId: SHOP, staffId: dev.staffId, shiftId: 's', deviceId: null, createdAt: '2026-11-22T10:00:00.000Z',
    payload: { sale: { id: sid, businessProfileId: BIZ, storeId: SHOP, staffId: dev.staffId, submissionKey: op, receiptNumber: `R-${sid}`,
        totalMinor: total, amountPaidMinor: total, outstandingMinor: 0 },
      lines: [{ id: `l-${sid}`, saleId: sid, businessProfileId: BIZ, lineTotalMinor: total }],
      payment: { id: `p-${sid}`, saleId: sid, businessProfileId: BIZ, amountMinor: total },
      receipt: { id: `r-${sid}`, saleId: sid, businessProfileId: BIZ, receiptNumber: `R-${sid}` } } };
  const env = { version: 1, eventId: op, operationId: op, businessId: BIZ, shopId: SHOP, staffId: dev.staffId, deviceId: dev.id,
    payloadBase64: Buffer.from(JSON.stringify(payload)).toString('base64url'), signature: '' };
  env.signature = sign(null, centralEventSigningBytes(env), dev.privateKey).toString('base64url');
  dev.localTotal += total; return { env, total, op };
}
const deliver = (w, dev, env) => w.svc.ingest({ session: { userId: dev.actorId }, envelope: env }).then(() => 'ok', e => e);

for (const seed of [1, 7, 42, 2026, 99991]) test(`seed ${seed}: shuffled, duplicated, retried delivery from 6 offline devices converges exactly once and conserves totals`, async () => {
  const rand = rng(seed), w = world(6), all = [];
  for (const d of w.devices) for (let n = 0; n < 15; n++) all.push({ d, ...makeSale(d, n, rand) });
  const schedule = [...all, ...all.filter(() => rand() < 0.4)];           // duplicates (client retries after lost acks)
  for (let i = schedule.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [schedule[i], schedule[j]] = [schedule[j], schedule[i]]; }
  // concurrent bursts of 8 to exercise unique-index retry path
  for (let i = 0; i < schedule.length; i += 8) {
    const res = await Promise.all(schedule.slice(i, i + 8).map(x => deliver(w, x.d, x.env)));
    res.forEach(r => assert.equal(r, 'ok', String(r?.message)));
  }
  assert.equal(w.events.size, all.length, 'every operation stored exactly once');
  for (const d of w.devices) {
    const stored = [...w.events.values()].filter(r => r.deviceId === d.id).reduce((s, r) => s + r.payload.payload.sale.totalMinor, 0);
    assert.equal(stored, d.localTotal, `${d.id} server total equals device ledger`);
  }
  assert.ok([...w.events.values()].every(r => r.payload && r.receivedAtUtc));
});

test('conflicts: same operation with different content, forged device, cross-device replay are all refused and change nothing', async () => {
  const rand = rng(5), w = world(3);
  const a = makeSale(w.devices[0], 0, rand);
  assert.equal(await deliver(w, w.devices[0], a.env), 'ok');
  const before = JSON.stringify([...w.events.values()]);
  const forgedPayload = JSON.parse(Buffer.from(a.env.payloadBase64, 'base64url')); const S = forgedPayload.payload; S.sale.totalMinor = S.sale.amountPaidMinor = S.lines[0].lineTotalMinor = S.payment.amountMinor = 1;
  const f = { ...a.env, payloadBase64: Buffer.from(JSON.stringify(forgedPayload)).toString('base64url') };
  f.signature = sign(null, centralEventSigningBytes(f), w.devices[0].privateKey).toString('base64url'); // validly signed, different content, same op
  assert.ok((await deliver(w, w.devices[0], f)) instanceof Error);
  assert.ok((await deliver(w, w.devices[1], a.env)) instanceof Error, 'another user cannot submit device 0 evidence');
  const spoof = { ...a.env, deviceId: 'dev1', operationId: 'sale:spoof', eventId: 'sale:spoof' };
  spoof.signature = sign(null, centralEventSigningBytes(spoof), w.devices[0].privateKey).toString('base64url');
  assert.ok((await deliver(w, w.devices[0], spoof)) instanceof Error, 'device 0 key cannot sign as device 1');
  assert.equal(JSON.stringify([...w.events.values()]), before);
});

test('revocation mid-sync: events queued offline before revocation are refused afterwards; other devices unaffected', async () => {
  const rand = rng(11), w = world(3);
  const q = Array.from({ length: 5 }, (_, n) => makeSale(w.devices[1], n, rand));
  assert.equal(await deliver(w, w.devices[1], q[0].env), 'ok');
  w.devices[1].active = false;
  for (const x of q.slice(1)) assert.ok((await deliver(w, w.devices[1], x.env)) instanceof Error);
  assert.equal(await deliver(w, w.devices[1], q[0].env) instanceof Error, true, 'even a retry of an accepted op is refused for a revoked device');
  assert.equal(await deliver(w, w.devices[0], makeSale(w.devices[0], 0, rand).env), 'ok');
  assert.equal(w.events.size, 2);
});
