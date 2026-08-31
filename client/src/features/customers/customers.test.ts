/** Tactile Ledger testing reminder: customer details stay local, archives retain identity, and no balance is invented before a verified transaction exists. */
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { DATABASE_SCHEMA_VERSION, TallybookDB, initializeDatabase } from "@/db/TallybookDB";
import { archiveCustomer, createCustomer, customerFormSchema, getCustomerSnapshot, searchCustomers, updateCustomer } from "@/features/customers/customers";

const databaseNames = new Set<string>();
const openDatabases: Dexie[] = [];
let sequence = 0;

function makeDatabase() {
  const database = new TallybookDB(`tallybook-customer-test-${Date.now()}-${++sequence}`);
  databaseNames.add(database.name);
  openDatabases.push(database);
  return database;
}

afterEach(async () => {
  openDatabases.splice(0).forEach((database) => database.close());
  await Promise.all([...databaseNames].map((name) => new Dexie(name).delete()));
  databaseNames.clear();
});

describe("customer records", () => {
  const customerInput = { name: "Ama Mensah", phone: "+233 20 000 0000", email: "ama@example.test", address: "Kejetia Market", notes: "Prefers a phone call before delivery.", status: "active" as const };

  it("creates, edits, and persists one validated customer after a local database reopen", async () => {
    const database = makeDatabase();
    await initializeDatabase(database);
    const created = await createCustomer(customerInput, database);
    const edited = await updateCustomer(created.id, { ...customerInput, name: "Ama M. Mensah", notes: "" }, database);

    expect(edited.notes).toBeUndefined();
    expect(edited.createdAt).toBe(created.createdAt);
    expect(edited.updatedAt >= created.updatedAt).toBe(true);
    database.close();

    const reopened = new TallybookDB(database.name);
    openDatabases.push(reopened);
    await initializeDatabase(reopened);
    expect((await getCustomerSnapshot(reopened)).customers).toMatchObject([{ id: created.id, name: "Ama M. Mensah", phone: customerInput.phone }]);
  });

  it("searches active customers and archives the record without deleting its identity", async () => {
    const database = makeDatabase();
    await initializeDatabase(database);
    const first = await createCustomer(customerInput, database);
    await createCustomer({ ...customerInput, name: "Kofi Antwi", phone: "+233 24 000 0000", email: "", address: "", notes: "", status: "inactive" }, database);

    let snapshot = await getCustomerSnapshot(database);
    expect(searchCustomers(snapshot.customers, "kofi")).toMatchObject([{ name: "Kofi Antwi" }]);
    expect(searchCustomers(snapshot.customers, "020 000")).toHaveLength(0);
    expect(searchCustomers(snapshot.customers, "+233 20")).toMatchObject([{ id: first.id }]);

    const archived = await archiveCustomer(first.id, database);
    snapshot = await getCustomerSnapshot(database);
    expect(snapshot.customers.map((customer) => customer.id)).not.toContain(first.id);
    expect(snapshot.archivedCustomers).toMatchObject([{ id: first.id, archivedAt: archived.archivedAt }]);
  });

  it("rejects malformed, incomplete, or duplicate active customer details", async () => {
    const database = makeDatabase();
    await initializeDatabase(database);
    await createCustomer(customerInput, database);

    await expect(createCustomer({ ...customerInput, name: "  ama mensah " }, database)).rejects.toThrow("already exists");
    expect(() => customerFormSchema.parse({ ...customerInput, name: "A" })).toThrow("customer name");
    expect(() => customerFormSchema.parse({ ...customerInput, phone: "123" })).toThrow("phone number");
    expect(() => customerFormSchema.parse({ ...customerInput, email: "not-an-email" })).toThrow("valid email");
  });

  it("migrates a Stage 3 business profile into the Stage 4 customer schema without removing existing data", async () => {
    const name = `tallybook-customer-migration-${Date.now()}-${++sequence}`;
    databaseNames.add(name);
    const legacy = new Dexie(name);
    legacy.version(3).stores({ appMeta: "key, updatedAt", businessProfiles: "id, name, country, currency, businessType, updatedAt", categories: "id, businessProfileId, name, normalizedName, archivedAt, updatedAt", products: "id, businessProfileId, name, normalizedName, sku, categoryId, archivedAt, lowStockThreshold, updatedAt", inventoryMovements: "id, businessProfileId, productId, createdAt, movementType, resultingQuantity" });
    await legacy.open();
    await legacy.table("businessProfiles").put({ id: "primary", name: "Legacy Shop", country: "Ghana", currency: "GHS", businessType: "Retail shop", createdAt: "2026-08-24T00:00:00.000Z", updatedAt: "2026-08-24T00:00:00.000Z" });
    legacy.close();

    const upgraded = new TallybookDB(name);
    openDatabases.push(upgraded);
    const readiness = await initializeDatabase(upgraded);

    expect(readiness.schemaVersion).toBe(DATABASE_SCHEMA_VERSION);
    expect(await upgraded.businessProfiles.get("primary")).toMatchObject({ name: "Legacy Shop", currency: "GHS" });
    expect(await upgraded.customers.count()).toBe(0);
  });
});
