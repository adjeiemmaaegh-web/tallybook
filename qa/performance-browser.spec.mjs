import {test,expect} from '@playwright/test';
const p95=rows=>rows.slice().sort((a,b)=>a-b)[Math.ceil(rows.length*.95)-1];

for(const width of [390,1280]){
  test('built production shell loads without JavaScript exceptions at '+width+'px',async({page},info)=>{
    await page.setViewportSize({width,height:844});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    const rows=[];
    for(const route of ['/welcome','/signin','/welcome']){
      const response=await page.goto(route,{waitUntil:'load'});
      expect(response?.ok()).toBe(true);
      await expect(page.locator('#root')).not.toBeEmpty();
      rows.push(await page.evaluate(()=>{
        const nav=performance.getEntriesByType('navigation').at(-1);
        const resources=performance.getEntriesByType('resource');
        return {
          route:location.pathname,
          loadEventEndMs:nav?.loadEventEnd??-1,
          domContentLoadedMs:nav?.domContentLoadedEventEnd??-1,
          transferSizeBytes:nav?.transferSize??0,
          resourceCount:resources.length,
          jsResourceCount:resources.filter(r=>/\.js(?:\?|$)/.test(r.name)).length,
          cssResourceCount:resources.filter(r=>/\.css(?:\?|$)/.test(r.name)).length,
          jsTransferBytes:resources.filter(r=>/\.js(?:\?|$)/.test(r.name))
            .reduce((sum,r)=>sum+(r.transferSize||0),0),
        };
      }));
    }
    const durations=rows.map(r=>r.loadEventEndMs);
    const measurement={width,routes:rows,p95LoadEventMs:p95(durations),
      pageErrors:errors};
    await info.attach('production-shell-performance.json',{
      body:JSON.stringify(measurement,null,2),contentType:'application/json'
    });
    console.log('TALLYBOOK_PERFORMANCE '+JSON.stringify(measurement));
    expect(errors).toEqual([]);
    expect(rows.every(r=>r.loadEventEndMs>=0&&r.domContentLoadedMs>=0)).toBe(true);
    expect(rows.every(r=>r.resourceCount>0)).toBe(true);
    // An intentionally tolerant slow-runner ceiling, not a performance SLA.
    // Actual p95 and bundle transfer sizes are retained for review.
    expect(measurement.p95LoadEventMs).toBeLessThan(30000);
  });
}
