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

it("marks enrolled companies protected during the v35 to v36 upgrade without changing other companies", async () => {
  const name = `unified-v35-staff-${Date.now()}-${Math.random()}`;
  const legacy = new Dexie(name);
  legacy.version(35).stores({
    businessProfiles: "id, name, country, currency, businessType, updatedAt",
    staffMembers: "id, businessProfileId, role, createdAt",
  });
  await legacy.open();
  const first = {id:"primary",name:"Enrolled",country:"Ghana",currency:"GHS",businessType:"Retail shop",createdAt:"2026-10-01T00:00:00.000Z",updatedAt:"2026-10-01T00:00:00.000Z"};
  const second = {...first,id:"second",name:"Legacy"};
  const staff = {id:"owner-one",businessProfileId:"primary",role:"owner",createdAt:first.createdAt};
  await legacy.table("businessProfiles").bulkPut([first,second]);
  await legacy.table("staffMembers").put(staff);
  legacy.close();

  const upgraded = new TallybookDB(name);
  opened.push(upgraded);
  await initializeDatabase(upgraded);
  expect((await upgraded.businessProfiles.get("primary"))?.staffGovernanceEnabled).toBe(true);
  expect(await upgraded.businessProfiles.get("second")).toEqual(second);
  expect(await upgraded.staffMembers.get(staff.id)).toEqual(staff);
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

it("retains a v30 replica outbox and enrolled owner while adding later stores", async () => {
  const name = `unified-v30-replica-${Date.now()}-${Math.random()}`;
  const legacy = new Dexie(name);
  legacy.version(30).stores({
    appMeta: "key, updatedAt",
    businessProfiles: "id, name, country, currency, businessType, updatedAt",
    staffMembers: "id, businessProfileId, role, createdAt",
    syncReplicaOutbox: "id, businessProfileId, deviceId, operationId, status, [businessProfileId+status], &[businessProfileId+deviceId+sequence], &[businessProfileId+operationId]",
    syncReplicaInbox: "id, businessProfileId, serverCursor, receivedAt, &[businessProfileId+serverCursor]",
    syncReplicaCursors: "businessProfileId, updatedAt",
    syncReplicaConflicts: "id, businessProfileId, eventId, status, detectedAt, [businessProfileId+status]",
  });
  await legacy.open();
  const event = { id: "replica-one", businessProfileId: "primary", deviceId: "device-one", operationId: "operation-one", sequence: 4, status: "pending" };
  const otherCompany = { ...event, id: "replica-two", businessProfileId: "second" };
  const profile = {id:"primary",name:"Replica company",country:"Ghana",currency:"GHS",businessType:"Retail shop",createdAt:"2026-10-01T00:00:00.000Z",updatedAt:"2026-10-01T00:00:00.000Z"};
  const owner = {id:"replica-owner",businessProfileId:"primary",role:"owner",createdAt:profile.createdAt};
  await legacy.table("syncReplicaOutbox").bulkPut([event,otherCompany]);
  await legacy.table("businessProfiles").put(profile);
  await legacy.table("staffMembers").put(owner);
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
  expect((await upgraded.businessProfiles.get("primary"))?.staffGovernanceEnabled).toBe(true);
  expect(await upgraded.staffMembers.get(owner.id)).toEqual(owner);
});

it('adds the v37-v38 local event tables without inventing events for historical sales or refunds', async () => {
  const name = `unified-v36-events-${Date.now()}-${Math.random()}`;
  const legacy = new Dexie(name);
  legacy.version(36).stores({
    appMeta: 'key, updatedAt',
    businessProfiles: 'id, name, country, currency, businessType, updatedAt',
    sales: 'id, businessProfileId, customerId, receiptNumber, createdAt, outstandingMinor, paymentMethod, submissionKey, &[businessProfileId+submissionKey]',
  });
  await legacy.open();
  const historical = { id: 'old-sale', businessProfileId: 'primary',
    submissionKey: 'old-checkout', receiptNumber: 'OLD-1', createdAt: '2026-10-01T00:00:00.000Z',
    totalMinor: 100, amountPaidMinor: 100, outstandingMinor: 0, paymentMethod: 'cash' };
  await legacy.table('sales').add(historical);
  legacy.close();
  const upgraded = new TallybookDB(name);
  opened.push(upgraded);
  await initializeDatabase(upgraded);
  expect(await upgraded.sales.get(historical.id)).toEqual(historical);
  expect(await upgraded.centralSaleEvents.count()).toBe(0);
  expect(await upgraded.centralOperationalEvents.count()).toBe(0);
});

it('v38 preserves historical cash returns without fabricating central payout evidence', async () => {
  const name=`unified-v37-refunds-${Date.now()}-${Math.random()}`;
  const legacy=new Dexie(name);
  legacy.version(37).stores({
    appMeta:'key, updatedAt',
    businessProfiles:'id, name, country, currency, businessType, updatedAt',
    cashPartialReturns:'id, businessProfileId, originalSaleId, createdAt, &[businessProfileId+submissionKey]',
  });
  await legacy.open();
  const historical={id:'old-return',businessProfileId:'primary',originalSaleId:'old-sale',
    submissionKey:'old-return-key',createdAt:'2026-10-01T01:00:00.000Z',refundedMinor:100};
  await legacy.table('cashPartialReturns').add(historical);
  legacy.close();
  const upgraded=new TallybookDB(name);opened.push(upgraded);
  await initializeDatabase(upgraded);
  expect(await upgraded.cashPartialReturns.get(historical.id)).toEqual(historical);
  expect(await upgraded.centralOperationalEvents.count()).toBe(0);
});
