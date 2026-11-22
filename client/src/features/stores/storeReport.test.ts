// S9-05: local store activity report: permission, company isolation, exact counts, honest scope.
import Dexie from "dexie";
import {webcrypto} from "node:crypto";
import {afterEach, describe, expect, it} from "vitest";
import {TallybookDB, initializeDatabase} from "@/db/TallybookDB";
import {setActiveBusinessProfileId} from "@/features/business/activeCompany";
import {saveBusinessProfile} from "@/features/business/businessProfile";
import {createStaff, unlockStaff, lockStaff} from "@/features/staff/staff";
import {createProduct} from "@/features/inventory/inventory";
import {createStore, assignStore} from "./storeDirectory";
import {recordStoreStockObservation} from "./storeStockCounts";
import {requestStoreTransfer, cancelStoreTransfer} from "./storeTransfers";
import {getLocalStoreReport} from "./storeReport";

if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, "crypto", {configurable: true, value: webcrypto});
let n = 0;
const dbs: TallybookDB[] = [];
async function setup() {
  setActiveBusinessProfileId("primary");
  const d = new TallybookDB(`store-report-${Date.now()}-${++n}`);
  dbs.push(d);
  await initializeDatabase(d);
  await saveBusinessProfile({name: "Report Shop", country: "Ghana", currency: "GHS", businessType: "Retail shop", phone: "", email: "", address: ""}, d);
  return d;
}
afterEach(async () => {
  lockStaff("primary");
  for (const d of dbs.splice(0)) { const name = d.name; d.close(); await new Dexie(name).delete(); }
  setActiveBusinessProfileId("primary");
});

describe("getLocalStoreReport", () => {
  it("counts assignments, observations and only open transfers per store, exactly", async () => {
    const d = await setup();
    const owner = await createStaff("Owner", "owner", "123456", d);
    await unlockStaff(owner.id, "123456", d);
    const cashier = await createStaff("Cashier", "cashier", "654321", d);
    const north = await createStore("North", d), south = await createStore("South", d);
    const p = await createProduct({name: "Rice", sku: "rice", categoryId: "uncategorized", sellingPrice: "10.00", costPrice: "4.00", initialStock: "20", lowStockThreshold: "1"}, "GHS", d);
    await assignStore(north.id, cashier.id, d);
    await recordStoreStockObservation(north.id, p.id, 7, "count 1", d);
    await recordStoreStockObservation(north.id, p.id, 6, "count 2", d);
    const open = await requestStoreTransfer(north.id, south.id, p.id, 2, d, "xfer-open-0001");
    const cancelled = await requestStoreTransfer(south.id, north.id, p.id, 1, d, "xfer-cancel-0001");
    await cancelStoreTransfer(cancelled.id, d);
    const report = await getLocalStoreReport(d);
    const byId = Object.fromEntries(report.map(r => [r.storeId, r]));
    expect(byId[north.id]).toMatchObject({name: "North", assignedStaff: 1, physicalObservations: 2, openTransferRequests: 1});
    expect(byId[south.id]).toMatchObject({name: "South", assignedStaff: 0, physicalObservations: 0, openTransferRequests: 1}); // destination of the open one; cancelled excluded
    expect(open.status).toBe("requested");
    // honest scope: only counts, never money or stock balances
    for (const row of report) expect(Object.keys(row).sort()).toEqual(["assignedStaff", "name", "openTransferRequests", "physicalObservations", "status", "storeId"]);
  });

  it("requires the reports permission once staff exist", async () => {
    const d = await setup();
    const owner = await createStaff("Owner", "owner", "123456", d);
    await unlockStaff(owner.id, "123456", d);
    const cashier = await createStaff("Cashier", "cashier", "654321", d);
    await createStore("North", d);
    lockStaff("primary");
    await expect(getLocalStoreReport(d)).rejects.toThrow(/permission|unlock|locked/i);
    await unlockStaff(cashier.id, "654321", d);
    await expect(getLocalStoreReport(d)).rejects.toThrow(/permission denied/);
    lockStaff("primary");
    await unlockStaff(owner.id, "123456", d);
    expect(await getLocalStoreReport(d)).toHaveLength(1);
  });

  it("never reports another company's stores and refuses rows from another company", async () => {
    const d = await setup();
    const mine = await createStore("Mine", d);
    await d.storeLocations.put({...(await d.storeLocations.get(mine.id))!, id: "foreign-store", businessProfileId: "other-company", name: "Foreign", normalizedName: "foreign"} as never);
    const report = await getLocalStoreReport(d);
    expect(report.map(r => r.storeId)).toEqual([mine.id]);
    // a foreign row planted in an indexed company bucket is rejected rather than counted
    await d.storeAssignments.put({id: "bad", businessProfileId: "other-company", staffId: "x", storeId: mine.id} as never);
    expect((await getLocalStoreReport(d))[0].assignedStaff).toBe(0);
  });
});
