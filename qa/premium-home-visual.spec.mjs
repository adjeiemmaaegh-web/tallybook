import {test,expect} from '@playwright/test';

/**
 * Visual evidence for the REPLACEMENT dashboard composition. The former
 * fixed-coordinate screenshot checks described the old blue/indigo canvas
 * and are no longer meaningful after the owner-directed teal redesign.
 *
 * Retain real route links, financial data sources, sidebar keyboard behavior,
 * chart/screen-reader semantics and viewport-overflow checks.
 */
test('real local dashboard matches reference hierarchy at desktop and mobile widths',async({page},testInfo)=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/business');
  await page.getByRole('textbox',{name:'Business name'}).fill('Visual QA Shop');
  await page.getByRole('combobox',{name:'Business type'}).click();
  await page.getByRole('option',{name:'Retail shop'}).click();
  await page.getByRole('button',{name:'Save business'}).click();
  await page.getByRole('link',{name:'Go to staff unlock'}).click();
  await page.getByRole('textbox',{name:'Staff name'}).fill('Visual QA owner');
  await page.getByRole('textbox',{name:'New staff PIN'}).fill('392761');
  await page.getByRole('button',{name:'Create staff'}).click();
  await page.getByLabel('Staff member').selectOption({label:'Visual QA owner (owner)'});
  await page.getByRole('textbox',{name:'Staff PIN',exact:true}).fill('392761');
  await page.getByRole('button',{name:'Unlock',exact:true}).click();
  await page.getByRole('button',{name:'Lock this session'}).waitFor();
  // Preserve the authenticated staff session across viewport changes.
  await page.locator('.premium-desktop-rail').getByRole('link',{name:'Home',exact:true}).click();

  const widths=[
    {width:1536,height:1024},{width:1440,height:900},
    {width:1024,height:768},{width:768,height:1024},
    {width:390,height:844},{width:320,height:700}
  ];
  for(const viewport of widths){
    await page.setViewportSize(viewport);
    await expect(page.getByRole('heading',{name:'Good to see you'})).toBeVisible();
    await expect(page.getByLabel('Today at the till')).toBeVisible();
    await expect(page.locator('.tb-dashboard-till-total')).toContainText('GHS');
    await expect(page.locator('.tb-dashboard-till-cells > div')).toHaveCount(2);
    await expect(page.locator('.premium-kpi')).toHaveCount(4);
    await expect(page.getByRole('heading',{name:'Sales Overview'})).toBeVisible();
    await expect(page.getByRole('heading',{name:'Quick actions'})).toBeVisible();
    await expect(page.getByRole('heading',{name:'Getting Started with Tallybook'})).toBeVisible();
    await expect(page.getByRole('heading',{name:'Tips for Beginners'})).toBeVisible();
    await expect(page.locator('.premium-step')).toHaveCount(5);
    await expect(page.locator('.premium-action')).toHaveCount(5);
    await expect(page.getByRole('link',{name:'Search products in inventory'})).toBeVisible();
    await expect(page.getByRole('link',{name:'View alerts'})).toBeVisible();

    expect(await page.locator('.tb-dashboard-shortcuts a').evaluateAll(links=>links.map(link=>link.getAttribute('href'))))
      .toEqual(['/sales','/reports','/inventory']);
    expect(await page.locator('.premium-action').evaluateAll(links=>links.map(link=>link.getAttribute('href'))))
      .toEqual(['/sales','/inventory','/customers','/purchases','/reports']);
    expect(await page.locator('.premium-step').evaluateAll(links=>links.map(link=>link.getAttribute('href'))))
      .toEqual(['/business','/inventory','/customers','/sales','/reports']);

    const rects=await page.evaluate(()=>{
      const rect=selector=>{
        const el=document.querySelector(selector);
        if(!el)return null;
        const r=el.getBoundingClientRect();
        return {top:r.top+scrollY,bottom:r.bottom+scrollY,left:r.left,right:r.right};
      };
      return {
        welcome:rect('.tb-dashboard-welcome'),
        actions:rect('.tb-dashboard-shortcuts'),
        till:rect('.tb-dashboard-till'),
        metrics:rect('.tb-dashboard-metrics'),
        chart:rect('.premium-chart'),
        width:document.documentElement.clientWidth,
        scrollWidth:document.documentElement.scrollWidth,
      };
    });
    for(const field of ['welcome','actions','till','metrics','chart'])expect(rects[field],field+' missing at '+viewport.width).not.toBeNull();
    expect(rects.actions.top).toBeGreaterThanOrEqual(rects.welcome.top);
    expect(rects.till.top).toBeGreaterThanOrEqual(rects.actions.top);
    expect(rects.metrics.top).toBeGreaterThanOrEqual(rects.till.top);
    expect(rects.chart.top).toBeGreaterThanOrEqual(rects.metrics.top);
    expect(rects.scrollWidth,'No horizontal overflow at '+viewport.width).toBeLessThanOrEqual(rects.width+1);
    if(viewport.width>=1024){
      await expect(page.locator('.premium-desktop-rail')).toBeVisible();
      await expect(page.locator('.premium-desktop-rail').getByRole('link',{name:'Business details'})).toHaveAttribute('href','/business');
    }else{
      await expect(page.locator('.premium-desktop-rail')).toBeHidden();
      await page.getByRole('button',{name:'Open navigation menu'}).click();
      await expect(page.getByRole('dialog',{name:'Mobile navigation'})).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog',{name:'Mobile navigation'})).toHaveCount(0);
      await expect(page.getByRole('button',{name:'Open navigation menu'})).toBeFocused();
    }

    await page.screenshot({path:testInfo.outputPath('real-home-'+viewport.width+'.png'),fullPage:true});
    await page.getByRole('button',{name:'Let Clementia assist you'}).click();
    await expect(page.getByRole('dialog',{name:'Clementia assistant'})).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog',{name:'Clementia assistant'})).toHaveCount(0);
  }

  await page.locator('.tb-dashboard-shortcuts a[href="/reports"]').click();
  await expect(page).toHaveURL(/\/reports$/);
  await page.goBack();
  await expect(page.locator('.premium-step.done')).toHaveCount(2);
  await expect(page.locator('.premium-progress')).toHaveAttribute('aria-valuenow','2');
  expect(errors).toEqual([]);
});
