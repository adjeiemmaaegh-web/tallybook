import {test,expect} from '@playwright/test';

test('password recovery stays reachable before friends-test sign-in without opening the ledger',async({page})=>{
  await page.goto('/reset-password',{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:'Reset Tallybook password'})).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Recovery link is missing');
  expect(await page.evaluate(async()=>
    (await indexedDB.databases()).some(database=>database.name==='tallybook-db'))).toBe(false);
});
