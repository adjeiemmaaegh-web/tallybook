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
