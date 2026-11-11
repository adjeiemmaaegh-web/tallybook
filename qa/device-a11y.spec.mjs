import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// Automated WCAG 2.0 A/AA scan (axe-core) of every local-ledger screen at phone width.
// It keeps the contrast work from regressing; it does not replace testing with real people and devices.
const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const routes = ['/', '/inventory', '/customers', '/quotations', '/customer-benefits', '/sales', '/staff', '/stores', '/commerce',
  '/alerts', '/sync-status', '/reports', '/insights', '/financial-intelligence', '/end-of-day', '/purchases', '/expenses',
  '/business-health', '/backup', '/assistant', '/business'];

test('every local-ledger screen has no WCAG A/AA violations at 390px', async ({ page }) => {
  test.setTimeout(240000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/business');
  await page.getByRole('textbox', { name: 'Business name' }).fill('Accessibility Shop');
  await page.getByRole('combobox', { name: 'Business type' }).click();
  await page.getByRole('option', { name: 'Retail shop' }).click();
  await page.getByRole('button', { name: 'Save business' }).click();
  await page.getByRole('link', { name: 'Go to staff unlock' }).click();
  await page.getByRole('textbox', { name: 'Staff name' }).fill('A11y owner');
  await page.getByRole('textbox', { name: 'New staff PIN' }).fill('392761');
  await page.getByRole('button', { name: 'Create staff' }).click();
  await page.getByLabel('Staff member').selectOption({ label: 'A11y owner (owner)' });
  await page.getByRole('textbox', { name: 'Staff PIN', exact: true }).fill('392761');
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await page.getByRole('button', { name: 'Lock this session' }).waitFor();

  const problems = [];
  for (const route of routes) {
    // Client-side navigation keeps the unlocked staff session.
    await page.evaluate(r => { history.pushState({}, '', r); dispatchEvent(new PopStateEvent('popstate')); }, route);
    // Measure final colours: a screen part-way through its fade-in blends text and background together.
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
    await page.waitForTimeout(400);
    await page.evaluate(axeSource);
    const found = await page.evaluate(async () => (await axe.run({ runOnly: ['wcag2a', 'wcag2aa'] })).violations
      .flatMap(v => v.nodes.map(n => `${v.id}: ${n.target.slice(-1)[0]} (${n.any[0]?.data?.contrastRatio ?? ''})`)));
    for (const f of found) problems.push(`${route}  ${f}`);
  }
  expect(problems, problems.join('\n')).toEqual([]);
});
