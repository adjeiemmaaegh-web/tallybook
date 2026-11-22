#!/usr/bin/env node
// Local Git objects only. No fetching, merging, branch deletion or network calls.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function inspectBranch(root, baseline, ref) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();
  const sha = git('rev-parse', '--verify', `${ref}^{commit}`);
  const [behind, ahead] = git('rev-list', '--left-right', '--count', `${baseline}...${sha}`).split(/\s+/).map(Number);
  const mergeBase = git('merge-base', baseline, sha);
  const patches = ahead ? git('cherry', baseline, sha).split('\n').filter(Boolean).map(line => ({
    sha: line.slice(2), patchEquivalent: line[0] === '-',
  })) : [];
  const changedPaths = git('diff', '--name-only', '-z', mergeBase, sha).split('\0').filter(Boolean);
  const matchingPaths = changedPaths.filter(p => git('ls-tree', baseline, '--', p) === git('ls-tree', sha, '--', p));
  return { ref, sha, mergeBase, ahead, behind, patches, changedPaths, matchingPaths,
    disposition: ahead === 0 ? 'incorporated-by-ancestry' : 'semantic-review-required',
    limitation: 'Patch and blob equality are evidence signals, not behavioral equivalence. No automatic merge or retirement.' };
}

export function branchInventory(root, baseline) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();
  const sha = git('rev-parse', '--verify', `${baseline}^{commit}`);
  const refs = git('for-each-ref', '--format=%(refname)', 'refs/remotes/origin/').split('\n')
    .filter(r => r && r !== 'refs/remotes/origin/HEAD' && r !== 'refs/remotes/origin/main')
    .map(r => r.slice('refs/remotes/'.length));
  return { baseline: sha, source: 'local remote-tracking refs; refresh explicitly before a later review',
    branches: refs.map(r => inspectBranch(root, sha, r)) };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(branchInventory(process.cwd(), process.argv[2] ?? 'HEAD'), null, 2));
}
