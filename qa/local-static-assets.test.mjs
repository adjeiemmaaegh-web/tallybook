import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { checkStaticAssets } from '../tools/check-static-assets.mjs';

async function tempBundle(t, index) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tally-static-check-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'assets'));
  await fs.writeFile(path.join(root, 'index.html'), index);
  await fs.writeFile(path.join(root, 'assets', 'index-abcd.js'), 'console.log("ok");');
  return root;
}

test('static build checker accepts a bundled React/Vite entry', async t => {
  const root = await tempBundle(t, '<div id="root"></div><script type="module" src="/assets/index-abcd.js"></script>');
  assert.deepEqual(await checkStaticAssets(root), { assets: 1 });
});

test('static build checker rejects raw source index or missing generated assets', async t => {
  const root = await tempBundle(t, '<div id="root"></div><script type="module" src="/src/main.tsx"></script>');
  await assert.rejects(checkStaticAssets(root), /Source HTML/);
  await fs.writeFile(path.join(root, 'index.html'), '<div id="root"></div><script type="module" src="/assets/missing.js"></script>');
  await assert.rejects(checkStaticAssets(root), /ENOENT/);
});
