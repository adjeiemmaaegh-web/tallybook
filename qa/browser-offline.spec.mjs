import { test, expect } from '@playwright/test';

for (const scenario of [{width:1280, tax:false}, {width:390, tax:false}, {width:390, tax:true}]) {
  const viewport = {width:scenario.width,height:900};
  test(`production PWA checkout and receipt survive offline reload at ${viewport.width}px tax=${scenario.tax}`, async ({ page, context }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('/sales');
    await page.waitForFunction(async () => (await indexedDB.databases()).some(db => db.name === 'tallybook-db' && db.version >= 260));
    await page.evaluate(async (withTax) => {
      const request = indexedDB.open('tallybook-db');
      const db = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      const now = new Date().toISOString();
      const tx = db.transaction(['businessProfiles', 'products', 'inventoryMovements', 'inventoryCostEvents'], 'readwrite');
      tx.objectStore('businessProfiles').put({ id: 'primary', name: 'Offline QA shop', country: 'Ghana', currency: 'GHS', businessType: 'Retail shop', preferredPaymentMethod: 'cash', ...(withTax ? {taxPolicy:{enabled:true,registrationStatus:'registered',label:'QA tax',rateBasisPoints:1000,priceMode:'exclusive'}} : {}), createdAt: now, updatedAt: now });
      tx.objectStore('products').put({ id: 'qa-rice', businessProfileId: 'primary', name: 'Rice', normalizedName: 'rice', sku: 'RICE-QA', stockQuantity: 3, sellingPriceMinor: 1000, costPriceMinor: 200, lowStockThreshold: 1, createdAt: now, updatedAt: now });
      tx.objectStore('inventoryMovements').put({ id: 'qa-opening-movement', businessProfileId: 'primary', productId: 'qa-rice', movementType: 'initial', quantityDelta: 3, previousQuantity: 0, resultingQuantity: 3, createdAt: now });
      tx.objectStore('inventoryCostEvents').put({ id: 'qa-opening-cost', businessProfileId: 'primary', productId: 'qa-rice', sequence: 1, kind: 'opening', sourceId: 'qa-opening-movement', quantityDelta: 3, unitCostMinor: 200, allocations: [], createdAt: now });
      await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error); });
      db.close();
      await navigator.serviceWorker.ready;
    }, scenario.tax);
    await page.reload();
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Make a sale.', exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Scan or enter SKU or barcode' }).fill('RICE-QA');
    await page.getByRole('button', { name: 'Add item', exact: true }).click();
    await page.getByRole('button', { name: 'Complete sale', exact: true }).click();
    await expect(page.locator('.receipt-confirmation')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('offline-receipt.png'), fullPage: true });
    await page.reload();
    const ledger = await page.evaluate(async () => {
      const request = indexedDB.open('tallybook-db');
      const db = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      const tx = db.transaction(['sales', 'saleLines', 'payments', 'receipts', 'products', 'inventoryCostEvents'], 'readonly');
      const rows = await Promise.all(['sales', 'saleLines', 'payments', 'receipts', 'products', 'inventoryCostEvents'].map(name => new Promise((resolve, reject) => { const request = tx.objectStore(name).getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); })));
      db.close(); return rows;
    });
    expect(ledger[0]).toHaveLength(1);
    expect(ledger[0][0]).toMatchObject({ totalMinor: scenario.tax ? 1100 : 1000, cogsMinor: 200, costStatus: 'verified' });
    if (scenario.tax) expect(ledger[0][0].tax).toMatchObject({taxMinor:100,taxableMinor:1000});
    expect(ledger[1]).toHaveLength(1); expect(ledger[2]).toHaveLength(1); expect(ledger[3]).toHaveLength(1);
    expect(ledger[4][0].stockQuantity).toBe(2); expect(ledger[5]).toHaveLength(2);
    await expect(page.getByRole('heading', { name: 'Every completed sale has a line.', exact: true })).toBeVisible();
    await expect(page.getByText(ledger[0][0].receiptNumber, { exact: true })).toBeVisible();
  });
}
