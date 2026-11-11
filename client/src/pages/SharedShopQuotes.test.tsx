import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SaleRequest, ShopOverview, ShopReceipt } from "@/cloud/shopClient";

const shop = vi.hoisted(() => ({ overview: vi.fn(), record: vi.fn(), list: vi.fn(), create: vi.fn(), decide: vi.fn(), convert: vi.fn(), role: { value: "attendant" as "owner" | "attendant" } }));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: true,
  getSupabaseClient: () => ({ auth: {
    getSession: async () => ({ data: { session: { user: { id: "att-1" } } } }),
    getUser: async () => ({ data: { user: { id: "att-1", email: "ama@demo.test" } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  } }),
}));
vi.mock("@/cloud/cloudMembership", () => ({ listVerifiedCloudBusinesses: async () => [{ id: "biz", name: "Kwaku Provisions", role: shop.role.value, owner_id: "own", created_at: "", updated_at: "" }] }));
vi.mock("@/cloud/shopClient", async (orig) => ({
  ...(await orig<object>()), getShopOverview: shop.overview, getProductCatalog: async () => [],
  recordShopSale: (_c: string, sale: SaleRequest) => shop.record(sale),
}));
vi.mock("@/cloud/quotations", async (orig) => ({
  ...(await orig<object>()), listShopQuotations: shop.list, createShopQuotation: (_c: string, i: unknown) => shop.create(i),
  decideShopQuotation: (_c: string, id: string, d: string) => shop.decide(id, d), convertShopQuotation: (_c: string, id: string, saleId: string) => shop.convert(id, saleId),
}));

import SharedShopPage from "./SharedShopPage";
import { parseQuotations } from "@/cloud/quotations";

const base: ShopOverview = {
  companyId: "biz", role: "attendant", currency: "GHS", stores: [{ id: "st-a", name: "Madina", status: "active" }],
  products: [{ id: "eggs", name: "Crate of eggs", unitPriceMinor: 4500, active: true }, { id: "milo", name: "Milo", unitPriceMinor: 3000, active: true }],
  stock: [{ storeId: "st-a", productId: "eggs", quantity: 10 }, { storeId: "st-a", productId: "milo", quantity: 10 }],
  members: [], pendingInvites: [],
};
const quote = (over: Record<string, unknown> = {}) => parseQuotations({ quotations: [{ quotationId: "q1", quoteNo: 7, storeId: "st-a", customerId: null, customerName: "Mr Mensah", validUntil: "2099-01-01", note: null,
  totalMinor: "9000", status: "open", createdBy: "att-1", createdAt: "2026-11-16T10:00:00Z", saleId: null,
  lines: [{ productId: "eggs", name: "Crate of eggs", quantity: 2, unitPriceMinor: 4500, lineTotalMinor: 9000 }], ...over }] });
const receiptFor = (sale: SaleRequest, lines = [{ lineNo: 1, productId: "eggs", name: "Crate of eggs", quantity: 2, unitPriceMinor: 4500, lineTotalMinor: 9000, refundedQuantity: 0 }]): ShopReceipt => ({
  saleId: "sale-1", companyId: "biz", storeId: sale.storeId, storeName: "Madina", cashierId: "att-1", submissionKey: sale.submissionKey, receiptNumber: 7, currency: "GHS",
  totalMinor: 9000, recordedAt: new Date().toISOString(), replayed: false, payment: { method: "cash", amountDueMinor: 9000, amountTenderedMinor: 10000, changeMinor: 1000, reference: null },
  lines, refundedMinor: 0, refunds: [] });

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  shop.role.value = "attendant";
  shop.overview.mockReset().mockResolvedValue(base);
  shop.record.mockReset().mockImplementation(async (s: SaleRequest) => receiptFor(s));
  shop.list.mockReset().mockResolvedValue(quote());
  shop.create.mockReset().mockResolvedValue({ quotationId: "q2", quoteNo: 8, replayed: false });
  shop.decide.mockReset().mockResolvedValue({ status: "accepted" });
  shop.convert.mockReset().mockResolvedValue({ status: "converted" });
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

const openQuotes = async () => { render(<SharedShopPage />); fireEvent.click(await screen.findByRole("button", { name: "Quotes" })); };

describe("quotations", () => {
  it("writes a quotation: the server prices it, so only items and quantities are sent", async () => {
    await openQuotes();
    fireEvent.change(await screen.findByLabelText("Customer name"), { target: { value: " Mr Mensah " } });
    fireEvent.change(screen.getByLabelText("Item"), { target: { value: "milo" } });
    fireEvent.change(screen.getByLabelText("Qty"), { target: { value: "4" } });
    expect(screen.getByText(/About .*120\.00/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save quotation" }));
    await waitFor(() => expect(shop.create).toHaveBeenCalledTimes(1));
    const sent = shop.create.mock.calls[0][0];
    expect(sent).toMatchObject({ customerName: "Mr Mensah", storeId: "st-a", validDays: 14, lines: [{ productId: "milo", quantity: 4 }] });
    expect(JSON.stringify(sent)).not.toMatch(/price|total/i);
    expect(await screen.findByText("Quotation #8 saved.")).toBeInTheDocument();
  });
  it("needs a name, an item and sensible quantities before calling the server", async () => {
    await openQuotes();
    const save = await screen.findByRole("button", { name: "Save quotation" });
    fireEvent.click(save);
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose at least one item.");
    fireEvent.change(screen.getByLabelText("Item"), { target: { value: "milo" } });
    fireEvent.click(save);
    expect(await screen.findByRole("alert")).toHaveTextContent("Say who the quotation is for.");
    fireEvent.change(screen.getByLabelText("Customer name"), { target: { value: "X" } });
    fireEvent.change(screen.getByLabelText("Qty"), { target: { value: "1.5" } });
    fireEvent.click(save);
    expect(await screen.findByRole("alert")).toHaveTextContent("whole numbers above zero");
    expect(shop.create).not.toHaveBeenCalled();
  });
  it("reuses the quotation id when a dropped connection is retried", async () => {
    const ids: string[] = []; let n = 0;
    shop.create.mockImplementation(async (i: { quotationId: string }) => { ids.push(i.quotationId); if (++n === 1) throw new Error("Network lost"); return { quotationId: "q", quoteNo: 9, replayed: true }; });
    await openQuotes();
    fireEvent.change(await screen.findByLabelText("Customer name"), { target: { value: "Mr Mensah" } });
    fireEvent.change(screen.getByLabelText("Item"), { target: { value: "milo" } });
    fireEvent.click(screen.getByRole("button", { name: "Save quotation" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Network lost");
    fireEvent.click(screen.getByRole("button", { name: "Save quotation" }));
    await screen.findByText("Quotation #9 saved.");
    expect(ids[0]).toBe(ids[1]);
  });
  it("lists quotations with status, shares on WhatsApp and prints", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue({} as Window);
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    await openQuotes();
    fireEvent.click(await screen.findByRole("button", { name: /#7 · Mr Mensah/ }));
    const card = screen.getByLabelText("Quotation 7");
    expect(card).toHaveTextContent("2 × Crate of eggs @ GHS 45.00");
    fireEvent.click(within(card).getByRole("button", { name: "Send on WhatsApp" }));
    expect(decodeURIComponent(String(open.mock.calls[0][0]))).toContain("Quotation #7 for Mr Mensah");
    fireEvent.click(within(card).getByRole("button", { name: "Print" }));
    await waitFor(() => expect(print).toHaveBeenCalled());
  });
  it("accepting, declining and cancelling go to the server; a closed quotation offers none of them", async () => {
    await openQuotes();
    fireEvent.click(await screen.findByRole("button", { name: /#7/ }));
    fireEvent.click(screen.getByRole("button", { name: "Customer accepted" }));
    await waitFor(() => expect(shop.decide).toHaveBeenCalledWith("q1", "accepted"));
    fireEvent.click(screen.getByRole("button", { name: "Customer declined" }));
    await waitFor(() => expect(shop.decide).toHaveBeenCalledWith("q1", "declined"));
    shop.list.mockResolvedValue(quote({ status: "converted", saleId: "sale-1" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(shop.decide).toHaveBeenCalledWith("q1", "cancelled"));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Start a sale from this" })).toBeNull());
  });
  it("starting a sale loads its items at the till and, once that exact sale is recorded, marks the quotation sold", async () => {
    await openQuotes();
    fireEvent.click(await screen.findByRole("button", { name: /#7/ }));
    fireEvent.click(screen.getByRole("button", { name: "Start a sale from this" }));
    expect(await screen.findByText(/Loaded from the quotation for Mr Mensah/)).toBeInTheDocument();
    expect(screen.getByLabelText("Crate of eggs in cart")).toHaveTextContent("2");
    fireEvent.change(screen.getByLabelText(/Amount received/), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: /Record sale/ }));
    await screen.findByLabelText("Receipt 7");
    await waitFor(() => expect(shop.convert).toHaveBeenCalledWith("q1", "sale-1"));
  });
  it("a sale that differs from the quotation does not mark it sold", async () => {
    await openQuotes();
    fireEvent.click(await screen.findByRole("button", { name: /#7/ }));
    fireEvent.click(screen.getByRole("button", { name: "Start a sale from this" }));
    await screen.findByText(/Loaded from the quotation/);
    fireEvent.click(screen.getByRole("button", { name: "Add one Milo" }));
    shop.record.mockImplementation(async (s: SaleRequest) => receiptFor(s, [
      { lineNo: 1, productId: "eggs", name: "Crate of eggs", quantity: 2, unitPriceMinor: 4500, lineTotalMinor: 9000, refundedQuantity: 0 },
      { lineNo: 2, productId: "milo", name: "Milo", quantity: 1, unitPriceMinor: 3000, lineTotalMinor: 3000, refundedQuantity: 0 }]));
    fireEvent.change(screen.getByLabelText(/Amount received/), { target: { value: "200" } });
    fireEvent.click(screen.getByRole("button", { name: /Record sale/ }));
    await screen.findByLabelText("Receipt 7");
    expect(shop.convert).not.toHaveBeenCalled();
  });
  it("an owner sees everyone's quotations and who wrote them", async () => {
    shop.role.value = "owner";
    shop.overview.mockResolvedValue({ ...base, role: "owner", members: [{ userId: "att-2", role: "attendant", email: "yaw@demo.test", storeIds: ["st-a"] }] });
    shop.list.mockResolvedValue(quote({ createdBy: "att-2" }));
    await openQuotes();
    fireEvent.click(await screen.findByRole("button", { name: /#7/ }));
    expect(screen.getByText(/Written by yaw@demo.test/)).toBeInTheDocument();
  });
});
