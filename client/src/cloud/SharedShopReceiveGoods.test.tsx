import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { SharedShopReceiveGoods } from "./SharedShopReceiveGoods";
import { callShop, type ShopOverview } from "./shopClient";

vi.mock("./shopClient", () => ({ callShop: vi.fn() }));
const overview = { companyId: "shop", role: "attendant", currency: "GHS",
  stores: [{ id: "north", name: "North", status: "active" }], products: [], stock: [], members: [], pendingInvites: [] } as unknown as ShopOverview;
const order = { orderId: "o1", storeId: "north", reference: "INV-9", supplierName: "Wholesale", createdAt: "2026-11-10T10:00:00Z",
  lines: [{ lineNo: 1, productId: "eggs", name: "Eggs", orderedQuantity: 10, receivedQuantity: 2 }, { lineNo: 2, productId: "bread", name: "Bread", orderedQuantity: 5, receivedQuantity: 0 }] };
const props = { userId: "ama", companyId: "shop", overview, online: true, refresh: vi.fn(async () => {}) };

beforeEach(() => {
  sessionStorage.clear();
  vi.mocked(callShop).mockReset().mockImplementation(async (action: string) => action === "receivableOrders" ? { orders: [order] } : { receiptId: "r", orderId: "o1", replayed: false });
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

it("lists what is still due without any cost and sends only the quantities that arrived", async () => {
  render(<SharedShopReceiveGoods {...props} />);
  expect(await screen.findByText(/Eggs: 8 still due \(2 of 10 received\)/)).toBeInTheDocument();
  expect(document.body.textContent).not.toMatch(/cost|GH₵|GHS/i);
  fireEvent.change(screen.getAllByPlaceholderText("Arrived now")[0], { target: { value: "8" } });
  fireEvent.click(screen.getByRole("button", { name: "Record goods received" }));
  await waitFor(() => expect(callShop).toHaveBeenCalledWith("receivePurchase",
    expect.objectContaining({ companyId: "shop", orderId: "o1", lines: [{ lineNo: 1, quantity: 8 }], receiptId: expect.any(String) }), "tallybook_shop_ops"));
  expect(await screen.findByText("Goods received. Stock is updated.")).toBeInTheDocument();
  expect(props.refresh).toHaveBeenCalled();
});

it("refuses more than is due, non-numbers and empty entries before calling the server", async () => {
  render(<SharedShopReceiveGoods {...props} />);
  await screen.findByText(/Eggs: 8 still due/);
  const [eggs] = screen.getAllByPlaceholderText("Arrived now");
  const go = () => fireEvent.click(screen.getByRole("button", { name: "Record goods received" }));
  go();
  expect(await screen.findByRole("alert")).toHaveTextContent("Enter how many of at least one item arrived.");
  fireEvent.change(eggs, { target: { value: "9" } }); go();
  expect(await screen.findByRole("alert")).toHaveTextContent("Only 8 of Eggs are still due.");
  fireEvent.change(eggs, { target: { value: "1.5" } }); go();
  expect(await screen.findByRole("alert")).toHaveTextContent("whole number above zero for Eggs");
  expect(callShop).not.toHaveBeenCalledWith("receivePurchase", expect.anything(), expect.anything());
});

it("reuses the same receipt id when a dropped connection is retried, so goods are never counted twice", async () => {
  let attempts = 0;
  vi.mocked(callShop).mockImplementation(async (action: string, input: unknown) => {
    if (action === "receivableOrders") return { orders: [order] };
    attempts++; ids.push((input as { receiptId: string }).receiptId);
    if (attempts === 1) throw new Error("Network lost");
    return { receiptId: "r", orderId: "o1", replayed: true };
  });
  const ids: string[] = [];
  render(<SharedShopReceiveGoods {...props} />);
  await screen.findByText(/Eggs: 8 still due/);
  fireEvent.change(screen.getAllByPlaceholderText("Arrived now")[0], { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: "Record goods received" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Network lost");
  fireEvent.click(screen.getByRole("button", { name: "Record goods received" }));
  await screen.findByText("Goods received. Stock is updated.");
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
});

it("says so when offline or nothing is waiting", async () => {
  vi.mocked(callShop).mockImplementation(async () => ({ orders: [] }));
  const view = render(<SharedShopReceiveGoods {...props} online={false} />);
  expect(screen.getByText("Receiving needs an internet connection.")).toBeInTheDocument();
  expect(callShop).not.toHaveBeenCalled();
  view.rerender(<SharedShopReceiveGoods {...props} online />);
  expect(await screen.findByText("Nothing is waiting to be received.")).toBeInTheDocument();
});
