/** Tactile Ledger testing reminder: products and movements must agree after every local change; quantity history is never silently replaced. */
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { TallybookDB, initializeDatabase } from "@/db/TallybookDB";
import { adjustStock, archiveProduct, createCategory, createProduct, getInventorySnapshot, isLowStock, updateProduct } from "@/features/inventory/inventory";
import { persistActiveBusinessProfileId, setActiveBusinessProfileId } from "@/features/business/activeCompany";

const names = new Set<string>();
const databases: Dexie[] = [];
let sequence = 0;
const date = "2026-08-01T00:00:00.000Z";

function makeDatabase() {
  const database = new TallybookDB(`tallybook-inventory-test-${Date.now()}-${++sequence}`);
  names.add(database.name);
  databases.push(database);
  return database;
}

afterEach(async () => {
  databases.splice(0).forEach((database) => database.close());
  await Promise.all([...names].map(async (name) => { const cleanup = new Dexie(name); await cleanup.delete(); }));
  names.clear();
});

describe("inventory ledger", () => {
  const productValues = { name: "Laundry soap", sku: "SOAP-1", categoryId: "uncategorized", sellingPrice: "12.50", costPrice: "6.00", initialStock: "10", lowStockThreshold: "3" };

  it("creates a product and its opening stock movement in the same local transaction", async () => {
    const database = makeDatabase();
    await initializeDatabase(database);
    const category = await createCategory({ name: "Household goods" }, database);
    const product = await createProduct({ ...productValues, categoryId: category.id }, "GHS", database);
    const snapshot = await getInventorySnapshot(database);

    expect(snapshot.categories).toHaveLength(1);
    expect(snapshot.products).toMatchObject([{ id: product.id, stockQuantity: 10, sellingPriceMinor: 1250, categoryId: category.id }]);
    expect(snapshot.movements).toMatchObject([{ productId: product.id, movementType: "initial", quantityDelta: 10, previousQuantity: 0, resultingQuantity: 10 }]);
  });

  it("records increase, decrease, and counted corrections without allowing negative stock", async () => {
    const database = makeDatabase();
    await initializeDatabase(database);
    const product = await createProduct(productValues, "GHS", database);

    await adjustStock(product.id, { movementType: "increase", quantity: "5", note: "Delivery" }, database);
    await adjustStock(product.id, { movementType: "decrease", quantity: "4", note: "Damage" }, database);
    await adjustStock(product.id, { movementType: "correction", quantity: "6", note: "Shelf count" }, database);
    await expect(adjustStock(product.id, { movementType: "decrease", quantity: "7", note: "" }, database)).rejects.toThrow("below zero");

    const snapshot = await getInventorySnapshot(database);
    const current = snapshot.products[0];
    expect(current.stockQuantity).toBe(6);
    expect(isLowStock(current)).toBe(false);
    expect(snapshot.movements.map((movement) => movement.movementType)).toEqual(["correction", "decrease", "increase", "initial"]);
    expect(snapshot.movements[0]).toMatchObject({ quantityDelta: -5, previousQuantity: 11, resultingQuantity: 6, note: "Shelf count" });
  });

  it("reserves physical units without Dexie missing-table errors during atomic stock decreases",async()=>{
    const database=makeDatabase();
    await initializeDatabase(database);
    const product=await createProduct(productValues,"GHS",database);
    const createdAt=new Date(Date.now()-60_000).toISOString();
    const expiresAt=new Date(Date.now()+60*60_000).toISOString();
    await database.commerceHolds.add({
      id:"hold-stage22-001",businessProfileId:"primary",productId:product.id,
      orderId:"order-stage22-001",quantity:3,unitPriceMinor:1250,
      submissionKey:"hold-stage22-key-001",status:"active",reason:"owner-confirmed",
      createdAt,updatedAt:createdAt,expiresAt
    });
    const decreased=await adjustStock(product.id,{movementType:"decrease",quantity:"6",note:"Count correction"},database);
    expect(decreased.resultingQuantity).toBe(4);
    const beforeCount=await database.inventoryMovements.count();
    await expect(adjustStock(product.id,{movementType:"decrease",quantity:"2",note:"Another correction"},database))
      .rejects.toThrow(/reserve|committed/i);
    expect((await database.products.get(product.id))?.stockQuantity).toBe(4);
    expect(await database.inventoryMovements.count()).toBe(beforeCount);
  });

  it("keeps quantity changes out of product edits and preserves history when a product is archived", async () => {
    const database = makeDatabase();
    await initializeDatabase(database);
    const product = await createProduct({ ...productValues, initialStock: "2" }, "GHS", database);

    await expect(updateProduct(product.id, { ...productValues, initialStock: "7", lowStockThreshold: "2" }, "GHS", database)).rejects.toThrow("Adjust stock");
    await updateProduct(product.id, { ...productValues, name: "Laundry soap bar", initialStock: "2", lowStockThreshold: "2" }, "GHS", database);
    await archiveProduct(product.id, database);

    const snapshot = await getInventorySnapshot(database);
    expect(snapshot.products).toHaveLength(0);
    expect(snapshot.archivedProducts).toMatchObject([{ id: product.id, name: "Laundry soap bar", stockQuantity: 2 }]);
    expect(snapshot.movements).toHaveLength(1);
  });

  it("rejects duplicate SKU and barcode identifiers without changing stock", async () => {
    const database = makeDatabase();
    await initializeDatabase(database);
    const first = await createProduct({ ...productValues, barcode: "1234567890123" }, "GHS", database);
    await expect(createProduct({ ...productValues, name: "Other soap", sku: " soap-1 " }, "GHS", database)).rejects.toThrow(/already assigned/);
    await expect(createProduct({ ...productValues, name: "Other soap", sku: "OTHER", barcode: "1234567890123" }, "GHS", database)).rejects.toThrow(/already assigned/);
    await expect(createProduct({ ...productValues, name: "Other soap", sku: "1234567890123" }, "GHS", database)).rejects.toThrow(/already assigned/);
    expect(await database.products.count()).toBe(1);
    expect((await database.products.get(first.id))?.stockQuantity).toBe(10);
    expect(await database.inventoryMovements.count()).toBe(1);
  });

  it("enforces unique barcodes on edits and permits reusing an archived code", async () => {
    const database = makeDatabase();
    await initializeDatabase(database);
    const first = await createProduct({ ...productValues, barcode: "BAR-A" }, "GHS", database);
    const second = await createProduct({ ...productValues, name: "Second soap", sku: "SOAP-2", barcode: "BAR-B" }, "GHS", database);
    await expect(updateProduct(second.id, { ...productValues, name: "Second soap", sku: "SOAP-2", barcode: "bar-a" }, "GHS", database)).rejects.toThrow(/already assigned/);
    expect((await database.products.get(second.id))?.barcode).toBe("BAR-B");
    await archiveProduct(first.id, database);
    await updateProduct(second.id, { ...productValues, name: "Second soap", sku: "SOAP-2", barcode: "bar-a" }, "GHS", database);
    expect((await database.products.get(second.id))?.barcode).toBe("bar-a");
  });

  it("adds the Stage 3 stores without removing a Stage 2 business profile", async () => {
    const databaseName = `tallybook-stage-2-migration-${Date.now()}-${++sequence}`;
    names.add(databaseName);
    const legacy = new Dexie(databaseName);
    legacy.version(1).stores({ appMeta: "key, updatedAt" });
    legacy.version(2).stores({ appMeta: "key, updatedAt", businessProfiles: "id, name, country, currency, businessType, updatedAt" });
    databases.push(legacy);
    await legacy.open();
    await legacy.table("businessProfiles").put({ id: "primary", name: "Ama’s Shop", country: "Ghana", currency: "GHS", businessType: "Retail shop", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" });
    legacy.close();

    const upgraded = new TallybookDB(databaseName);
    databases.push(upgraded);
    await initializeDatabase(upgraded);

    expect(upgraded.tables.map((table) => table.name)).toEqual(expect.arrayContaining(["appMeta", "businessProfiles", "categories", "products", "inventoryMovements"]));
    expect(await upgraded.businessProfiles.get("primary")).toMatchObject({ name: "Ama’s Shop", currency: "GHS" });
  });

  it("returns only the active company’s products and movements", async () => {
    const database = makeDatabase();
    await initializeDatabase(database);
    await database.businessProfiles.put({ id: "company-two", name: "Catering", country: "Ghana", currency: "GHS", businessType: "Food or restaurant", phone: "", email: "", address: "", createdAt: date, updatedAt: date });
    // Explicitly create both workspaces: a selector must not create a company.
    await database.businessProfiles.put({ id: "primary", name: "Main Shop", country: "Ghana", currency: "GHS", businessType: "Retail shop", phone: "", email: "", address: "", createdAt: date, updatedAt: date });
    setActiveBusinessProfileId("primary");
    await persistActiveBusinessProfileId("primary", database);
    const mainProduct = await createProduct({ ...productValues, name: "Main soap", sku: "MAIN-1" }, "GHS", database);
    await persistActiveBusinessProfileId("company-two", database);
    const secondProduct = await createProduct({ ...productValues, name: "Catering tray", sku: "SECOND-1" }, "GHS", database);

    const secondSnapshot = await getInventorySnapshot(database);
    expect(secondSnapshot.products.map((product) => product.id)).toEqual([secondProduct.id]);
    expect(secondSnapshot.products.map((product) => product.name)).toEqual(["Catering tray"]);
    expect(secondSnapshot.movements.every((movement) => movement.businessProfileId === "company-two")).toBe(true);

    await persistActiveBusinessProfileId("primary", database);
    const mainSnapshot = await getInventorySnapshot(database);
    expect(mainSnapshot.products.map((product) => product.id)).toEqual([mainProduct.id]);
    expect(mainSnapshot.products.some((product) => product.id === secondProduct.id)).toBe(false);
  });
});
