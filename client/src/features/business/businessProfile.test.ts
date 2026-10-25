/** Tactile Ledger testing reminder: business setup must reject invalid records, preserve a local identity, and survive a database reopen. */
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { TallybookDB, initializeDatabase } from "@/db/TallybookDB";
import { businessProfileSchema, getBusinessProfile, saveBusinessProfile, toBusinessProfileFormValues } from "@/features/business/businessProfile";
import { setActiveBusinessProfileId } from "@/features/business/activeCompany";

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
  setActiveBusinessProfileId("primary");
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

  it("rejects a stale settings form whose expected company is no longer active", async () => {
    const database = makeDatabase();
    await initializeDatabase(database);
    setActiveBusinessProfileId("primary");
    const saved = await saveBusinessProfile(validProfile, database);
    await database.businessProfiles.add({ ...saved, id: "company-b", name: "Other Shop" });

    setActiveBusinessProfileId("company-b");
    await expect(saveBusinessProfile({ ...validProfile, name: "Stale Company A Form" }, database, "primary")).rejects.toThrow(/Company changed/i);
    expect(await database.businessProfiles.get("primary")).toMatchObject({ name: "Ama’s Shop" });
    expect(await database.businessProfiles.get("company-b")).toMatchObject({ name: "Other Shop" });
  });

  it("rolls back a profile update if the active company switches during its Dexie transaction", async () => {
    const database = makeDatabase();
    await initializeDatabase(database);
    setActiveBusinessProfileId("primary");
    const saved = await saveBusinessProfile(validProfile, database);
    await database.businessProfiles.add({ ...saved, id: "company-b", name: "Other Shop" });
    const switchDuringUpdate = () => { setActiveBusinessProfileId("company-b"); return {}; };
    database.businessProfiles.hook("updating").subscribe(switchDuringUpdate);

    try {
      await expect(saveBusinessProfile({ ...validProfile, name: "Must Roll Back" }, database, "primary")).rejects.toThrow(/Company changed/i);
    } finally {
      database.businessProfiles.hook("updating").unsubscribe(switchDuringUpdate);
    }

    setActiveBusinessProfileId("primary");
    expect(await database.businessProfiles.get("primary")).toMatchObject({ name: "Ama’s Shop" });
    expect(await database.businessProfiles.get("company-b")).toMatchObject({ name: "Other Shop" });
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

  it("defaults new setup to Ghana, cedis and MoMo and persists the owner's country and providers", async () => {
    expect(toBusinessProfileFormValues()).toMatchObject({ country: "Ghana", currency: "GHS", preferredPaymentMethod: "mobile" });
    const database = makeDatabase();
    await initializeDatabase(database);
    const saved = await saveBusinessProfile({ ...validProfile, country: "Kenya", currency: "KES", preferredPaymentMethod: "card", mobileMoneyProviderName: "M-Pesa", cardProviderName: "My acquiring bank" }, database);
    expect(toBusinessProfileFormValues(saved)).toMatchObject({ country: "Kenya", currency: "KES", preferredPaymentMethod: "card", cardProviderName: "My acquiring bank" });
    expect(await database.mobileMoneyProviders.toArray()).toMatchObject([{ businessProfileId: saved.id, name: "M-Pesa", active: true }]);
    await saveBusinessProfile(saved, database);
    expect(await database.mobileMoneyProviders.count()).toBe(1);
  });
});
