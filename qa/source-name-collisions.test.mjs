import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

// macOS and Windows file systems ignore letter case, so "./Foo" can resolve to foo.ts there
// while it resolves to Foo.tsx on Linux. Two source files whose names differ only in case
// (ignoring .ts/.tsx) must never exist.
test('no two source files differ only by letter case', () => {
  const files = execFileSync('git', ['ls-files', 'client/src', 'server', 'shared'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  const seen = new Map();
  const clashes = [];
  for (const f of files) {
    const bare = f.replace(/\.(tsx?|jsx?|mjs)$/, '');
    const key = bare.toLowerCase();
    const prior = seen.get(key);
    if (prior !== undefined && prior !== bare) clashes.push(`${prior} <-> ${bare}`); else seen.set(key, bare);
  }
  assert.deepEqual(clashes, []);
});
