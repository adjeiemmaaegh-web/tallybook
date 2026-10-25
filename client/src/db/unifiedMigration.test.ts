import Dexie from "dexie";
import { afterEach, expect, it } from "vitest";
import { DATABASE_SCHEMA_VERSION, TallybookDB, initializeDatabase } from "./TallybookDB";

const opened: TallybookDB[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map(async database => {
    database.close();
    await database.delete();
  }));
});

it("retains GitHub v34 financial rows while adding the local drawer journal", async () => {
  const name = `unified-v34-${Date.now()}-${Math.random()}`;
  const legacy = new Dexie(name);
  legacy.version(34).stores({
    appMeta: "key, updatedAt",
    businessProfiles: "id, name, country, currency, businessType, updatedAt",
    sales: "id, businessProfileId, customerId, receiptNumber, createdAt, outstandingMinor, paymentMethod, submissionKey, &[businessProfileId+submissionKey]",
    walletTransfers: "id, businessProfileId, customerId, kind, createdAt, submissionKey, &[businessProfileId+submissionKey]",
  });
  await legacy.open();
  const sale = { id: "sale-v34", businessProfileId: "primary", submissionKey: "checkout-v34", totalMinor: 1500, amountPaidMinor: 500, outstandingMinor: 1000, paymentMethod: "cash", createdAt: "2026-10-17T08:00:00.000Z" };
  const otherCompanySale = { ...sale, id: "sale-v34-other", businessProfileId: "second", outstandingMinor: 300 };
  const transfer = { id: "wallet-v34", businessProfileId: "primary", customerId: "customer-1", kind: "deposit", submissionKey: "wallet-v34", createdAt: sale.createdAt, amountMinor: 200 };
  await legacy.table("sales").put(sale);
  await legacy.table("sales").put(otherCompanySale);
  await legacy.table("walletTransfers").put(transfer);
  legacy.close();

  const upgraded = new TallybookDB(name);
  opened.push(upgraded);
  await initializeDatabase(upgraded);
  expect(upgraded.verno).toBe(DATABASE_SCHEMA_VERSION);
  expect(await upgraded.sales.get(sale.id)).toEqual(sale);
  expect(await upgraded.sales.get(otherCompanySale.id)).toEqual(otherCompanySale);
  expect(await upgraded.sales.where("[businessProfileId+submissionKey]").equals(["primary",sale.submissionKey]).count()).toBe(1);
  expect(await upgraded.sales.where("[businessProfileId+submissionKey]").equals(["second",sale.submissionKey]).count()).toBe(1);
  expect(await upgraded.walletTransfers.get(transfer.id)).toEqual(transfer);
  expect(await upgraded.noSaleEvents.count()).toBe(0);
});

it("retains a v30 replica outbox and per-company sequence while adding v31-v35 stores", async () => {
  const name = `unified-v30-replica-${Date.now()}-${Math.random()}`;
  const legacy = new Dexie(name);
  legacy.version(30).stores({
    appMeta: "key, updatedAt",
    syncReplicaOutbox: "id, businessProfileId, deviceId, operationId, status, [businessProfileId+status], &[businessProfileId+deviceId+sequence], &[businessProfileId+operationId]",
    syncReplicaInbox: "id, businessProfileId, serverCursor, receivedAt, &[businessProfileId+serverCursor]",
    syncReplicaCursors: "businessProfileId, updatedAt",
    syncReplicaConflicts: "id, businessProfileId, eventId, status, detectedAt, [businessProfileId+status]",
  });
  await legacy.open();
  const event = { id: "replica-one", businessProfileId: "primary", deviceId: "device-one", operationId: "operation-one", sequence: 4, status: "pending" };
  const otherCompany = { ...event, id: "replica-two", businessProfileId: "second" };
  await legacy.table("syncReplicaOutbox").bulkPut([event,otherCompany]);
  legacy.close();

  const upgraded = new TallybookDB(name);
  opened.push(upgraded);
  await initializeDatabase(upgraded);
  expect(await upgraded.syncReplicaOutbox.get(event.id)).toEqual(event);
  expect(await upgraded.syncReplicaOutbox.get(otherCompany.id)).toEqual(otherCompany);
  expect(await upgraded.syncReplicaOutbox.where("[businessProfileId+deviceId+sequence]").equals(["primary","device-one",4]).count()).toBe(1);
  expect(await upgraded.syncReplicaOutbox.where("[businessProfileId+deviceId+sequence]").equals(["second","device-one",4]).count()).toBe(1);
  expect(await upgraded.noSaleEvents.count()).toBe(0);
  expect(await upgraded.paymentSandboxIntents.count()).toBe(0);
});
