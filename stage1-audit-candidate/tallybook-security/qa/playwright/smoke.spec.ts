import {test,expect} from '@playwright/test';
test('app starts without uncaught page errors',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await expect(page.locator('body')).toBeVisible();expect(errors).toEqual([]);
});
// Add selectors and auth through project-specific page objects; do not assume UI labels.
