import { test, expect } from "@playwright/test";

/** Browser tests are authored for deferred Windows execution; they must NOT be called passing until run. */
async function createLocalCompany(page) {
  await page.goto("/business");
  await page.evaluate(async () => {
    const { saveBusinessProfile } = await import("/src/features/business/businessProfile.ts");
    await saveBusinessProfile({
      name: "Premium Settings QA", country: "Ghana", currency: "GHS", businessType: "Retail",
    });
  });
  await page.goto("/");
}

test("business setup preserves all sections and settings at desktop and phone widths", async ({ page }, testInfo) => {
  await createLocalCompany(page);
  for (const size of [{width:1440,height:900},{width:1024,height:768},{width:768,height:1024},{width:390,height:844},{width:320,height:700}]) {
    await page.setViewportSize(size);
    await page.goto("/business");
    await expect(page.getByRole("heading", { name: "Business setup" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your business details" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Business identity" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Trading & payments" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Contact information" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tax settings" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Providers you accept at checkout." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Manage companies" })).toHaveAttribute("href", "/business?view=companies");
    await expect(page.getByRole("link", { name: "Staff & permissions" })).toHaveAttribute("href", "/staff");
    await expect(page.getByRole("button", { name: "Save changes" })).toBeVisible();
    const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
    expect(widths.scroll, "No page overflow at " + size.width).toBeLessThanOrEqual(widths.viewport + 1);
    await page.screenshot({ path: testInfo.outputPath("business-setup-" + size.width + ".png"), fullPage: true });
  }
  await page.getByRole("link", { name: "Manage companies" }).click();
  await expect(page.getByRole("heading", { name: "Your companies" })).toBeVisible();
  await expect(page.getByText("Premium Settings QA")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Add another company." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Clear this company from this phone." })).toBeVisible();
  await expect(page.getByRole("button", { name: /Clear Premium Settings QA from this phone/ })).toBeDisabled();
});

test("staff owner-first setup, separate masked PIN fields, permissions, shift and responsive layout", async ({page},testInfo) => {
  await createLocalCompany(page);
  await page.goto("/staff");
  await expect(page.getByRole("heading", { name: "Staff & permissions" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Create your first owner" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create owner account" })).toBeDisabled();
  const newPin = page.getByRole("textbox", {name:"New staff PIN"});
  await expect(newPin).toHaveAttribute("type","password");
  await page.getByRole("textbox", {name:"Staff name"}).fill("Settings QA Owner");
  await newPin.fill("12345678");
  await page.getByRole("button",{name:"Create owner account"}).click();
  await expect(page.getByText("Settings QA Owner").first()).toBeVisible();

  await page.getByRole("combobox",{name:"Staff member"}).selectOption({label:"Settings QA Owner (owner)"});
  const unlockPin = page.getByRole("textbox",{name:"Staff PIN"});
  await expect(unlockPin).toHaveAttribute("type","password");
  await unlockPin.fill("12345678");
  await page.getByRole("button",{name:"Unlock with PIN"}).click();
  await expect(page.getByRole("button",{name:"Lock this session"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Add a staff member"})).toBeVisible();

  await page.getByRole("textbox",{name:"Staff name"}).fill("Settings QA Cashier");
  await page.getByRole("textbox",{name:"New staff PIN"}).fill("87654321");
  await page.getByRole("button",{name:"Add team member"}).click();
  await expect(page.getByText("Settings QA Cashier")).toBeVisible();
  await page.getByText("Role permissions").click();
  await expect(page.getByText("Make sales")).toBeVisible();
  await expect(page.getByText("Create sales and use cashier shifts")).toBeVisible();

  await page.getByRole("button",{name:"Disable account"}).click();
  await expect(page.getByRole("button",{name:"Confirm disable"})).toBeVisible();
  await page.getByRole("button",{name:"Cancel"}).click();
  await expect(page.getByRole("button",{name:"Confirm disable"})).toHaveCount(0);

  for (const size of [{width:1440,height:900},{width:768,height:1024},{width:390,height:844},{width:320,height:700}]) {
    await page.setViewportSize(size);
    await expect(page.getByRole("heading", { name: "Staff & permissions" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Cashier shift" })).toBeVisible();
    const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
    expect(widths.scroll, "No page overflow at " + size.width).toBeLessThanOrEqual(widths.viewport + 1);
    await page.screenshot({ path: testInfo.outputPath("staff-permissions-" + size.width + ".png"), fullPage: true });
  }

  await page.getByRole("textbox", { name: "Opening float (minor units)" }).fill("0");
  await page.getByRole("button", { name: "Open cashier shift" }).click();
  await expect(page.getByText("Shift in progress")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Counted cash (minor units)" })).toBeVisible();
  await page.getByRole("textbox", { name: "Counted cash (minor units)" }).fill("0");
  await expect(page.getByRole("button", { name: "Close shift & record variance" })).toBeEnabled();
  await page.getByRole("button", { name: "Close shift & record variance" }).click();
  await expect(page.getByRole("button", { name: "Open cashier shift" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Shift history" })).toBeVisible();
});
