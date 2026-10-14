import { test, expect } from '@playwright/test';

test('premium home visual evidence on desktop and mobile with Clementia', async ({ page }, testInfo) => {
  await page.goto('/business', { waitUntil: 'networkidle' });
  await page.waitForLoadState('networkidle');
  await expect.poll(() => page.evaluate(() => document.readyState)).toBe('complete');
  await page.evaluate(async () => {
    const { saveBusinessProfile } = await import('/src/features/business/businessProfile.ts');
    await saveBusinessProfile({ name: 'Visual QA Shop', country: 'Ghana', currency: 'GHS', businessType: 'Retail' });
  });
  for (const viewport of [{ width: 1536, height: 1024 }, { width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 700 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Welcome to Tallybook/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Quick actions' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sales Overview' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Getting Started with Tallybook' })).toBeVisible();
    await expect(page.locator('.premium-step-cta')).toHaveCount(5);
    await expect(page.locator('.premium-action')).toHaveCount(5);
    expect(await page.locator('.premium-action').evaluateAll(links => links.map(link => link.getAttribute('href'))),
      'Every quick action must link to its real workflow').toEqual(['/sales','/inventory','/customers','/purchases','/reports']);
    expect(await page.locator('.premium-step').evaluateAll(links => links.map(link => link.getAttribute('href'))),
      'Every onboarding step must link to its real workflow').toEqual(['/business','/inventory','/customers','/sales','/reports']);
    await expect(page.locator('.premium-chart-period')).toHaveAttribute('href','/reports');
    await expect(page.locator('.premium-step.done .premium-step-cta')).toContainText(['Completed']);
    await expect(page.locator('.premium-step:not(.done) .premium-step-cta')).toHaveCount(4);
    await expect(page.locator('.premium-step:not(.done) .premium-step-cta').first()).toHaveText('Add Products');
    await expect(page.getByRole('heading', { name: 'Tips for Beginners' })).toBeVisible();
    await expect(page.locator('.today-dashboard')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Expenses Today' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Search products in inventory' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'View alerts' })).toBeVisible();
    if (viewport.width >= 1024) {
      await expect(page.locator('.premium-rail-setup')).toBeVisible();
      await expect(page.locator('.premium-rail-setup')).toContainText("Let's get your business ready.");
      await expect(page.locator('.premium-rail-setup')).toHaveAttribute('href', '/#getting-started');
      await expect(page.locator('#getting-started')).toBeVisible();
      await expect(page.locator('.clementia-launcher-label')).toBeVisible();
      await page.locator('.premium-rail-setup').click();
      await expect(page).toHaveURL(/#getting-started$/);
      await expect(page.locator('#getting-started')).toBeVisible();
      // Hash navigation is tested above; restore the top-of-page visual state for the reference screenshot.
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    }
    if (viewport.width === 1536) {
      // Reference anchors allow independent desktop fidelity review, not just element presence.
      const anchors = await page.evaluate(() => {
        const box = (selector) => {
          const el = document.querySelector(selector);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: Math.round(r.x + window.scrollX), y: Math.round(r.y + window.scrollY), w: Math.round(r.width), h: Math.round(r.height) };
        };
        return { header: box('.top-bar'), rail: box('.premium-desktop-rail'), kpis: box('.premium-kpis'), chart: box('.premium-chart'), setup: box('.premium-setup'), tips: box('.premium-side'), helper: box('.clementia-launcher') };
      });
      console.log('Round 6 reference anchors:', JSON.stringify(anchors));
      const near = (actual, expected, tolerance, label) => expect(Math.abs(actual - expected), label).toBeLessThanOrEqual(tolerance);
      expect(anchors.header).not.toBeNull();
      near(anchors.header.x, 0, 1, 'Full-width header origin');
      near(anchors.header.h, 65, 2, 'Header height');
      near(anchors.rail.w, 262, 2, 'Sidebar width');
      near(anchors.rail.y, 65, 2, 'Sidebar starts below header');
      near(anchors.kpis.x, 284, 10, 'KPI left edge');
      near(anchors.kpis.y, 180, 3, 'KPI top edge');
      near(anchors.chart.x, 284, 10, 'Chart left edge');
      near(anchors.chart.y, 318, 3, 'Chart top edge');
      near(anchors.chart.h, 414, 3, 'Chart height');
      const chartDetails = await page.evaluate(() => {
        const first = document.querySelector('.premium-line-chart svg circle');
        const note = document.querySelector('.premium-chart-empty-note');
        const rect = first?.getBoundingClientRect();
        const noteRect = note?.getBoundingClientRect();
        return { firstPointX: rect ? Math.round(rect.x + rect.width / 2) : null, noteY: noteRect ? Math.round(noteRect.y) : null };
      });
      expect(chartDetails.firstPointX).not.toBeNull();
      expect(chartDetails.noteY).not.toBeNull();
      near(chartDetails.firstPointX, 338, 7, 'Reference chart first data point');
      near(chartDetails.noteY, 452, 14, 'Reference empty-state message top edge');
      near(anchors.setup.y, 750, 3, 'Getting started top edge');
      near(anchors.tips.x, 1259, 12, 'Help-column origin');
      near(anchors.helper.w, 265, 2, 'Clementia help card width');
      near(anchors.helper.h, 176, 2, 'Clementia help card height');
      const documentHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      expect(documentHeight, 'Reference dashboard must fit in exactly the 1024px desktop viewport').toBeLessThanOrEqual(1025);
      const portrait = await page.evaluate(async () => {
        const response = await fetch('/premium-clementia.svg');
        if (!response.ok) return false;
        const body = await response.text();
        const b64 = body.match(/base64,([^"]+)/)?.[1];
        if (!b64) return false;
        const decoded = atob(b64);
        return decoded.slice(0, 4) === 'RIFF' && decoded.length === 4820;
      });
      expect(portrait, 'Owner-approved bundled Clementia portrait must be byte-complete').toBe(true);
    }
    await expect(page.locator('.premium-line-chart svg')).toBeVisible();
    const layout = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(layout.scroll, `Horizontal overflow at ${viewport.width}px`).toBeLessThanOrEqual(layout.client + 1);
    await expect(page.locator('.premium-line-chart svg polyline')).toHaveCount(1);
    await expect(page.locator('.premium-line-chart svg text')).toHaveCount(5);
    const ticks = await page.locator('.premium-line-chart svg text').allTextContents();
    expect(new Set(ticks).size).toBe(5);
    const captionOffsets = await page.evaluate(() => {
      const svg = document.querySelector('.premium-line-chart svg');
      const labels = [...document.querySelectorAll('.premium-line-labels small')];
      const points = [...document.querySelectorAll('.premium-line-chart svg circle')];
      if (!svg || labels.length !== 7 || points.length !== 7) return [Infinity];
      const rect = svg.getBoundingClientRect();
      return labels.map((label, i) => Math.abs(label.getBoundingClientRect().left + label.getBoundingClientRect().width / 2 - (rect.left + Number(points[i].getAttribute('cx')) / 700 * rect.width)));
    });
    expect(Math.max(...captionOffsets), `Chart day-label misalignment at ${viewport.width}px`).toBeLessThanOrEqual(2);
    await expect(page.locator('.premium-step.done')).toHaveCount(1);
    await expect(page.locator('.premium-chart-empty-note')).toContainText('No sales yet');
    await expect(page.locator('.clementia-launcher .clementia-avatar svg')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Let Clementia assist you' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`home-${viewport.width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Let Clementia assist you' }).click();
    const clementia = page.getByRole('dialog', { name: 'Clementia assistant' });
    await expect(clementia).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`clementia-${viewport.width}.png`), fullPage: true });

    // Regression: maximizing used to route to /assistant and strand users there
    // without a minimize control. Resizing must preserve unsent text and route.
    const draft = 'My draft question stays here when I resize Clementia';
    const composer = clementia.getByRole('textbox', { name: "Message TallyBook's assistant" });
    await composer.fill(draft);
    await clementia.getByRole('button', { name: 'Maximize Clementia' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(clementia).toHaveClass(/clementia-panel-maximized/);
    await expect(clementia).toHaveAttribute('aria-modal', 'true');
    await expect(clementia.getByRole('button', { name: 'Minimize Clementia' })).toBeFocused();
    await expect(composer).toHaveValue(draft);
    const expandedBox = await clementia.boundingBox();
    expect(expandedBox?.width, 'Maximized assistant fills viewport width').toBeGreaterThanOrEqual(viewport.width - 1);
    expect(expandedBox?.height, 'Maximized assistant fills viewport height').toBeGreaterThanOrEqual(viewport.height - 1);
    if (viewport.width === 1536 || viewport.width === 390) {
      await page.screenshot({ path: testInfo.outputPath(`clementia-maximized-${viewport.width}.png`) });
    }

    await clementia.getByRole('button', { name: 'Minimize Clementia' }).click();
    await expect(clementia).not.toHaveClass(/clementia-panel-maximized/);
    await expect(clementia).toHaveAttribute('aria-modal', 'false');
    await expect(clementia.getByRole('button', { name: 'Maximize Clementia' })).toBeFocused();
    await expect(composer).toHaveValue(draft);
    await clementia.getByRole('button', { name: 'Maximize Clementia' }).click();
    await page.keyboard.press('Escape');
    await expect(clementia).toBeVisible();
    await expect(clementia).not.toHaveClass(/clementia-panel-maximized/);
    await expect(composer).toHaveValue(draft);
    await page.keyboard.press('Escape');
    await expect(clementia).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Let Clementia assist you' })).toBeFocused();
    if (viewport.width < 640) {
      await expect(page.getByRole('link', { name: 'Business settings' })).toBeHidden();
      await expect(page.getByRole('link', { name: 'Backup', exact: true })).toBeHidden();
      await expect(page.getByRole('link', { name: 'View alerts' })).toBeVisible();
      const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      if (width.scroll > width.client + 1) {
        const offenders = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > document.documentElement.clientWidth + 1 && getComputedStyle(el).position !== 'fixed'; }).slice(0, 12).map(el => ({ tag: el.tagName, className: String(el.className).slice(0, 100), right: Math.round(el.getBoundingClientRect().right) })));
        console.log('Mobile overflow offenders:', JSON.stringify(offenders));
      }
      expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
    }
    if (viewport.width === 768) {
      await expect(page.locator('.premium-desktop-rail')).toBeHidden();
      const tabletShell = await page.evaluate(() => {
        const content = document.querySelector('.page-content')?.getBoundingClientRect();
        const rail = document.querySelector('.premium-desktop-rail');
        return {
          width: document.documentElement.clientWidth,
          contentLeft: content?.left,
          contentWidth: content?.width,
          railDisplay: rail ? getComputedStyle(rail).display : null,
        };
      });
      expect(tabletShell.railDisplay, 'Tablet must not show the desktop sidebar').toBe('none');
      expect(tabletShell.contentLeft, 'Tablet dashboard must begin at the left side of the viewport').toBeLessThanOrEqual(24);
      expect(tabletShell.contentWidth, 'Tablet dashboard must use the full viewport').toBeGreaterThanOrEqual(720);
    }
    if (viewport.width < 1024) {
      await page.getByRole('button', { name: 'Open navigation menu' }).click();
      await expect(page.getByRole('dialog', { name: 'Mobile navigation' })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('mobile-navigation.png'), fullPage: true });
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: 'Mobile navigation' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Open navigation menu' })).toBeFocused();
      if (viewport.width === 768) {
        await page.getByRole('button', { name: 'Open navigation menu' }).click();
        await page.getByRole('dialog', { name: 'Mobile navigation' }).getByRole('link', { name: 'Inventory', exact: true }).click();
        await expect(page).toHaveURL(/\/inventory$/);
        await expect(page.getByRole('dialog', { name: 'Mobile navigation' })).toHaveCount(0);
      }
    }
  }
  // Backward compatibility: users already stranded on the old full-page
  // /assistant route can minimize to the floating panel after updating.
  await page.goto('/assistant', { waitUntil: 'networkidle' });
  await expect(page.getByRole('button', { name: 'Minimize Clementia' })).toBeVisible();
  await page.getByRole('button', { name: 'Minimize Clementia' }).click();
  await expect(page).toHaveURL(/\/$/);
  const restoredPanel = page.getByRole('dialog', { name: 'Clementia assistant' });
  await expect(restoredPanel).toBeVisible();
  await expect(restoredPanel.getByRole('button', { name: 'Maximize Clementia' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(restoredPanel).toHaveCount(0);

  // Visiting Reports marks only this local company's optional exploration step complete.
  await page.goto('/reports', { waitUntil: 'networkidle' });
  await expect(page).toHaveURL(/\/reports$/);
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: /Welcome to Tallybook/ })).toBeVisible();
  await expect(page.locator('.premium-step.done')).toHaveCount(2);
  await expect(page.locator('.premium-progress')).toHaveAttribute('aria-valuenow', '2');
  await expect(page.locator('.premium-step.done')).toContainText(['Set up your business','Explore reports']);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('.premium-step.done')).toHaveCount(2);
});
