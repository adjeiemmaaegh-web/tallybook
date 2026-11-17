import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectBranch, branchInventory } from '../scripts/road-to-complete-branches.mjs';

test('ancestry, cherry-picked patch and genuinely unique work stay distinct', t => {
  const root = mkdtempSync(join(tmpdir(), 'tallybook-branches-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-b', 'main'); git('config', 'user.name', 'QA'); git('config', 'user.email', 'qa@example.invalid');
  const commit = (file, value, message) => { writeFileSync(join(root, file), value); git('add', file); git('commit', '-m', message); return git('rev-parse', 'HEAD'); };
  const initial = commit('ledger.txt', 'base\n', 'base');
  git('branch', 'ancestor'); git('switch', '-c', 'candidate');
  const patch = commit('ledger.txt', 'base\nvalidated\n', 'validate ledger');
  commit('unique.txt', 'not integrated\n', 'unique feature');
  git('switch', 'main'); commit('other.txt', 'main update\n', 'advance main'); git('cherry-pick', patch);
  const baseline = git('rev-parse', 'HEAD');
  const ancestor = inspectBranch(root, baseline, 'ancestor');
  assert.equal(ancestor.sha, initial); assert.equal(ancestor.disposition, 'incorporated-by-ancestry');
  const candidate = inspectBranch(root, baseline, 'candidate');
  assert.equal(candidate.ahead, 2); assert.equal(candidate.patches.filter(p => p.patchEquivalent).length, 1);
  assert.equal(candidate.patches.filter(p => !p.patchEquivalent).length, 1);
  assert.deepEqual(candidate.matchingPaths, ['ledger.txt']);
  assert.equal(candidate.disposition, 'semantic-review-required');
  assert.equal(git('rev-parse', 'HEAD'), baseline, 'inspection must not mutate HEAD');
  git('update-ref', 'refs/remotes/origin/main', baseline);
  git('update-ref', 'refs/remotes/origin/candidate', candidate.sha);
  git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
  assert.deepEqual(branchInventory(root, baseline).branches.map(b => b.ref), ['origin/candidate'],
    'symbolic origin/HEAD must not appear as an extra branch named origin');
});
