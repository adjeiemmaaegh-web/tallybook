import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRoadmap, validateRegister } from '../scripts/road-to-complete-register.mjs';

const text = readFileSync('road-to-complete.md', 'utf8');
// These fixtures model an entirely unreviewed snapshot, independently of
// which requirements the live roadmap has subsequently checked off.
const tasks = parseRoadmap(text).map(task => ({ ...task, checked: false }));
function fixture() {
  return { tasks: tasks.map(t => ({ ...t, status: 'unreviewed', files: [], existingCapabilityReused: [],
    changes: [], tests: [], blockers: [], acceptanceEvidence: [], nextAction: 'Inspect authoritative implementation' })) };
}
test('preserves all 119 requirements with stable ordered IDs and original audit statuses', () => {
  assert.equal(tasks[0].id, 'ST21-01');
  assert.equal(tasks.at(-1).id, 'ST32-13');
  assert.equal(validateRegister(tasks, fixture()).errors.length, 0);
  assert.equal(validateRegister(tasks, fixture()).totals.unreviewed, 119);
});
test('rejects deleted and unparseable requirements instead of silently losing scope', () => {
  assert.throws(() => parseRoadmap(text.replace(/^- \[ \].*\n/m, '')), /scope changed/);
  assert.throws(() => parseRoadmap(text.replace('[CRITICAL]', '[LOW]')), /Unrecognized/);
});
test('rejects missing, duplicate, altered and invented task records', () => {
  for (const mutate of [r => r.tasks.pop(), r => r.tasks.push(r.tasks[0]),
    r => r.tasks[0].requirement = 'reduced scope', r => r.tasks[0].id = 'ST99-01']) {
    const r = fixture(); mutate(r);
    assert.ok(validateRegister(tasks, r).errors.length);
  }
});
test('passing subset cannot certify an unverified or blocked task', () => {
  const r = fixture(); r.tasks[0].status = 'verified';
  assert.match(validateRegister(tasks, r).errors.join('\n'), /verified requires/);
  r.tasks[0].tests = [{ command: 'real test', result: 'pass', evidence: 'log' }];
  r.tasks[0].acceptanceEvidence = ['log']; r.tasks[0].blockers = ['Owner acceptance pending'];
  assert.match(validateRegister(tasks, r).errors.join('\n'), /verified requires/);
});
test('checked roadmap and owner-blocked status require corresponding evidence', () => {
  const r = fixture(); r.tasks[0].status = 'owner-external-blocked';
  const checked = tasks.map((t, i) => ({ ...t, checked: i === 0 }));
  const errors = validateRegister(checked, r).errors.join('\n');
  assert.match(errors, /checked without verification/);
  assert.match(errors, /blocked without reason/);
});
