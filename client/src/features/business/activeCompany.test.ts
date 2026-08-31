import { afterEach, describe, expect, it } from "vitest";
import { TallybookDB } from "@/db/TallybookDB";
import { clearCompanyData, getActiveBusinessProfileId, loadActiveBusinessProfileId, persistActiveBusinessProfileId, setActiveBusinessProfileId } from "@/features/business/activeCompany";

const databases: TallybookDB[] = [];
let testNumber = 0;
function makeDatabase() { const database = new TallybookDB(`tallybook-company-test-${Date.now()}-${++testNumber}`); databases.push(database); return database; }
const date = "2026-08-01T00:00:00.000Z";
const profile = (id: string, name: string) => ({ id, name, country: "Ghana", currency: "GHS", businessType: "Retail shop", phone: "", email: "", address: "", createdAt: date, updatedAt: date });

afterEach(async () => { setActiveBusinessProfileId("primary"); await Promise.all(databases.splice(0).map(async (database) => { database.close(); await database.delete(); })); });

describe("local company workspaces", () => {
  it("persists and restores the selected company", async () => {
    const database = makeDatabase(); await database.open();
    await database.businessProfiles.bulkPut([profile("primary", "Main Shop"), profile("company-two", "Catering")]);
    await persistActiveBusinessProfileId("company-two", database);
    setActiveBusinessProfileId("primary");
    expect(await loadActiveBusinessProfileId(database)).toBe("company-two");
    expect(getActiveBusinessProfileId()).toBe("company-two");
  });

  it("clears only the selected company and preserves another workspace", async () => {
    const database = makeDatabase(); await database.open();
    await database.businessProfiles.bulkPut([profile("primary", "Main Shop"), profile("company-two", "Catering")]);
    await database.products.bulkPut([
      { id: "product-main", businessProfileId: "primary", name: "Soap", normalizedName: "soap", sellingPriceMinor: 100, stockQuantity: 2, lowStockThreshold: 1, createdAt: date, updatedAt: date },
      { id: "product-two", businessProfileId: "company-two", name: "Cake", normalizedName: "cake", sellingPriceMinor: 200, stockQuantity: 3, lowStockThreshold: 1, createdAt: date, updatedAt: date },
    ]);
    await persistActiveBusinessProfileId("company-two", database);
    await clearCompanyData("company-two", database);
    expect(await database.businessProfiles.get("primary")).toMatchObject({ name: "Main Shop" });
    expect(await database.businessProfiles.get("company-two")).toBeUndefined();
    expect(await database.products.get("product-main")).toMatchObject({ businessProfileId: "primary", stockQuantity: 2 });
    expect(await database.products.get("product-two")).toBeUndefined();
    expect(getActiveBusinessProfileId()).toBe("primary");
  });
});
