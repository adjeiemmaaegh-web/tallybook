/** Tactile Ledger testing reminder: the foundation database must initialize predictably and retain its metadata without a server. */
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { DATABASE_SCHEMA_VERSION, TallybookDB, initializeDatabase } from "@/db/TallybookDB";

const databases: TallybookDB[] = [];
let testNumber = 0;

function makeDatabase() {
  const database = new TallybookDB(`tallybook-stage-1-test-${Date.now()}-${++testNumber}`);
  databases.push(database);
  return database;
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map(async (database) => {
    database.close();
    await database.delete();
  }));
});

describe("TallybookDB", () => {
  it("opens a versioned local database and writes foundation metadata", async () => {
    const database = makeDatabase();

    const readiness = await initializeDatabase(database);

    expect(readiness.databaseName).toBe(database.name);
    expect(readiness.schemaVersion).toBe(DATABASE_SCHEMA_VERSION);
    expect(await database.appMeta.get("schemaVersion")).toMatchObject({
      key: "schemaVersion",
      value: String(DATABASE_SCHEMA_VERSION),
    });
    expect(await database.appMeta.get("databaseCreatedAt")).toMatchObject({ key: "databaseCreatedAt" });
  });

  it("adds local batch provenance indexes without rewriting legacy batch records", async () => {
    const name = `tallybook-v28-batch-migration-${Date.now()}-${++testNumber}`;
    const legacy = new Dexie(name);
    legacy.version(28).stores({
      appMeta: "key, updatedAt",
      businessProfiles: "id, name, country, currency, businessType, updatedAt",
      products: "id, businessProfileId, name",
      purchaseLines: "id, purchaseId, productId, businessProfileId",
      inventoryBatches: "id, businessProfileId, productId, expiryDate, createdAt",
      inventoryCostEvents: "id, businessProfileId, productId, [businessProfileId+productId], &[businessProfileId+productId+sequence], &[businessProfileId+sourceId], saleId, purchaseId, createdAt",
    });
    await legacy.open();
    const oldBatch = { id: "old-batch", businessProfileId: "primary", productId: "old-product", batchCode: "LEGACY-LOT", expiryDate: "2027-02-01", quantity: 2, createdAt: "2026-10-01T10:00:00.000Z" };
    await Promise.all([
      legacy.table("appMeta").put({ key: "databaseCreatedAt", value: "2026-10-01T10:00:00.000Z", updatedAt: "2026-10-01T10:00:00.000Z" }),
      legacy.table("products").put({ id: "old-product", businessProfileId: "primary", stockQuantity: 2 }),
      legacy.table("inventoryBatches").put(oldBatch),
    ]);
    legacy.close();
    const upgraded = new TallybookDB(name); databases.push(upgraded);

    await initializeDatabase(upgraded);

    expect(upgraded.verno).toBe(DATABASE_SCHEMA_VERSION);
    expect(await upgraded.inventoryBatches.get("old-batch")).toEqual(oldBatch);
    expect(upgraded.inventoryBatches.schema.idxByName.receiptCostEventId).toBeDefined();
    expect(upgraded.purchaseLines.schema.idxByName.batchId).toBeDefined();
    expect(upgraded.inventoryCostEvents.schema.idxByName.batchId).toBeDefined();
  });

  it("upgrades a local v30 drawer journal without losing existing records", async () => {
    const name = `tallybook-v30-local-migration-${Date.now()}-${++testNumber}`;
    const legacy = new Dexie(name);
    legacy.version(30).stores({
      appMeta: "key, updatedAt",
      businessProfiles: "id, name, country, currency, businessType, updatedAt",
      staffMembers: "id, businessProfileId, role, createdAt",
      purchaseLines: "id, purchaseId, productId, businessProfileId, batchId",
      inventoryBatches: "id, businessProfileId, productId, expiryDate, createdAt, receiptCostEventId",
      inventoryCostEvents: "id, businessProfileId, productId, [businessProfileId+productId], &[businessProfileId+productId+sequence], &[businessProfileId+sourceId], saleId, purchaseId, batchId, createdAt",
      noSaleEvents: "id, businessProfileId, storeId, staffId, shiftId, createdAt, &[businessProfileId+operationKey]",
    });
    await legacy.open();
    const drawerEvent = { id: "drawer-1", businessProfileId: "primary", storeId: "store-1", staffId: "staff-1", shiftId: "shift-1", createdAt: "2026-10-23T12:00:00.000Z", operationKey: "drawer-key-1" };
    const batch = { id: "batch-1", businessProfileId: "primary", productId: "product-1", batchCode: "LOT-1", quantity: 3, startingQuantity: 3, receiptCostEventId: "cost-1", createdAt: drawerEvent.createdAt };
    const profile = {id:"primary",name:"Drawer company",country:"Ghana",currency:"GHS",businessType:"Retail shop",createdAt:drawerEvent.createdAt,updatedAt:drawerEvent.createdAt};
    const staff = {id:"staff-1",businessProfileId:"primary",role:"owner",createdAt:drawerEvent.createdAt};
    await legacy.table("businessProfiles").put(profile);
    await legacy.table("staffMembers").put(staff);
    await legacy.table("noSaleEvents").put(drawerEvent);
    await legacy.table("inventoryBatches").put(batch);
    legacy.close();
    const upgraded = new TallybookDB(name); databases.push(upgraded);
    await initializeDatabase(upgraded);
    expect(upgraded.verno).toBe(DATABASE_SCHEMA_VERSION);
    expect(await upgraded.noSaleEvents.get(drawerEvent.id)).toEqual(drawerEvent);
    expect(await upgraded.inventoryBatches.get(batch.id)).toEqual(batch);
    expect((await upgraded.businessProfiles.get("primary"))?.staffGovernanceEnabled).toBe(true);
    expect(await upgraded.staffMembers.get(staff.id)).toEqual(staff);
    expect(upgraded.syncReplicaOutbox.schema.primKey.name).toBe("id");
  });

  it("migrates version 20 sync records to the current schema without losing events and creates conflicts table", async () => {
    const name = `tallybook-v20-migration-${Date.now()}-${++testNumber}`;
    const legacy = new Dexie(name);
    legacy.version(20).stores({
      appMeta: "key, updatedAt",
      businessProfiles: "id, name, country, currency, businessType, updatedAt",
      syncConsents: "businessProfileId, enabled, updatedAt",
      syncOutbox: "id, businessProfileId, [businessProfileId+operationId], [businessProfileId+status], createdAt, status",
      syncDevices: "id, businessProfileId, [businessProfileId+status], registeredAt",
    });
    await legacy.open();
    const date = "2026-10-09T12:00:00.000Z";
    await legacy.table("businessProfiles").put({ id: "primary", name: "Migration Store", country: "Ghana", currency: "GHS", businessType: "Retail", updatedAt: date });
    await legacy.table("syncConsents").put({ businessProfileId: "primary", enabled: true, updatedAt: date });
    await legacy.table("syncOutbox").put({ id: "event-1", operationId: "operation-1", businessProfileId: "primary", status: "pending", createdAt: date });
    await legacy.table("syncDevices").put({ id: "device-1", businessProfileId: "primary", status: "active", registeredAt: date });
    legacy.close();
    const upgraded = new TallybookDB(name);
    databases.push(upgraded);
    const readiness = await initializeDatabase(upgraded);
    expect(readiness.schemaVersion).toBe(DATABASE_SCHEMA_VERSION);
    expect((await upgraded.appMeta.get("schemaVersion"))?.value).toBe(String(DATABASE_SCHEMA_VERSION));
    expect((await upgraded.syncOutbox.get("event-1"))?.operationId).toBe("operation-1");
    expect((await upgraded.syncDevices.get("device-1"))?.status).toBe("active");
    expect((await upgraded.syncConsents.get("primary"))?.enabled).toBe(true);
    expect(await upgraded.syncConflicts.count()).toBe(0);
  });

  it("keeps the original creation timestamp when initialization runs again", async () => {
    const database = makeDatabase();

    await initializeDatabase(database);
    const firstCreation = await database.appMeta.get("databaseCreatedAt");
    await initializeDatabase(database);
    const secondCreation = await database.appMeta.get("databaseCreatedAt");

    expect(secondCreation?.value).toBe(firstCreation?.value);
  });

  it("opens a version-9 local database without rewriting its saved business profile and creates an empty expense table", async () => {
    const name = `tallybook-v9-migration-${Date.now()}-${++testNumber}`;
    const legacy = new Dexie(name);
    legacy.version(9).stores({ appMeta: "key, updatedAt", businessProfiles: "id, name, country, currency, businessType, updatedAt" });
    await legacy.open();
    await legacy.table("businessProfiles").put({ id: "primary", name: "Version 9 Shop", country: "Ghana", currency: "GHS", businessType: "Retail shop", phone: "", email: "", address: "", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" });
    legacy.close();
    const database = new TallybookDB(name); databases.push(database);

    await initializeDatabase(database);

    expect(await database.businessProfiles.get("primary")).toMatchObject({ name: "Version 9 Shop", currency: "GHS" });
    expect(await database.expenses.count()).toBe(0);
  });
});
