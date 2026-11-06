import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import Dexie from "dexie";
import { dismissQueuedSale, flushOutbox, readOutbox, submitSale } from "./shopOutbox";
import { ShopRejectedError, ShopUnreachableError, type SaleRequest, type ShopReceipt } from "./shopClient";

let serial = 0;
function newScope() { return { userId: `u-stage-b-${++serial}`, companyId: "c1" }; }
function sale(key: string): SaleRequest {
  return { storeId: "s1", submissionKey: key, paymentMethod: "cash",
    amountTenderedMinor: 500, lines: [{ productId: "p1", quantity: 1 }] };
}
const key = (num: number) => `stageb${String(num).padStart(20, "0")}`;
const receipt = (id: string, replayed = false) =>
  ({ submissionKey: id, receiptNumber: 1, replayed } as ShopReceipt);
const offline = async () => { throw new ShopUnreachableError("offline"); };
function oldStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

describe("shared-shop IndexedDB sale outbox", () => {
  it("persists before sending, then removes only the confirmed sale", async () => {
    const scope = newScope();
    const send = vi.fn(async (s: SaleRequest) => {
      expect((await readOutbox(scope)).map(e => e.sale.submissionKey)).toEqual([s.submissionKey]);
      return receipt(s.submissionKey);
    });
    expect((await submitSale(scope, sale(key(1)), "Eggs", send)).state).toBe("recorded");
    expect(await readOutbox(scope)).toEqual([]);
  });

  it("retains the exact idempotency key after a lost response and replays once", async () => {
    const scope = newScope(), id = key(2);
    expect((await submitSale(scope, sale(id), "Eggs", offline)).state).toBe("queued");
    expect((await readOutbox(scope))[0].status).toBe("pending");
    const send = vi.fn(async (s: SaleRequest) => receipt(s.submissionKey, true));
    expect(await flushOutbox(scope, send)).toEqual([{state: "recorded", receipt: receipt(id, true)}]);
    expect(send).toHaveBeenCalledWith(sale(id));
    expect(await readOutbox(scope)).toEqual([]);
  });

  it("does not duplicate the same key in concurrent submissions", async () => {
    const scope = newScope(), id = key(3);
    await Promise.all(Array.from({length: 15}, () => submitSale(scope, sale(id), "Eggs", offline)));
    expect((await readOutbox(scope)).map(x=>x.sale.submissionKey)).toEqual([id]);
  });

  it("retains all concurrent distinct sales: no cross-tab read-modify-write loss", async () => {
    const scope = newScope();
    const ids = Array.from({length: 35}, (_, i) => key(100+i));
    await Promise.all(ids.map(id => submitSale(scope, sale(id), id, offline)));
    expect((await readOutbox(scope)).map(x=>x.sale.submissionKey).sort()).toEqual(ids.sort());
  });

  it("refuses reuse of a key for a different request", async () => {
    const scope = newScope(), id = key(4);
    await submitSale(scope, sale(id), "Eggs", offline);
    const changed = { ...sale(id), lines: [{productId: "p1", quantity: 2}] };
    await expect(submitSale(scope, changed, "Eggs", offline)).rejects.toThrow(/different details/);
    expect((await readOutbox(scope))[0].sale).toEqual(sale(id));
  });

  it("parks rejected sales for review and never replays them", async () => {
    const scope = newScope(), id = key(5);
    const refused = async () => { throw new ShopRejectedError("No stock"); };
    expect(await submitSale(scope, sale(id), "Eggs", refused)).toEqual({state: "rejected", error: "No stock"});
    const send = vi.fn(async (s: SaleRequest) => receipt(s.submissionKey));
    await flushOutbox(scope, send);
    expect(send).not.toHaveBeenCalled();
    await dismissQueuedSale(scope, id);
    expect(await readOutbox(scope)).toEqual([]);
  });

  it("stops replay at the first connection failure and retains later sales", async () => {
    const scope = newScope();
    await submitSale(scope, sale(key(6)), "A", offline);
    await submitSale(scope, sale(key(7)), "B", offline);
    const send = vi.fn(offline);
    await flushOutbox(scope, send);
    expect(send).toHaveBeenCalledTimes(1);
    expect(await readOutbox(scope)).toHaveLength(2);
  });

  it("isolates user and company", async () => {
    const scope = newScope();
    await submitSale(scope, sale(key(8)), "A", offline);
    expect(await readOutbox({...scope, userId: "another-user"})).toEqual([]);
    expect(await readOutbox({...scope, companyId: "another-company"})).toEqual([]);
  });

  it("retains a sale if a server receipt claims a different key", async () => {
    const scope = newScope();
    expect((await submitSale(scope, sale(key(9)), "A", async () => receipt(key(10)))).state).toBe("queued");
    expect(await readOutbox(scope)).toHaveLength(1);
  });

  it("migrates valid legacy sales durably and removes the old copy only afterwards", async () => {
    const scope = newScope(), storage = oldStorage();
    const oldKey = `tallybook.shop.outbox.v1:${scope.userId}:${scope.companyId}`;
    storage.setItem(oldKey, JSON.stringify([
      { sale: sale(key(11)), summary: "Eggs", queuedAt: "2026-01-01T00:00:00.000Z", status: "pending" }
    ]));
    expect(await readOutbox(scope, storage)).toHaveLength(1);
    expect(storage.getItem(oldKey)).toBeNull();
    expect((await readOutbox(scope, storage))[0].sale.submissionKey).toBe(key(11));
  });

  it("quarantines invalid legacy JSON and preserves source data", async () => {
    const scope = newScope(), storage = oldStorage(), raw = "{not valid";
    const oldKey = `tallybook.shop.outbox.v1:${scope.userId}:${scope.companyId}`;
    storage.setItem(oldKey, raw);
    await expect(readOutbox(scope, storage)).rejects.toThrow(/could not be migrated/);
    expect(storage.getItem(oldKey)).toBe(raw);
    await expect(submitSale(scope, sale(key(12)), "A", offline, storage)).rejects.toThrow();
  });

  it("rejects a malformed legacy sale without silently discarding other entries", async () => {
    const scope = newScope(), storage = oldStorage();
    const oldKey = `tallybook.shop.outbox.v1:${scope.userId}:${scope.companyId}`;
    storage.setItem(oldKey, JSON.stringify([{sale: sale("bad"), status:"pending"}]));
    await expect(readOutbox(scope, storage)).rejects.toThrow(/could not be migrated/);
    expect(storage.getItem(oldKey)).not.toBeNull();
  });
  it("fails closed on a corrupted IndexedDB sale without deleting evidence", async () => {
    const scope = newScope(), id = key(13);
    await submitSale(scope, sale(id), "Eggs", offline);
    const db = new Dexie("tallybook-shared-shop-outbox-v2");
    db.version(1).stores({entries: "id,scopeKey,queuedAt", quarantine: "id"});
    const storedId = JSON.stringify([scope.userId, scope.companyId, id]);
    try {
      await db.table("entries").update(storedId, {summary: 42});
      await expect(readOutbox(scope)).rejects.toThrow(/need recovery/);
      const sender = vi.fn(async (s: SaleRequest) => receipt(s.submissionKey));
      await expect(flushOutbox(scope, sender)).rejects.toThrow(/need recovery/);
      expect(sender).not.toHaveBeenCalled();
      expect(await db.table("entries").get(storedId)).toBeDefined();
    } finally {
      db.close();
    }
  });

});
