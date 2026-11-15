// The production Content-Security-Policy is enforced (vercel.json, server/index.ts).
// `vite preview` serves the same policy (see vite.config.ts), so this walks the built
// app's main screens and fails on any CSP violation: an inline or eval script, an
// unlisted origin, a blocked worker or font would all surface here before release.
import { test, expect } from '@playwright/test';

const routes = ['/', '/welcome', '/signin', '/shop', '/sales', '/inventory', '/reports', '/assistant', '/backup', '/staff'];

test('the built app runs under the enforced production CSP without violations', async ({ page }) => {
  const violations = [];
  page.on('console', message => {
    const text = message.text();
    if (/Content Security Policy/i.test(text)) violations.push(`console: ${text}`);
  });
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', event => {
      window.__cspViolations.push(`${event.violatedDirective} blocked ${event.blockedURI || '(inline)'} at ${event.sourceFile || ''}:${event.lineNumber || 0}:${event.columnNumber || 0}`);
    });
  });

  const first = await page.goto('/');
  const header = first?.headers()['content-security-policy'] ?? '';
  expect(header, 'preview must serve the enforcing policy, not report-only').toContain("script-src 'self'");
  expect(first?.headers()['content-security-policy-report-only']).toBeUndefined();

  for (const route of routes) {
    await page.goto(route);
    await page.waitForLoadState('load');
    await page.waitForTimeout(800);
    const found = await page.evaluate(() => window.__cspViolations ?? []);
    for (const v of found) violations.push(`${route}: ${v}`);
  }
  // Service worker registration and its precache must also be allowed.
  await expect.poll(() => page.evaluate(async () => Boolean(await navigator.serviceWorker.getRegistration())), { timeout: 30000 }).toBe(true);
  // Show the code around each violation so a failure names the offending library.
  const context = [];
  for (const where of new Set(violations.map(v => v.match(/at (http\S+):(\d+):(\d+)$/)).filter(Boolean).map(m => `${m[1]}|${m[2]}|${m[3]}`))) {
    const [file, line, column] = where.split('|');
    const text = await page.evaluate(async url => (await fetch(url)).text(), file);
    const row = text.split('\n')[Number(line) - 1] ?? '';
    const at = Math.max(0, Number(column) - 1);
    context.push(`${file}:${line}:${column}\n  …${row.slice(Math.max(0, at - 240), at + 160)}…`);
  }
  expect(violations, [...violations, ...context].join('\n')).toEqual([]);
});
