/** Tactile Ledger testing reminder: business setup must reject invalid records, preserve a local identity, and survive a database reopen. */
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { TallybookDB, initializeDatabase } from "@/db/TallybookDB";
import { businessProfileSchema, getBusinessProfile, saveBusinessProfile } from "@/features/business/businessProfile";

const names = new Set<string>();
const openDatabases: Dexie[] = [];
let sequence = 0;

function makeDatabase() {
  const database = new TallybookDB(`tallybook-business-test-${Date.now()}-${++sequence}`);
  names.add(database.name);
  openDatabases.push(database);
  return database;
}

afterEach(async () => {
  openDatabases.splice(0).forEach((database) => database.close());
  await Promise.all([...names].map(async (name) => {
    const cleanup = new Dexie(name);
    await cleanup.delete();
  }));
  names.clear();
});

describe("business profile", () => {
  const validProfile = {
    name: "Ama’s Shop",
    country: "Ghana",
    currency: "GHS",
    businessType: "Retail shop",
    phone: "+233 20 000 0000",
    email: "hello@amashop.test",
    address: "Kejetia Market",
  };

  it("creates one validated profile and preserves its original creation timestamp when edited", async () => {
    const database = makeDatabase();
    await initializeDatabase(database);

    const created = await saveBusinessProfile(validProfile, database);
    const updated = await saveBusinessProfile({ ...validProfile, name: "Ama’s Everyday Shop", phone: "" }, database);

    expect(created.id).toBe("primary");
    expect(updated.name).toBe("Ama’s Everyday Shop");
    expect(updated.phone).toBeUndefined();
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.updatedAt >= created.updatedAt).toBe(true);
    expect(await getBusinessProfile(database)).toMatchObject({ name: "Ama’s Everyday Shop", currency: "GHS" });
  });

  it("keeps the saved profile after the local database is reopened", async () => {
    const firstDatabase = makeDatabase();
    await initializeDatabase(firstDatabase);
    await saveBusinessProfile(validProfile, firstDatabase);
    const databaseName = firstDatabase.name;
    firstDatabase.close();

    const reopened = new TallybookDB(databaseName);
    openDatabases.push(reopened);
    await initializeDatabase(reopened);

    expect(await getBusinessProfile(reopened)).toMatchObject({ name: "Ama’s Shop", country: "Ghana", businessType: "Retail shop" });
  });

  it("upgrades a Stage 1 metadata database without removing the earlier record", async () => {
    const databaseName = `tallybook-stage-1-migration-${Date.now()}-${++sequence}`;
    names.add(databaseName);
    const legacy = new Dexie(databaseName);
    legacy.version(1).stores({ appMeta: "key, updatedAt" });
    openDatabases.push(legacy);
    await legacy.open();
    await legacy.table("appMeta").put({ key: "databaseCreatedAt", value: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" });
    legacy.close();

    const upgraded = new TallybookDB(databaseName);
    openDatabases.push(upgraded);
    await initializeDatabase(upgraded);

    expect(upgraded.tables.map((table) => table.name)).toEqual(expect.arrayContaining(["appMeta", "businessProfiles"]));
    expect(await upgraded.appMeta.get("databaseCreatedAt")).toMatchObject({ value: "2026-01-01T00:00:00.000Z" });
  });

  it("rejects incomplete and malformed business details before a local write", () => {
    expect(() => businessProfileSchema.parse({ ...validProfile, name: "A" })).toThrow("business name");
    expect(() => businessProfileSchema.parse({ ...validProfile, email: "not-an-email" })).toThrow("valid email");
    expect(() => businessProfileSchema.parse({ ...validProfile, currency: "" })).toThrow("currency");
  });
});
