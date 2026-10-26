import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { serializeWatchdogCanonicalCsv } from '../client/src/features/integrations/watchdogCanonicalCsv.ts';

const envelope = JSON.parse(readFileSync(new URL('./fixtures/tallybook-watchdog-preview-v1.json', import.meta.url), 'utf8'));

test('canonical Watchdog POS export preserves exact supported amounts and discloses exclusions', () => {
  const result = serializeWatchdogCanonicalCsv(envelope);
  assert.equal(result.included, 3);
  assert.deepEqual(result.omitted.map(e => e.event_type), ['shift_open', 'momo', 'cash_count', 'shift_close']);
  assert.match(result.csv, /^external_id,kind,occurred_at,store_id,register_id,reference,amount,currency\r\n/);
  assert.match(result.csv, /sale:fixture-sale,sale,2026-10-24T12:00:00.000Z,fixture-shop,,FIXTURE-001,20.00,GHS/);
  assert.match(result.csv, /discount:fixture-sale,discount,2026-10-24T12:00:00.000Z,fixture-shop,,FIXTURE-001,1.00,GHS/);
  assert.match(result.csv, /no_sale:fixture-drawer,no_sale,2026-10-24T15:00:00.000Z,fixture-shop,,,,/);
});

test('canonical export rejects unknown kinds, conflicting scope, and unsafe receipt text', () => {
  const changed = structuredClone(envelope);
  changed.events[0].event_type = 'future_kind';
  assert.throws(() => serializeWatchdogCanonicalCsv(changed), /Unmapped/);
  changed.events[0].event_type = 'shift_open';
  changed.events[0].shop_id = 'other-shop';
  assert.throws(() => serializeWatchdogCanonicalCsv(changed), /scope/);
  changed.events[0].shop_id = envelope.shop_id;
  const sale = changed.events.find(e => e.event_type === 'sale');
  sale.receipt_number = '=1+1';
  assert.throws(() => serializeWatchdogCanonicalCsv(changed), /unsafe/);
});

test('cash refund is exact and an accounting void has no invented payout', () => {
  const changed = structuredClone(envelope);
  const sale = changed.events.find(e => e.event_type === 'sale');
  changed.events.push({...sale, event_id: 'refund:partial', event_type: 'refund',
    occurred_at_utc: '2026-10-24T13:00:00.000Z', amount_minor: 375,
    payment_method: 'cash', reason: 'Cash return recorded; disbursement unverified'});
  changed.events.push({...sale, event_id: 'void:reversal', event_type: 'void',
    occurred_at_utc: '2026-10-24T14:00:00.000Z', amount_minor: null, currency: null});
  changed.row_count = changed.events.length;
  const {csv, included} = serializeWatchdogCanonicalCsv(changed);
  assert.equal(included, 5);
  assert.match(csv, /refund:partial,refund,2026-10-24T13:00:00.000Z,fixture-shop,,FIXTURE-001,3.75,GHS/);
  assert.match(csv, /void:reversal,void,2026-10-24T14:00:00.000Z,fixture-shop,,FIXTURE-001,,/);
});
