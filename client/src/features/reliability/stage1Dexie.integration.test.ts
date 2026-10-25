import Dexie from "dexie";
import { afterEach, expect, it, vi } from "vitest";
import { DATABASE_SCHEMA_VERSION, TallybookDB, initializeDatabase } from "@/db/TallybookDB";
import {
  auditTallybookStage1Consistent,
  tallybookStage1Rules,
} from "../../../../stage1-audit-candidate/tallybook-integrity/tallybook-adapter/tallybookRules";

const databases: TallybookDB[] = [];
let sequence = 0;

function makeDatabase() {
  const database = new TallybookDB(`stage1-dexie-audit-${Date.now()}-${++sequence}`);
  databases.push(database);
  return database;
}

async function snapshot(database: TallybookDB) {
  return Promise.all(tallybookStage1Rules.tables.map(async ({ name }) => [name, await database.table(name).toArray()] as const));
}

const business = {
  id: "primary",
  name: "Stage 1 Integration Shop",
  country: "Ghana",
  currency: "GHS",
  businessType: "Retail shop",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

async function seedValidLedger(database: TallybookDB) {
  await database.businessProfiles.put(business);
  await database.customers.put({ id: "customer-1", businessProfileId: "primary", name: "A customer" } as never);
  await database.products.put({ id: "product-1", businessProfileId: "primary", name: "A product" } as never);
  await database.sales.put({
    id: "sale-1",
    businessProfileId: "primary",
    customerId: "customer-1",
    totalMinor: 1000,
    amountPaidMinor: 1000,
    outstandingMinor: 0,
  } as never);
  await database.saleLines.put({
    id: "line-1",
    saleId: "sale-1",
    productId: "product-1",
    unitPriceMinor: 1000,
    lineTotalMinor: 1000,
  } as never);
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map(async (database) => {
    database.close();
    await new Dexie(database.name).delete();
  }));
});

it("audits every configured table through actual Dexie schema v28 in one read-only transaction", async () => {
  const database = makeDatabase();
  await initializeDatabase(database);
  expect(database.verno).toBe(DATABASE_SCHEMA_VERSION);
  const declaredTables = new Set(database.tables.map((table) => table.name));
  expect(tallybookStage1Rules.tables.every(({ name }) => declaredTables.has(name))).toBe(true);
  await seedValidLedger(database);

  const before = await snapshot(database);
  const transactionSpy = vi.spyOn(database, "transaction");
  const first = await auditTallybookStage1Consistent(database);
  const second = await auditTallybookStage1Consistent(database);
  const after = await snapshot(database);

  expect(transactionSpy.mock.calls.map(([mode]) => mode)).toEqual(["r", "r"]);
  expect(first.status).toBe("clean");
  expect(first.complete).toBe(true);
  expect(first.issues).toEqual([]);
  expect(Object.keys(first.scanned).sort()).toEqual(tallybookStage1Rules.tables.map(({ name }) => name).sort());
  expect(second).toMatchObject({ status: first.status, complete: first.complete, issues: first.issues, scanned: first.scanned });
  expect(after).toEqual(before);
});

it("reports corrupt stored references and unsafe money without repairing or mutating Dexie records", async () => {
  const database = makeDatabase();
  await initializeDatabase(database);
  await seedValidLedger(database);
  await database.sales.update("sale-1", { customerId: "missing-customer", totalMinor: 1000.5 });
  const before = await snapshot(database);

  const report = await auditTallybookStage1Consistent(database);
  const after = await snapshot(database);

  expect(report.status).toBe("issues");
  expect(report.complete).toBe(true);
  expect(report.issues.map(({ code, table, path }) => ({ code, table, path }))).toEqual(expect.arrayContaining([
    { code: "BROKEN_REFERENCE", table: "sales", path: "customerId" },
    { code: "INVALID_FINANCIAL_VALUE", table: "sales", path: "totalMinor" },
  ]));
  expect(after).toEqual(before);
});

it("fails closed when an audit table cannot be read from the actual Dexie transaction", async () => {
  const database = makeDatabase();
  await initializeDatabase(database);
  const originalTable = database.table.bind(database);
  vi.spyOn(database, "table").mockImplementation((name) => {
    const table = originalTable(name);
    if (name === "saleReversals")
      table.toArray = (() => Promise.reject(new Error("simulated IndexedDB read failure"))) as typeof table.toArray;
    return table;
  });

  const report = await auditTallybookStage1Consistent(database);

  expect(report.status).toBe("incomplete");
  expect(report.complete).toBe(false);
  expect(report.issues).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: "READ_FAILED", table: "saleReversals" }),
  ]));
});
