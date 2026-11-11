import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// WCAG 2.0 A/AA scan (axe-core) of the signed-out account screens at phone and desktop width:
// sign in, the error state, create account and password reset.
const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

async function scan(page, label) {
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
  await page.waitForTimeout(300);
  await page.evaluate(axeSource);
  const found = await page.evaluate(async () => (await axe.run({ runOnly: ['wcag2a', 'wcag2aa'] })).violations
    .flatMap(v => v.nodes.map(n => `${v.id}: ${n.target.slice(-1)[0]} (${n.any[0]?.data?.contrastRatio ?? ''})`)));
  return found.map(f => `${label}  ${f}`);
}

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
  test(`account screens have no WCAG A/AA violations at ${viewport.width}px`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize(viewport);
    const problems = [];
    await page.goto('/signin');
    await page.locator('.tb-auth-shell').waitFor();
    problems.push(...await scan(page, 'sign in'));

    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Enter a valid email address.');
    problems.push(...await scan(page, 'sign in (error)'));

    await page.getByRole('button', { name: 'Create an account' }).click();
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
    problems.push(...await scan(page, 'create account'));

    await page.goto('/reset-password');
    await expect(page.getByRole('alert')).toContainText('missing, invalid or expired');
    problems.push(...await scan(page, 'password reset (invalid link)'));
    expect(problems, problems.join('\n')).toEqual([]);
  });
}
