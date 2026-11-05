import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SaleRequest, ShopOverview, ShopReceipt } from "@/cloud/shopClient";

const shop = vi.hoisted(() => ({ overview: vi.fn(), record: vi.fn(), sales: vi.fn(), refund: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: true,
  getSupabaseClient: () => ({ auth: {
    getSession: async () => ({ data: { session: { user: { id: "att-1" } } } }),
    getUser: async () => ({ data: { user: { id: "att-1", email: "ama@demo.test" } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  } }),
}));
vi.mock("@/cloud/cloudMembership", () => ({ listVerifiedCloudBusinesses: async () => [{ id: "biz", name: "Kwaku Provisions", role: "attendant", owner_id: "own", created_at: "", updated_at: "" }] }));
vi.mock("@/cloud/shopClient", async (orig) => ({
  ...(await orig<object>()),
  getShopOverview: shop.overview,
  recordShopSale: (_c: string, sale: SaleRequest) => shop.record(sale),
  listShopSales: shop.sales,
  refundShopSale: (_c: string, refund: unknown) => shop.refund(refund),
}));

import SharedShopPage from "./SharedShopPage";
import { ShopRejectedError, ShopUnreachableError } from "@/cloud/shopClient";

const base: ShopOverview = {
  companyId: "biz", role: "attendant", currency: "GHS",
  stores: [{ id: "st-a", name: "Madina", status: "active" }],
  products: [{ id: "eggs", name: "Crate of eggs", unitPriceMinor: 4500, active: true }],
  stock: [{ storeId: "st-a", productId: "eggs", quantity: 3 }],
  members: [], pendingInvites: [],
};
const receiptFor = (sale: SaleRequest, replayed = false): ShopReceipt => ({
  saleId: "sale-1", companyId: "biz", storeId: sale.storeId, storeName: "Madina", cashierId: "att-1",
  submissionKey: sale.submissionKey, receiptNumber: 7, currency: "GHS", totalMinor: 9000, recordedAt: new Date().toISOString(), replayed,
  payment: { method: "cash", amountDueMinor: 9000, amountTenderedMinor: 10000, changeMinor: 1000, reference: null },
  lines: [{ lineNo: 1, productId: "eggs", name: "Crate of eggs", quantity: 2, unitPriceMinor: 4500, lineTotalMinor: 9000, refundedQuantity: 0 }],
  refundedMinor: 0, refunds: [],
});

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  shop.overview.mockReset(); shop.record.mockReset(); shop.sales.mockReset(); shop.refund.mockReset();
  shop.overview.mockResolvedValue(base);
  shop.sales.mockResolvedValue([]);
});

async function addTwoEggs() {
  const add = await screen.findByRole("button", { name: "Add one Crate of eggs" });
  fireEvent.click(add); fireEvent.click(add);
  fireEvent.change(screen.getByLabelText(/Amount received/), { target: { value: "100" } });
}

describe("shared shop — attendant", () => {
  it("tells an unassigned attendant what to do instead of showing an empty till", async () => {
    shop.overview.mockResolvedValue({ ...base, stores: [], stock: [] });
    render(<SharedShopPage />);
    expect(await screen.findByText(/hasn't assigned you to a store yet/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Record sale/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Stock" })).toBeNull(); // owner-only sections hidden
  });

  it("cannot add more than the store has in stock", async () => {
    render(<SharedShopPage />);
    const add = await screen.findByRole("button", { name: "Add one Crate of eggs" });
    fireEvent.click(add); fireEvent.click(add); fireEvent.click(add);
    expect(add).toBeDisabled();
    expect(screen.getByLabelText("Crate of eggs in cart")).toHaveTextContent("3");
  });

  it("records a sale and shows the server's receipt", async () => {
    shop.record.mockImplementation(async (sale: SaleRequest) => receiptFor(sale));
    render(<SharedShopPage />);
    await addTwoEggs();
    fireEvent.click(screen.getByRole("button", { name: /Record sale/ }));
    const receipt = await screen.findByLabelText("Receipt 7");
    expect(within(receipt).getByText(/Sale recorded/)).toBeInTheDocument();
    expect(within(receipt).getByText(/Change/)).toBeInTheDocument();
    const sent = shop.record.mock.calls[0]![0] as SaleRequest;
    expect(sent).toMatchObject({ storeId: "st-a", paymentMethod: "cash", amountTenderedMinor: 10000, lines: [{ productId: "eggs", quantity: 2 }] });
    expect(sent).not.toHaveProperty("totalMinor"); // the server prices the sale
  });

  it("saves the sale when the connection drops, then sends it once with the same key", async () => {
    shop.record.mockRejectedValueOnce(new ShopUnreachableError("offline"));
    render(<SharedShopPage />);
    await addTwoEggs();
    fireEvent.click(screen.getByRole("button", { name: /Record sale/ }));
    expect(await screen.findByText(/saved on this phone/)).toBeInTheDocument();
    expect(screen.getByText("Waiting to send")).toBeInTheDocument();
    const firstKey = (shop.record.mock.calls[0]![0] as SaleRequest).submissionKey;

    shop.record.mockImplementation(async (sale: SaleRequest) => receiptFor(sale, true));
    await act(async () => { window.dispatchEvent(new Event("offline")); });
    await act(async () => { window.dispatchEvent(new Event("online")); });
    await waitFor(() => expect(screen.queryByText("Waiting to send")).toBeNull());
    expect(shop.record).toHaveBeenCalledTimes(2);
    expect((shop.record.mock.calls[1]![0] as SaleRequest).submissionKey).toBe(firstKey);
  });

  it("keeps retrying a waiting sale on a flaky connection that still reports online", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      shop.record.mockRejectedValueOnce(new ShopUnreachableError("timeout"));
      render(<SharedShopPage />);
      await addTwoEggs();
      fireEvent.click(screen.getByRole("button", { name: /Record sale/ }));
      expect(await screen.findByText("Waiting to send")).toBeInTheDocument();
      shop.record.mockImplementation(async (sale: SaleRequest) => receiptFor(sale, true));
      await act(async () => { await vi.advanceTimersByTimeAsync(21_000); });
      await waitFor(() => expect(screen.queryByText("Waiting to send")).toBeNull());
      expect(shop.record).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });

  it("shows the server's reason when a sale is refused, and starts a fresh key next time", async () => {
    shop.record.mockRejectedValueOnce(new ShopRejectedError("You are not assigned to this store"));
    render(<SharedShopPage />);
    await addTwoEggs();
    fireEvent.click(screen.getByRole("button", { name: /Record sale/ }));
    expect(await screen.findAllByText(/not assigned to this store/)).not.toHaveLength(0);
    shop.record.mockImplementation(async (sale: SaleRequest) => receiptFor(sale));
    fireEvent.click(screen.getByRole("button", { name: /Record sale/ }));
    await screen.findByLabelText("Receipt 7");
    const [first, second] = shop.record.mock.calls.map(c => (c[0] as SaleRequest).submissionKey);
    expect(second).not.toBe(first);
  });
});

describe("shared shop — app updates", () => {
  it("shows a staged app update here too, since the shop sits outside the workspace shell", async () => {
    const { announceRun18UpdateReady } = await import("@/features/reliability/run18UpdatePolicy");
    render(<SharedShopPage />);
    await screen.findByRole("button", { name: "Add one Crate of eggs" });
    act(() => announceRun18UpdateReady(async () => {}));
    expect(await screen.findByText(/An offline app update is ready/)).toBeInTheDocument();
  });
});

describe("shared shop — owner refunds", () => {
  const sold = (): ShopReceipt => ({
    saleId: "sale-9", companyId: "biz", storeId: "st-a", storeName: "Madina", cashierId: "att-1", submissionKey: "k".repeat(24),
    receiptNumber: 9, currency: "GHS", totalMinor: 13500, recordedAt: new Date().toISOString(), replayed: false,
    payment: { method: "cash", amountDueMinor: 13500, amountTenderedMinor: 13500, changeMinor: 0, reference: null },
    lines: [{ lineNo: 1, productId: "eggs", name: "Crate of eggs", quantity: 3, unitPriceMinor: 4500, lineTotalMinor: 13500, refundedQuantity: 0 }],
    refundedMinor: 0, refunds: [],
  });

  it("refunds one item, retrying with the same key after a dropped connection, and shows the net total", async () => {
    shop.overview.mockResolvedValue({ ...base, role: "owner" });
    shop.sales.mockResolvedValue([sold()]);
    const after: ShopReceipt = { ...sold(), refundedMinor: 4500,
      lines: [{ ...sold().lines[0]!, refundedQuantity: 1 }],
      refunds: [{ refundId: "r1", refundNo: 1, amountMinor: 4500, method: "cash", returnedToStock: true, reason: "Cracked",
        actorId: "own", recordedAt: new Date().toISOString(), lines: [{ lineNo: 1, productId: "eggs", quantity: 1, lineTotalMinor: 4500 }] }] };
    shop.refund.mockRejectedValueOnce(new ShopUnreachableError("offline")).mockResolvedValueOnce(after);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<SharedShopPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Sales" }));
    fireEvent.click(await screen.findByRole("button", { name: /#9/ }));
    fireEvent.click(screen.getByRole("button", { name: /Refund or void/ }));
    fireEvent.click(screen.getByRole("button", { name: "Refund one more Crate of eggs" }));
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Cracked" } });
    fireEvent.click(screen.getByRole("button", { name: /^Refund GH/ }));
    expect(await screen.findByText(/Nothing was refunded yet/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Refund GH/ }));
    expect(await screen.findByText(/Refund 1:/)).toBeInTheDocument();
    const [first, second] = shop.refund.mock.calls.map(c => c[0] as { refundKey: string; lines: unknown; returnToStock: boolean });
    expect(second!.refundKey).toBe(first!.refundKey);
    expect(first).toMatchObject({ saleId: "sale-9", reason: "Cracked", returnToStock: true, lines: [{ lineNo: 1, quantity: 1 }] });
    expect(screen.getByText(/Kept after refunds/)).toBeInTheDocument();
  });

  it("voids the whole sale by sending no lines", async () => {
    shop.overview.mockResolvedValue({ ...base, role: "owner" });
    shop.sales.mockResolvedValue([sold()]);
    shop.refund.mockResolvedValue({ ...sold(), refundedMinor: 13500, refunds: [] });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<SharedShopPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Sales" }));
    fireEvent.click(await screen.findByRole("button", { name: /#9/ }));
    fireEvent.click(screen.getByRole("button", { name: /Refund or void/ }));
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Keyed by mistake" } });
    fireEvent.click(screen.getByRole("button", { name: /Void whole sale/ }));
    await waitFor(() => expect(shop.refund).toHaveBeenCalledTimes(1));
    expect(shop.refund.mock.calls[0]![0]).not.toHaveProperty("lines");
  });

  it("hides refunds from attendants", async () => {
    shop.sales.mockResolvedValue([sold()]);
    render(<SharedShopPage />);
    fireEvent.click(await screen.findByRole("button", { name: "My sales" }));
    fireEvent.click(await screen.findByRole("button", { name: /#9/ }));
    expect(screen.queryByRole("button", { name: /Refund or void/ })).toBeNull();
  });
});
