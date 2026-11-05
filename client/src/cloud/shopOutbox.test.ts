import { describe, expect, it, vi } from "vitest";
import { dismissQueuedSale, flushOutbox, readOutbox, submitSale } from "./shopOutbox";
import { ShopRejectedError, ShopUnreachableError, type SaleRequest, type ShopReceipt } from "./shopClient";

function memoryStorage() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}
const scope = { userId: "u1", companyId: "c1" };
const sale = (key: string): SaleRequest => ({ storeId: "s1", submissionKey: key, paymentMethod: "cash", amountTenderedMinor: 500, lines: [{ productId: "p1", quantity: 1 }] });
const receipt = (key: string, replayed = false) => ({ submissionKey: key, receiptNumber: 1, replayed } as ShopReceipt);

describe("shared shop sale outbox", () => {
  it("saves the sale before sending and clears it once the server confirms", async () => {
    const storage = memoryStorage();
    const send = vi.fn(async (s: SaleRequest) => {
      expect(readOutbox(scope, storage).map(e => e.sale.submissionKey)).toEqual([s.submissionKey]); // write-ahead
      return receipt(s.submissionKey);
    });
    const result = await submitSale(scope, sale("k1"), "1 × Eggs", send, storage);
    expect(result.state).toBe("recorded");
    expect(readOutbox(scope, storage)).toEqual([]);
  });

  it("keeps the sale when the connection fails and re-sends it with the SAME key", async () => {
    const storage = memoryStorage();
    const offline = vi.fn(async () => { throw new ShopUnreachableError("offline"); });
    expect((await submitSale(scope, sale("k1"), "x", offline, storage)).state).toBe("queued");
    expect(readOutbox(scope, storage)[0]?.status).toBe("pending");

    const online = vi.fn(async (s: SaleRequest) => receipt(s.submissionKey, true));
    const results = await flushOutbox(scope, online, storage);
    expect(online).toHaveBeenCalledWith(sale("k1"));
    expect(results).toEqual([{ state: "recorded", receipt: receipt("k1", true) }]);
    expect(readOutbox(scope, storage)).toEqual([]);
  });

  it("does not duplicate a queued entry when the same sale is submitted twice", async () => {
    const storage = memoryStorage();
    const offline = async () => { throw new ShopUnreachableError("offline"); };
    await submitSale(scope, sale("k1"), "x", offline, storage);
    await submitSale(scope, sale("k1"), "x", offline, storage);
    expect(readOutbox(scope, storage)).toHaveLength(1);
  });

  it("parks a sale the server refused, for the attendant to review, and never re-sends it", async () => {
    const storage = memoryStorage();
    const refuse = vi.fn(async () => { throw new ShopRejectedError("Bread has only 0 left in this store"); });
    expect(await submitSale(scope, sale("k1"), "x", refuse, storage)).toEqual({ state: "rejected", error: "Bread has only 0 left in this store" });
    const again = vi.fn(async (s: SaleRequest) => receipt(s.submissionKey));
    await flushOutbox(scope, again, storage);
    expect(again).not.toHaveBeenCalled();
    dismissQueuedSale(scope, "k1", storage);
    expect(readOutbox(scope, storage)).toEqual([]);
  });

  it("flushes in order and stops at the first connection failure", async () => {
    const storage = memoryStorage();
    const offline = async () => { throw new ShopUnreachableError("offline"); };
    await submitSale(scope, sale("a"), "x", offline, storage);
    await submitSale(scope, sale("b"), "x", offline, storage);
    const flaky = vi.fn(async () => { throw new ShopUnreachableError("still offline"); });
    await flushOutbox(scope, flaky, storage);
    expect(flaky).toHaveBeenCalledTimes(1);
    expect(readOutbox(scope, storage)).toHaveLength(2);
  });

  it("keeps each account's and business's queue separate", async () => {
    const storage = memoryStorage();
    await submitSale(scope, sale("k1"), "x", async () => { throw new ShopUnreachableError("offline"); }, storage);
    expect(readOutbox({ userId: "u2", companyId: "c1" }, storage)).toEqual([]);
    expect(readOutbox({ userId: "u1", companyId: "c2" }, storage)).toEqual([]);
  });
});
