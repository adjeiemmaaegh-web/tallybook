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
      window.__cspViolations.push(`${event.violatedDirective} blocked ${event.blockedURI || '(inline)'} at ${event.sourceFile || ''}:${event.lineNumber || 0}`);
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
  expect(violations, violations.join('\n')).toEqual([]);
});
