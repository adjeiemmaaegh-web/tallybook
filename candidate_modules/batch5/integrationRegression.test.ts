import { test } from 'node:test';
import assert from 'node:assert/strict';

/** Contract-level smoke fixture; wire to Tallybook services before calling it integration QA. */
export function checkIntegrationContract(events: Array<{companyId:string; id:string; kind:string}>) {
  const seen = new Set<string>();
  for (const event of events) {
    if (!event.companyId || !event.id || !event.kind) throw new Error('Incomplete event');
    const key = `${event.companyId}\u0000${event.kind}\u0000${event.id}`;
    if (seen.has(key)) throw new Error('Duplicate event');
    seen.add(key);
  }
  return { validated: seen.size };
}

test('integration contract rejects duplicate event within a company', () => {
  assert.throws(() => checkIntegrationContract([{companyId:'a',id:'1',kind:'sale'},{companyId:'a',id:'1',kind:'sale'}]), /Duplicate/);
});
test('integration contract permits distinct tenant event IDs', () => {
  assert.equal(checkIntegrationContract([{companyId:'a',id:'1',kind:'sale'},{companyId:'b',id:'1',kind:'sale'}]).validated, 2);
});
test('integration contract rejects missing company scope', () => {
  assert.throws(() => checkIntegrationContract([{companyId:'',id:'1',kind:'sale'}]), /Incomplete/);
});
