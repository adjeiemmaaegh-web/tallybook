import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertAssistantCompanyScope, validateAssistantHistoryLimit,
  orderAssistantHistoryNewest, selectAssistantAuditPruneIds,
} from '../client/src/features/assistant/assistantDataSafety.mjs';

const stamp = '2026-10-11T01:00:00.000Z';
const audit = (id, createdAt = stamp) => ({ id, createdAt });

test('assistant scope allows only exact active company', () => {
  assert.doesNotThrow(() => assertAssistantCompanyScope('company-one','company-one'));
  for (const [requested, active] of [['company-one','company-two'], ['',''], [' company-one','company-one'], ['company-one','company-one '], [undefined,'primary']])
    assert.throws(() => assertAssistantCompanyScope(requested,active), /Switch to the company/);
});
test('history display limit is a positive bounded safe integer', () => {
  assert.equal(validateAssistantHistoryLimit(1),1);
  assert.equal(validateAssistantHistoryLimit(1000),1000);
  for (const bad of [0,-1,1001,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1])
    assert.throws(()=>validateAssistantHistoryLimit(bad), /limit/);
});
test('history is ordered newest first with deterministic id tie-break', () => {
  const rows = [audit('a'),audit('b'),audit('old','2026-09-11T00:00:00.000Z'),audit('new','2026-10-12T00:00:00.000Z')];
  const sorted=orderAssistantHistoryNewest(rows);
  assert.deepEqual(sorted.map(v=>v.id),['new','b','a','old']);
  assert.equal(rows[0].id,'a','must not sort caller input in place');
});
test('audit retention removes exactly the oldest entries', () => {
  assert.deepEqual(selectAssistantAuditPruneIds([audit('b'),audit('old','2026-09-11T00:00:00.000Z'),audit('a')],2),['old']);
  assert.deepEqual(selectAssistantAuditPruneIds([audit('b'),audit('a'),audit('c')],1),['a','b']);
  assert.deepEqual(selectAssistantAuditPruneIds([audit('a')],1),[]);
});
test('audit retention rejects invalid capacities and corrupt records fail closed', () => {
  for (const max of [0,-1,NaN,Infinity,1.1])
    assert.throws(()=>selectAssistantAuditPruneIds([],max), /Invalid/);
  for (const rows of [[audit('same'), audit('same')],[audit('')],[audit('a','not-a-date')],[null]])
    assert.throws(()=>selectAssistantAuditPruneIds(rows,1), /Invalid or duplicate/);
});
test('audit retention stable with large equal-timestamp cohorts', () => {
  const rows=Array.from({length:1003},(_,i)=>audit(String(i).padStart(4,'0')));
  assert.deepEqual(selectAssistantAuditPruneIds(rows,1000), ['0000','0001','0002']);
  assert.equal(rows.length,1003);
});
