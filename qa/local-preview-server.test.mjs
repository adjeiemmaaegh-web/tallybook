import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { once } from 'node:events';
import { createPreviewServer } from '../tools/local-preview-server.mjs';

async function runPreview(t, run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tally-local-preview-'));
  const file = async (name, content) => {
    const target = path.join(root, name);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  };
  await file('index.html', '<title>Tallybook local preview</title>');
  await file('assets/app.js', 'console.log("local-preview")');
  const srv = createPreviewServer({ distRoot: root });
  srv.listen(0, '127.0.0.1');
  await once(srv, 'listening');
  const url = `http://127.0.0.1:${srv.address().port}`;
  t.after(async () => {
    await new Promise(resolve => srv.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  });
  await run({ url, file, root });
}

test('local preview serves built SPA and static JavaScript with correct content type', async t => {
  await runPreview(t, async ({ url }) => {
    const root = await fetch(url);
    assert.equal(root.status, 200);
    assert.match(await root.text(), /Tallybook local preview/);
    const app = await fetch(`${url}/assets/app.js`);
    assert.equal(app.status, 200);
    assert.match(app.headers.get('content-type'), /javascript/);
    assert.match(await app.text(), /local-preview/);
    const deep = await fetch(`${url}/sales/history`);
    assert.equal(deep.status, 200);
    assert.match(await deep.text(), /Tallybook local preview/);
  });
});

test('local preview fails closed on API and all write methods', async t => {
  await runPreview(t, async ({ url }) => {
    const api = await fetch(`${url}/api/sync/status`);
    assert.equal(api.status, 503);
    const post = await fetch(`${url}/`, { method: 'POST', body: 'private' });
    assert.equal(post.status, 405);
    const health = await fetch(`${url}/_local/healthz`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ready: true, mode: 'unverified-local-preview', cloudSync: false, livePayments: false });
  });
});

test('local preview never returns missing assets, hidden files or symlinked private files', async t => {
  await runPreview(t, async ({ url, file, root }) => {
    await file('.env', 'REAL_SECRET=do-not-serve');
    const hidden = await fetch(`${url}/.env`);
    assert.equal(hidden.status, 404);
    assert.equal((await hidden.text()).includes('REAL_SECRET'), false);
    assert.equal((await fetch(`${url}/assets/missing.js`)).status, 404);
    const privateRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tally-private-'));
    t.after(() => fs.rm(privateRoot, { recursive: true, force: true }));
    const secret = path.join(privateRoot, 'secret.txt');
    await fs.writeFile(secret, 'VERY_PRIVATE');
    await fs.symlink(secret, path.join(root, 'assets', 'linked.txt'));
    assert.equal((await fetch(`${url}/assets/linked.txt`)).status, 404);
  });
});

test('local preview supports HEAD without returning a body', async t => {
  await runPreview(t, async ({ url }) => {
    const result = await fetch(`${url}/assets/app.js`, { method: 'HEAD' });
    assert.equal(result.status, 200);
    assert.equal(await result.text(), '');
    assert.equal(result.headers.get('x-content-type-options'), 'nosniff');
  });
});
