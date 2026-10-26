import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('committed Watchdog preview file is parseable and preserves explicit provenance limits', () => {
  const bytes = readFileSync(new URL('./fixtures/tallybook-watchdog-preview-v1.json', import.meta.url));
  const file = JSON.parse(bytes.toString('utf8'));
  assert.equal(file.format, 'tallybook.watchdog.local_preview');
  assert.equal(file.schema_version, 1);
  assert.equal(file.contract_status, 'partial_unverified_provenance');
  assert.equal(file.row_count, file.events.length);
  assert.equal(file.business_id, 'fixture-business');
  assert.equal(file.shop_id, 'fixture-shop');
  assert.ok(file.events.some(event => event.event_type === 'no_sale'));
  assert.ok(file.events.some(event => event.event_type === 'momo'));
  assert.ok(file.events.every(event => event.business_id === file.business_id &&
    event.shop_id === file.shop_id && event.received_at_utc === null &&
    event.provenance_verified === false));
  assert.ok(!bytes.toString('utf8').includes('customer_phone'));
});
