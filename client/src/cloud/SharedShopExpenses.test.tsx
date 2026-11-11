import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SharedShopExpenses } from "./SharedShopExpenses";
import { callShop, type ShopOverview } from "./shopClient";

vi.mock("./shopClient", () => ({ callShop: vi.fn() }));
const overview = { companyId: "shop", role: "owner", currency: "GHS", stores: [{ id: "north", name: "North", status: "active" }],
  products: [], stock: [], members: [], pendingInvites: [] } as unknown as ShopOverview;
const row = (over = {}) => ({ expenseId: "e1", storeId: null, category: "transport", amountMinor: "2500", method: "cash", expenseDate: "2026-11-10",
  note: "Taxi", recordedBy: "u1", recordedAt: "2026-11-10T10:00:00Z", voided: false, voidReason: null, ...over });
let rows: unknown[] = [];
const calls = () => vi.mocked(callShop).mock.calls.filter(c => c[0] !== "listExpenses");

beforeEach(() => {
  rows = [row()];
  vi.mocked(callShop).mockReset().mockImplementation(async (action: string) => action === "listExpenses" ? { expenses: rows } : { expenseId: "e1", replayed: false, voided: true });
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("shared shop expenses", () => {
  it("records an expense with the amount in minor units, the method and the store", async () => {
    render(<SharedShopExpenses companyId="shop" overview={overview} online />);
    await screen.findByText(/Taxi/);
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: "12.50" } });
    fireEvent.click(screen.getByRole("button", { name: "Mobile money" }));
    fireEvent.change(screen.getByLabelText(/^Store/), { target: { value: "north" } });
    fireEvent.change(screen.getByLabelText(/^Note/), { target: { value: " Fuel " } });
    fireEvent.click(screen.getByRole("button", { name: "Record expense" }));
    await waitFor(() => expect(calls()).toHaveLength(1));
    expect(calls()[0]).toEqual(["recordExpense", expect.objectContaining({ companyId: "shop", category: "transport", amountMinor: 1250, method: "mobile", storeId: "north", note: "Fuel", expenseId: expect.any(String) }), "tallybook_shop_ops"]);
    expect(await screen.findByText("Expense recorded.")).toBeInTheDocument();
  });
  it("refuses a missing or zero amount before calling the server", async () => {
    render(<SharedShopExpenses companyId="shop" overview={overview} online />);
    await screen.findByText(/Taxi/);
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Record expense" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/above zero|amount/i);
    expect(calls()).toHaveLength(0);
  });
  it("reuses the same expense id when a dropped connection is retried", async () => {
    const ids: string[] = []; let n = 0;
    vi.mocked(callShop).mockImplementation(async (action: string, input: unknown) => {
      if (action === "listExpenses") return { expenses: [] };
      ids.push((input as { expenseId: string }).expenseId); if (++n === 1) throw new Error("Network lost");
      return { expenseId: "x", replayed: true };
    });
    render(<SharedShopExpenses companyId="shop" overview={overview} online />);
    fireEvent.change(await screen.findByLabelText(/Amount/), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Record expense" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Network lost");
    fireEvent.click(screen.getByRole("button", { name: "Record expense" }));
    await screen.findByText("Expense recorded.");
    expect(ids[0]).toBe(ids[1]);
  });
  it("cancelling needs a reason typed in the page, then confirmation, and cancelled rows stop counting", async () => {
    const prompt = vi.spyOn(window, "prompt");
    render(<SharedShopExpenses companyId="shop" overview={overview} online />);
    expect(await screen.findByText(/Counted:/)).toHaveTextContent("25.00");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel expense" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/at least 4 characters/);
    fireEvent.change(screen.getByLabelText("Why is this being cancelled?"), { target: { value: "Entered twice" } });
    rows = [row({ voided: true, voidReason: "Entered twice" })];
    fireEvent.click(screen.getByRole("button", { name: "Cancel expense" }));
    await waitFor(() => expect(calls().some(c => c[0] === "voidExpense" && (c[1] as { reason: string }).reason === "Entered twice")).toBe(true));
    expect(await screen.findByText("Cancelled: Entered twice")).toBeInTheDocument();
    expect(screen.queryByText(/Counted:/)).toHaveTextContent(/0\.00/);
    expect(prompt).not.toHaveBeenCalled();
  });
  it("says so offline and does not call the server", () => {
    render(<SharedShopExpenses companyId="shop" overview={overview} online={false} />);
    expect(screen.getByText("Connect to the internet to see expenses.")).toBeInTheDocument();
    expect(callShop).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Record expense" })).toBeDisabled();
  });
});
