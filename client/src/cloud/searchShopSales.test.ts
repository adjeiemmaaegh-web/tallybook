import { beforeEach, describe, expect, it, vi } from "vitest";
import { sampleReceipt } from "./testReceipt";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({ getSupabaseClient: () => ({ rpc }) }));

import { searchShopSales, ShopRejectedError } from "./shopClient";

beforeEach(() => { rpc.mockReset(); });

describe("searchShopSales", () => {
  it("sends only the filters that are set and reads the server totals", async () => {
    rpc.mockResolvedValue({ data: { sales: [sampleReceipt()], hasMore: true, next: { recordedAt: "2026-11-10T09:00:00Z", receiptNumber: 42 },
      matchCount: 31, grossMinor: "123456", refundedMinor: "500" }, error: null });
    const page = await searchShopSales("biz", { payment: "credit", q: " ama ", from: "2026-11-10T00:00:00Z", limit: 25, before: { recordedAt: "2026-11-10T10:00:00Z", receiptNumber: 50 } });
    expect(rpc).toHaveBeenCalledWith("tallybook_shop_ops", { p_action: "searchSales", p_input: {
      companyId: "biz", payment: "credit", q: "ama", from: "2026-11-10T00:00:00Z", limit: 25,
      beforeRecordedAt: "2026-11-10T10:00:00Z", beforeReceiptNumber: 50 } });
    expect(page).toMatchObject({ hasMore: true, matchCount: 31, grossMinor: 123456, refundedMinor: 500, limited: false });
    expect(page.next).toEqual({ recordedAt: "2026-11-10T09:00:00Z", receiptNumber: 42 });
  });

  it("omits 'all' filters and blank search text", async () => {
    rpc.mockResolvedValue({ data: { sales: [], hasMore: false, next: null, matchCount: 0, grossMinor: "0", refundedMinor: "0" }, error: null });
    await searchShopSales("biz", { payment: "all", q: "   " });
    expect(rpc.mock.calls[0][1].p_input).toEqual({ companyId: "biz" });
  });

  it("falls back to the latest sales, filtered here, when the server predates searchSales", async () => {
    const old = sampleReceipt({ receiptNumber: 1, saleId: "a", totalMinor: 1000, customer: null, discountMinor: 0,
      tenders: [{ method: "cash", amountMinor: 1000, tenderedMinor: 1000, reference: null }] });
    const credit = sampleReceipt({ receiptNumber: 2, saleId: "b", totalMinor: 1500,
      tenders: [{ method: "credit", amountMinor: 1500, tenderedMinor: 1500, reference: null }] });
    rpc.mockImplementation(async (name: string, args: { p_action: string }) => {
      if (name === "tallybook_shop_ops") return { data: null, error: { code: "42501", message: "Unknown shop operations action" } };
      if (args.p_action === "listSales") return { data: { sales: [credit, old] }, error: null };
      throw new Error("unexpected call");
    });
    const page = await searchShopSales("biz", { payment: "credit" });
    expect(page.limited).toBe(true);
    expect(page.sales.map(s => s.receiptNumber)).toEqual([2]);
    expect(page).toMatchObject({ matchCount: 1, grossMinor: 1500, hasMore: false, next: null });
  });

  it("does not hide other server refusals behind the fallback", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "Store access denied" } });
    await expect(searchShopSales("biz", { storeId: "x" })).rejects.toBeInstanceOf(ShopRejectedError);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
