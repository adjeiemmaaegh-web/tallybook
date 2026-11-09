// R5: security headers stay present, strict and identical across Vercel and the Node server.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root = f => new URL('../' + f, import.meta.url);
const vercel = JSON.parse(readFileSync(root('vercel.json'), 'utf8'));
const headers = Object.fromEntries(vercel.headers[0].headers.map(h => [h.key, h.value]));
const serverSource = readFileSync(root('server/index.ts'), 'utf8');

test('vercel serves the baseline security headers', () => {
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.equal(headers['Referrer-Policy'], 'no-referrer');
  assert.match(headers['Strict-Transport-Security'], /max-age=\d{7,}/);
  assert.match(headers['Permissions-Policy'], /geolocation=\(\)/);
});

test('CSP is strict: no inline or eval scripts, no framing, no plugins, limited origins', () => {
  const csp = headers['Content-Security-Policy'];
  assert.ok(csp, 'a CSP header must be configured');
  const d = Object.fromEntries(csp.split(';').map(x => x.trim()).filter(Boolean).map(x => { const [k, ...v] = x.split(/\s+/); return [k, v]; }));
  assert.deepEqual(d['script-src'], ["'self'"]);
  assert.ok(!csp.includes("'unsafe-eval'"));
  assert.ok(!d['script-src'].includes("'unsafe-inline'"));
  assert.deepEqual(d['frame-ancestors'], ["'none'"]);
  assert.deepEqual(d['object-src'], ["'none'"]);
  assert.deepEqual(d['base-uri'], ["'self'"]);
  assert.ok(d['connect-src'].every(s => s === "'self'" || /^(https|wss):\/\/\*\.supabase\.co$/.test(s)), 'connect-src allows only self and Supabase');
  assert.ok(!Object.values(d).flat().includes('*'));
});

test('the Node server sends the same CSP as Vercel', () => {
  const csp = headers['Content-Security-Policy'];
  assert.ok(serverSource.includes(JSON.stringify(csp)), 'server/index.ts must carry the identical policy string');
});
