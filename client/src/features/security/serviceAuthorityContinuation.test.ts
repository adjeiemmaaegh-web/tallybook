/** Continuation regressions: authorization is required by the write service,
 * not just a page button. Execute with the full Vitest/IndexedDB suite. */
import Dexie from "dexie";
import { webcrypto } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { TallybookDB, initializeDatabase } from "@/db/TallybookDB";
import { saveBusinessProfile } from "@/features/business/businessProfile";
import { setActiveBusinessProfileId } from "@/features/business/activeCompany";
import { createCustomer, updateCustomer, archiveCustomer } from "@/features/customers/customers";
import { createProduct } from "@/features/inventory/inventory";
import { registerBatch, saveStockCountSession, setCatalogueOptions } from "@/features/inventory/stage2Inventory";
import { createStaff, lockStaff, unlockStaff } from "@/features/staff/staff";

if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });
const opened: TallybookDB[] = [];
async function setup() {
  setActiveBusinessProfileId("primary");
  const database = new TallybookDB(`continuation-authority-${Date.now()}-${opened.length}`);
  opened.push(database);
  await initializeDatabase(database);
  await saveBusinessProfile({ name: "Test Shop", country: "Ghana", currency: "GHS", businessType: "Retail shop", phone: "", email: "", address: "" }, database);
  return database;
}
afterEach(async () => {
  lockStaff("primary");
  setActiveBusinessProfileId("primary");
  for (const database of opened.splice(0)) {
    const name = database.name;
    database.close();
    await new Dexie(name).delete();
  }
});

describe("transaction-bound customer and inventory permissions", () => {
  it("denies direct customer creates, edits, and archives after staff lock", async () => {
    const database = await setup();
    const owner = await createStaff("Owner", "owner", "123456", database);
    const input = { name: "Ama Mensah", phone: "0241234567", email: "", address: "", notes: "", status: "active" as const };
    await expect(createCustomer(input, database)).rejects.toThrow(/locked/);
    expect(await database.customers.count()).toBe(0);
    await unlockStaff(owner.id, "123456", database);
    const customer = await createCustomer(input, database);
    lockStaff("primary");
    await expect(updateCustomer(customer.id, {...input, name:"Changed"}, database)).rejects.toThrow(/locked/);
    await expect(archiveCustomer(customer.id, database)).rejects.toThrow(/locked/);
    const saved = await database.customers.get(customer.id);
    expect(saved?.name).toBe("Ama Mensah");
    expect(saved?.archivedAt).toBeUndefined();
  });

  it("denies direct catalogue, count-session, and batch changes after staff lock", async () => {
    const database = await setup();
    const product = await createProduct({name:"Eggs",sku:"",categoryId:"uncategorized",sellingPrice:"5",costPrice:"",initialStock:"5",lowStockThreshold:"1"},"GHS",database);
    const owner = await createStaff("Owner", "owner", "123456", database);
    await expect(setCatalogueOptions(product.id,{baseUnit:"unit"},database)).rejects.toThrow(/locked/);
    await expect(saveStockCountSession([product.id],database)).rejects.toThrow(/locked/);
    await expect(registerBatch(product.id,"B1",1,undefined,database)).rejects.toThrow(/locked/);
    expect(await database.inventoryBatches.count()).toBe(0);
    await unlockStaff(owner.id,"123456",database);
    await setCatalogueOptions(product.id,{baseUnit:"unit"},database);
    expect((await database.products.get(product.id))?.baseUnit).toBe("unit");
  });
});
