import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const script = resolve('qa/mission-go-register-audit.mjs');
const fixture = (release, acceptance, central) => {
  const folder = mkdtempSync(join(tmpdir(), 'mission-go-audit-'));
  const sources = [
    ['docs/release/blockers.json', { blockers: release }],
    ['docs/release/traceability.json', { units: acceptance }],
    ['docs/central/CENTRAL_WORKSPACE_BLOCKERS.json', { blockers: central }],
  ];
  for (const [name, body] of sources) {
    const path = join(folder, name);
    mkdirSync(resolve(path, '..'), { recursive: true });
    writeFileSync(path, JSON.stringify(body));
  }
  return folder;
};
const run = folder => {
  const proc = spawnSync(process.execPath, [script, folder], { encoding: 'utf8', timeout: 10000 });
  assert.equal(proc.error, undefined, proc.error?.message);
  return { code: proc.status, report: JSON.parse(proc.stdout) };
};
const valid = [{ id: 'FIN-001', status: 'missing' }];
test('valid records remain NO-GO, not automatically accepted', t => {
  const dir = fixture(valid, [{ id: 'S1-01', status: 'implemented-unverified' }], [{ id: 'CENTRAL-001', status: 'blocked' }]);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const { code, report } = run(dir);
  assert.equal(code, 0);
  assert.equal(report.totalRecords, 3);
  assert.equal(report.decision, 'NO-GO');
  assert.equal(report.validStructure, true);
});
test('duplicate IDs in a register fail closed', t => {
  const dir = fixture([...valid, ...valid], [], []);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const { code, report } = run(dir);
  assert.equal(code, 1);
  assert.match(report.errors.join(' '), /duplicate ID FIN-001/);
});
test('missing status and missing ID fail closed', t => {
  const dir = fixture([{ id: 'FIN-001' }, { status: 'missing' }], [], []);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const { code, report } = run(dir);
  assert.equal(code, 1);
  assert.ok(report.errors.length >= 2);
});
test('missing register file fails closed', t => {
  const dir = fixture(valid, [], []);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  rmSync(join(dir, 'docs/central/CENTRAL_WORKSPACE_BLOCKERS.json'));
  const { code, report } = run(dir);
  assert.equal(code, 1);
  assert.match(report.errors.join(' '), /cannot read\/parse/);
});
test('non-array register fails closed', t => {
  const dir = fixture(valid, [], []);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'docs/release/traceability.json'), JSON.stringify({ units: {} }));
  const { code, report } = run(dir);
  assert.equal(code, 1);
  assert.match(report.errors.join(' '), /must be an array/);
});
