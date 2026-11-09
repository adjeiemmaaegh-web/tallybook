import { getStoreFinancialReport } from "./storeFinancialReport";
import { createAssistant } from "@/features/assistant/assistant";
import Dexie from "dexie";
import { webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TallybookDB, initializeDatabase } from "@/db/TallybookDB";
import { setActiveBusinessProfileId } from "@/features/business/activeCompany";
import { saveBusinessProfile } from "@/features/business/businessProfile";
import {
  createStaff,
  unlockStaff,
  lockStaff,
  openShift,
} from "@/features/staff/staff";
import { createProduct } from "@/features/inventory/inventory";
import { completeSale } from "@/features/sales/sales";
import { createStore, assignStore } from "./storeDirectory";
import {
  activateStoreInventory,
  getAttendantStoreAvailability,
  readStoreBalances,
} from "./storeStockLedger";
import {
  requestStoreTransfer,
  dispatchStoreTransfer,
  completeStoreTransfer,
  returnUndeliveredDispatch,
  requestStoreTransferReversal,
} from "./storeTransfers";
import { updateCompanyReturnPolicy } from "@/features/business/returnPolicySettings";
import { recordConfirmedCashPartialReturn } from "@/features/sales/cashPartialReturnPosting";
import { createBackup, parseBackup } from "@/features/backup/backup";
import { createDraftOrder } from "@/features/commerce/commerce";
import {
  reserveRun16Order,
  cancelRun16Order,
  recordRun16Delivery,
} from "@/features/commerce/run16Orders";

if (!globalThis.crypto?.subtle)
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: webcrypto,
  });
const databases: TallybookDB[] = [];
async function setup(stores = true) {
  setActiveBusinessProfileId("primary");
  const database = new TallybookDB(`store-operations-${crypto.randomUUID()}`);
  databases.push(database);
  await initializeDatabase(database);
  await saveBusinessProfile(
    {
      name: "Operations",
      country: "Ghana",
      currency: "GHS",
      businessType: "Retail shop",
    },
    database
  );
  const owner = await createStaff("Owner", "owner", "123456", database);
  await unlockStaff(owner.id, "123456", database);
  await openShift(0, database);
  const product = await createProduct(
    {
      name: "Rice",
      sku: "rice",
      categoryId: "uncategorized",
      sellingPrice: "10.00",
      costPrice: "4.00",
      initialStock: "10",
      lowStockThreshold: "1",
    },
    "GHS",
    database
  );
  const north = await createStore("North", database),
    south = await createStore("South", database);
  if (stores)
    await activateStoreInventory(
      [{ storeId: north.id, productId: product.id, quantity: 10 }],
      database
    );
  return { database, product, north, south, owner };
}
afterEach(async () => {
  vi.restoreAllMocks();
  lockStaff("primary");
  setActiveBusinessProfileId("primary");
  for (const d of databases.splice(0)) {
    d.close();
    await new Dexie(d.name).delete();
  }
});
const sale = (
  productId: string,
  quantity: number,
  extra: Record<string, unknown> = {}
) => ({
  lines: [{ productId, quantity }],
  discount: "0",
  paymentMethod: "cash" as const,
  amountPaid: String(quantity * 10),
  currency: "GHS",
  ...extra,
});
describe("executable local store and order lifecycle", () => {
  it("separate source and destination supervisors can dispatch and receive only at their assigned store", async () => {
    const { database: d, product: p, north: n, south: s } = await setup();
    const sender = await createStaff("Sender", "supervisor", "654321", d);
    const receiver = await createStaff("Receiver", "supervisor", "654322", d);
    await assignStore(n.id, sender.id, d);
    await assignStore(s.id, receiver.id, d);
    const request = await requestStoreTransfer(
      n.id,
      s.id,
      p.id,
      3,
      d,
      "request-0001"
    );
    lockStaff("primary");
    await unlockStaff(receiver.id, "654322", d);
    await expect(
      dispatchStoreTransfer(request.id, "dispatch-0001", d)
    ).rejects.toThrow(/source store/);
    lockStaff("primary");
    await unlockStaff(sender.id, "654321", d);
    await dispatchStoreTransfer(request.id, "dispatch-0001", d);
    await expect(
      completeStoreTransfer(request.id, "receive-0001", d)
    ).rejects.toThrow(/destination store/);
    lockStaff("primary");
    await unlockStaff(receiver.id, "654322", d);
    await completeStoreTransfer(request.id, "receive-0001", d);
    expect(
      Object.fromEntries(await readStoreBalances(d, "primary", p.id))
    ).toEqual({ [n.id]: 7, [s.id]: 3 });
  });

  it("dispatch protects stock, receipt moves units once, and reversal preserves original legs", async () => {
    const { database: d, product: p, north: n, south: s } = await setup();
    const request = await requestStoreTransfer(
      n.id,
      s.id,
      p.id,
      4,
      d,
      "request-0001"
    );
    await dispatchStoreTransfer(request.id, "dispatch-0001", d);
    expect(await getAttendantStoreAvailability(n.id, d)).toEqual([
      { productId: p.id, quantity: 6 },
    ]);
    await expect(
      completeSale(sale(p.id, 7, { storeId: n.id }), d)
    ).rejects.toThrow(/reserved|stock/i);
    expect(await d.sales.count()).toBe(0);
    await completeStoreTransfer(request.id, "receive-0001", d);
    await completeStoreTransfer(request.id, "receive-0001", d);
    expect(
      Object.fromEntries(await readStoreBalances(d, "primary", p.id))
    ).toEqual({ [n.id]: 6, [s.id]: 4 });
    expect((await d.products.get(p.id))?.stockQuantity).toBe(10);
    expect(
      await d.storeStockEntries
        .where("transferId")
        .equals((await d.storeTransferRequests.get(request.id))!.transferId!)
        .count()
    ).toBe(2);
    const reversal = await requestStoreTransferReversal(
      request.id,
      "reverse-0001",
      d
    );
    await dispatchStoreTransfer(reversal.id, "dispatch-0002", d);
    await completeStoreTransfer(reversal.id, "receive-0002", d);
    expect(
      Object.fromEntries(await readStoreBalances(d, "primary", p.id))
    ).toEqual({ [n.id]: 10, [s.id]: 0 });
    expect(await d.storeStockEntries.count()).toBe(5);
  });
  it("returned undelivered goods release only their reservation without inventing stock", async () => {
    const { database: d, product: p, north: n, south: s } = await setup();
    const request = await requestStoreTransfer(
      n.id,
      s.id,
      p.id,
      4,
      d,
      "request-0001"
    );
    await dispatchStoreTransfer(request.id, "dispatch-0001", d);
    await returnUndeliveredDispatch(request.id, "returned-0001", true, d);
    await returnUndeliveredDispatch(request.id, "returned-0001", true, d);
    expect(await d.storeStockEntries.count()).toBe(1);
    expect(await getAttendantStoreAvailability(n.id, d)).toEqual([
      { productId: p.id, quantity: 10 },
    ]);
  });
  it("reservation competes with checkout and transfers, and a matching sale consumes it exactly once", async () => {
    const { database: d, product: p, north: n, south: s } = await setup();
    const order = await createDraftOrder(
      "Customer",
      [{ productId: p.id, quantity: 4 }],
      d
    );
    await reserveRun16Order(order.id, n.id, 60, "reserve-0001", d);
    const request = await requestStoreTransfer(
      n.id,
      s.id,
      p.id,
      7,
      d,
      "request-0001"
    );
    await expect(
      dispatchStoreTransfer(request.id, "dispatch-0001", d)
    ).rejects.toThrow(/unreserved/);
    await expect(
      completeSale(sale(p.id, 7, { storeId: n.id }), d)
    ).rejects.toThrow(/reserved|stock/i);
    const input = sale(p.id, 4, {
      storeId: n.id,
      commerceOrderId: order.id,
      submissionKey: "sale-order-0001",
    });
    const result = await completeSale(input, d);
    await completeSale(input, d);
    expect(await d.sales.count()).toBe(1);
    expect((await d.products.get(p.id))?.stockQuantity).toBe(6);
    expect((await d.commerceOrders.get(order.id))?.saleId).toBe(result.sale.id);
    expect(
      (await d.commerceHolds.toArray()).every(h => h.status === "consumed")
    ).toBe(true);
    await recordRun16Delivery(
      order.id,
      "pack",
      "packing-0001",
      "Packed original customer order",
      d
    );
    await recordRun16Delivery(
      order.id,
      "dispatch",
      "shipping-0001",
      "Handed over for physical delivery",
      d
    );
    await recordRun16Delivery(
      order.id,
      "deliver",
      "delivery-0001",
      "Customer confirmed physical receipt",
      d
    );
    expect((await d.commerceOrders.get(order.id))?.status).toBe("delivered");
  });
  it("cancelling an unpaid reservation restores availability without a financial posting", async () => {
    const { database: d, product: p } = await setup(false);
    const order = await createDraftOrder(
      "Customer",
      [{ productId: p.id, quantity: 8 }],
      d
    );
    await reserveRun16Order(order.id, undefined, 60, "reserve-0001", d);
    await expect(completeSale(sale(p.id, 3), d)).rejects.toThrow(
      /reserved|stock/i
    );
    await cancelRun16Order(
      order.id,
      "cancel-order-0001",
      "Customer cancelled before payment",
      d
    );
    await completeSale(sale(p.id, 3), d);
    expect((await d.products.get(p.id))?.stockQuantity).toBe(7);
    expect(await d.sales.count()).toBe(1);
  });
  it("rejects store activation while an unscoped customer commitment exists", async () => {
    const { database: d, product: p, north: n } = await setup(false);
    const order = await createDraftOrder(
      "Customer",
      [{ productId: p.id, quantity: 4 }],
      d
    );
    await reserveRun16Order(order.id, undefined, 60, "reserve-0001", d);
    await expect(
      activateStoreInventory(
        [{ storeId: n.id, productId: p.id, quantity: 10 }],
        d
      )
    ).rejects.toThrow(/reservations/);
    expect(await d.storeStockModes.count()).toBe(0);
    expect(await d.storeStockEntries.count()).toBe(0);
    await cancelRun16Order(
      order.id,
      "cancel-order-0001",
      "Release before opening allocations",
      d
    );
    await activateStoreInventory(
      [{ storeId: n.id, productId: p.id, quantity: 10 }],
      d
    );
    expect(await d.storeStockModes.count()).toBe(1);
  });
  it("a failed receipt audit rolls back both transfer legs and permits the same-key retry", async () => {
    const { database: d, product: p, north: n, south: s } = await setup();
    const request = await requestStoreTransfer(
      n.id,
      s.id,
      p.id,
      4,
      d,
      "request-0001"
    );
    await dispatchStoreTransfer(request.id, "dispatch-0001", d);
    const audit = vi
      .spyOn(d.staffAudits, "add")
      .mockRejectedValueOnce(new Error("quota failure"));
    await expect(
      completeStoreTransfer(request.id, "receive-0001", d)
    ).rejects.toThrow(/quota/);
    expect(await d.storeStockEntries.count()).toBe(1);
    expect((await d.storeTransferRequests.get(request.id))?.status).toBe(
      "dispatched"
    );
    audit.mockRestore();
    await completeStoreTransfer(request.id, "receive-0001", d);
    expect(await d.storeStockEntries.count()).toBe(3);
  });
  it("rejects a cashier attempting transfer administration and unassigned store checkout", async () => {
    const { database: d, product: p, north: n, south: s } = await setup();
    const cashier = await createStaff("Cashier", "cashier", "654321", d);
    const request = await requestStoreTransfer(
      n.id,
      s.id,
      p.id,
      4,
      d,
      "request-0001"
    );
    lockStaff("primary");
    await unlockStaff(cashier.id, "654321", d);
    await openShift(0, d);
    await expect(
      dispatchStoreTransfer(request.id, "dispatch-0001", d)
    ).rejects.toThrow(/permission/i);
    await expect(
      completeSale(sale(p.id, 1, { storeId: n.id }), d)
    ).rejects.toThrow(/assigned/);
    expect(await d.sales.count()).toBe(0);
    expect(await d.storeStockEntries.count()).toBe(1);
  });
  it("serializes competing reservations without overselling the available balance", async () => {
    const { database: d, product: p } = await setup(false);
    const a = await createDraftOrder(
      "A",
      [{ productId: p.id, quantity: 7 }],
      d
    );
    const b = await createDraftOrder(
      "B",
      [{ productId: p.id, quantity: 7 }],
      d
    );
    const results = await Promise.allSettled([
      reserveRun16Order(a.id, undefined, 60, "reserve-0001", d),
      reserveRun16Order(b.id, undefined, 60, "reserve-0002", d),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await d.commerceHolds.count()).toBe(1);
    expect((await d.products.get(p.id))?.stockQuantity).toBe(10);
  });
  it("rolls back a sale and stock movement when its reservation cannot be consumed", async () => {
    const { database: d, product: p } = await setup(false);
    const order = await createDraftOrder(
      "Customer",
      [{ productId: p.id, quantity: 4 }],
      d
    );
    await reserveRun16Order(order.id, undefined, 60, "reserve-0001", d);
    const hold = (await d.commerceHolds.toArray())[0];
    await d.commerceHolds.update(hold.id, { expiresAt: "not-a-date" });
    await expect(
      completeSale(sale(p.id, 4, { commerceOrderId: order.id }), d)
    ).rejects.toThrow();
    expect(await d.sales.count()).toBe(0);
    expect(await d.receipts.count()).toBe(0);
    expect((await d.products.get(p.id))?.stockQuantity).toBe(10);
  });

  it("store contribution reconciles sales and cross-store returns without moving historical revenue", async () => {
    const { database: d, product: p, north: n, south: s } = await setup();
    await updateCompanyReturnPolicy(
      {
        enabled: true,
        allowFullReversal: true,
        allowCashPartial: true,
        maxAgeDays: 30,
      },
      "Owner opted into return policy",
      d
    );
    const original = await completeSale(sale(p.id, 2, { storeId: n.id }), d);
    await recordConfirmedCashPartialReturn(
      {
        originalSaleId: original.sale.id,
        submissionKey: "cash-return-0001",
        returnStoreId: s.id,
        lines: [{ saleLineId: original.lines[0].id, quantity: 1 }],
        cashWasRefunded: true,
        confirmedRefundMinor: 1000,
        disposition: "restockable",
      },
      d
    );
    const report = await getStoreFinancialReport("month", d);
    expect(report.currency).toBe("GHS");
    expect(report.rows.find(row => row.storeId === n.id)).toMatchObject({
      netSalesMinor: 1000,
      cogsMinor: 400,
      contributionMinor: 600,
    });
    expect(report.rows.find(row => row.storeId === s.id)).toMatchObject({
      netSalesMinor: 0,
      cogsMinor: 0,
    });
    expect(
      Object.fromEntries(await readStoreBalances(d, "primary", p.id))
    ).toEqual({ [n.id]: 8, [s.id]: 1 });
    await d.sales.update(original.sale.id, { storeId: "missing-store" });
    await expect(getStoreFinancialReport("month", d)).rejects.toThrow(
      /missing store/
    );
  });

  it("assistant reversals explicitly select a receiving store for historical sales", async () => {
    const { database: d, product: p, north: n } = await setup(false);
    await updateCompanyReturnPolicy(
      {
        enabled: true,
        allowFullReversal: true,
        allowCashPartial: true,
        maxAgeDays: 30,
      },
      "Owner opted into return policy",
      d
    );
    const original = await completeSale(sale(p.id, 2), d);
    await activateStoreInventory(
      [{ storeId: n.id, productId: p.id, quantity: 8 }],
      d
    );
    const assistant = createAssistant({ currency: "GHS", database: d });
    const preview = await assistant.send("reverse the last sale");
    const action = preview.actions?.find(
      a => a.type === "confirm_reversal" && a.returnStoreId === n.id
    );
    expect(action).toBeTruthy();
    const reply = await assistant.act(action!);
    expect(reply.kind).toBe("success");
    const reversal = (await d.saleReversals.toArray())[0];
    expect(reversal.returnStoreId).toBe(n.id);
    expect((await d.sales.get(original.sale.id))?.storeId).toBeUndefined();
    expect(
      Object.fromEntries(await readStoreBalances(d, "primary", p.id))
    ).toEqual({ [n.id]: 10 });
    const archive = await createBackup(d);
    expect(() => parseBackup(JSON.stringify(archive))).not.toThrow();
  });

  it("a pre-allocation sale can be returned to an explicit store without inventing its original location", async () => {
    const { database: d, product: p, north: n } = await setup(false);
    await updateCompanyReturnPolicy(
      {
        enabled: true,
        allowFullReversal: true,
        allowCashPartial: true,
        maxAgeDays: 30,
      },
      "Owner opted into return policy",
      d
    );
    const original = await completeSale(sale(p.id, 2), d);
    await activateStoreInventory(
      [{ storeId: n.id, productId: p.id, quantity: 8 }],
      d
    );
    const input = {
      originalSaleId: original.sale.id,
      submissionKey: "cash-return-0001",
      lines: [{ saleLineId: original.lines[0].id, quantity: 1 }],
      cashWasRefunded: true as const,
      confirmedRefundMinor: 1000,
      disposition: "restockable" as const,
    };
    await expect(recordConfirmedCashPartialReturn(input, d)).rejects.toThrow(
      /receiving store/
    );
    expect(await d.cashPartialReturns.count()).toBe(0);
    const returned = await recordConfirmedCashPartialReturn(
      { ...input, returnStoreId: n.id },
      d
    );
    expect(returned.returnStoreId).toBe(n.id);
    expect((await d.sales.get(original.sale.id))?.storeId).toBeUndefined();
    expect(
      Object.fromEntries(await readStoreBalances(d, "primary", p.id))
    ).toEqual({ [n.id]: 9 });
    expect((await d.products.get(p.id))?.stockQuantity).toBe(9);
    const archive = await createBackup(d);
    expect(() => parseBackup(JSON.stringify(archive))).not.toThrow();
  });
});
