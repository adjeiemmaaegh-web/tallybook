import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MyRefundRequests, OwnerRefundRequests, RequestRefundForm } from "./RefundRequests";
import { callShop, type ShopOverview, type ShopReceipt } from "./shopClient";

vi.mock("./shopClient", () => ({ callShop: vi.fn() }));
const receipt = { saleId: "s1", receiptNumber: 7, totalMinor: 10000, refundedMinor: 0, currency: "GHS", lines: [
  { lineNo: 1, productId: "eggs", name: "Eggs", quantity: 2, unitPriceMinor: 4500, lineTotalMinor: 9000, refundedQuantity: 0 },
  { lineNo: 2, productId: "bread", name: "Bread", quantity: 1, unitPriceMinor: 1000, lineTotalMinor: 1000, refundedQuantity: 1 }] } as unknown as ShopReceipt;
const overview = { companyId: "shop", role: "owner", currency: "GHS", stores: [], products: [], stock: [], pendingInvites: [],
  members: [{ userId: "u2", role: "attendant", email: "ama@demo.test", storeIds: [] }] } as unknown as ShopOverview;
const sent = () => vi.mocked(callShop).mock.calls.filter(c => c[0] === "requestRefund");

beforeEach(() => { vi.mocked(callShop).mockReset().mockResolvedValue({ requestId: "r", status: "pending", replayed: false }); vi.spyOn(window, "confirm").mockReturnValue(true); });

describe("cashier: ask for a refund", () => {
  it("sends a whole-sale request with the reason and the restock choice", async () => {
    const onSent = vi.fn();
    render(<RequestRefundForm companyId="shop" receipt={receipt} online onSent={onSent} />);
    fireEvent.click(screen.getByRole("button", { name: "Ask the owner for a refund" }));
    fireEvent.change(screen.getByLabelText("Why?"), { target: { value: "Cracked" } });
    fireEvent.click(screen.getByLabelText(/can go back in stock/));
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    await waitFor(() => expect(sent()).toHaveLength(1));
    expect(sent()[0]).toEqual(["requestRefund", { companyId: "shop", requestId: expect.any(String), saleId: "s1", reason: "Cracked", returnToStock: false }, "tallybook_shop_ops"]);
    expect(await screen.findByText(/Request sent/)).toBeInTheDocument();
    expect(onSent).toHaveBeenCalled();
  });
  it("some items: only what is left can be chosen, and a quantity must be valid", async () => {
    render(<RequestRefundForm companyId="shop" receipt={receipt} online onSent={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Ask the owner for a refund" }));
    fireEvent.click(screen.getByRole("button", { name: "Some items" }));
    expect(screen.queryByLabelText(/Bread/)).toBeNull();                    // already refunded
    fireEvent.change(screen.getByLabelText("Why?"), { target: { value: "Wrong size" } });
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("at least one item");
    fireEvent.change(screen.getByLabelText(/Eggs/), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("no more than what was sold");
    fireEvent.change(screen.getByLabelText(/Eggs/), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    await waitFor(() => expect(sent()).toHaveLength(1));
    expect(sent()[0][1]).toMatchObject({ lines: [{ lineNo: 1, quantity: 1 }], returnToStock: true });
  });
  it("needs a reason, and reuses the request id when a dropped connection is retried", async () => {
    const ids: string[] = []; let n = 0;
    vi.mocked(callShop).mockImplementation(async (_a: string, input: unknown) => { ids.push((input as { requestId: string }).requestId); if (++n === 1) throw new Error("Network lost"); return { requestId: "r", status: "pending", replayed: true }; });
    render(<RequestRefundForm companyId="shop" receipt={receipt} online onSent={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Ask the owner for a refund" }));
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Say why");
    expect(ids).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("Why?"), { target: { value: "Cracked" } });
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Network lost");
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    await screen.findByText(/Request sent/);
    expect(ids[0]).toBe(ids[1]);
  });
  it("offers nothing on a sale that is fully refunded", () => {
    const done = { ...receipt, lines: receipt.lines.map(l => ({ ...l, refundedQuantity: l.quantity })) } as ShopReceipt;
    const { container } = render(<RequestRefundForm companyId="shop" receipt={done} online onSent={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("cashier: my requests", () => {
  const mine = (over = {}) => ({ requestId: "r1", saleId: "s1", receiptNumber: 7, status: "pending", reason: "Cracked", lines: null, returnToStock: true, createdAt: "2026-11-10T10:00:00Z", decidedAt: null, decisionNote: null, items: [{ name: "Eggs", quantity: 2 }], ...over });
  it("shows the owner's decision and lets a waiting request be withdrawn", async () => {
    vi.mocked(callShop).mockImplementation(async (a: string) => a === "myRefundRequests" ? { requests: [mine(), mine({ requestId: "r2", receiptNumber: 5, status: "declined", decisionNote: "Used" })] } : { requestId: "r1", status: "cancelled" });
    render(<MyRefundRequests companyId="shop" online />);
    expect(await screen.findByText(/Waiting for the owner/)).toBeInTheDocument();
    expect(screen.getByText(/Declined/)).toBeInTheDocument();
    expect(screen.getByText(/Owner: Used/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));
    await waitFor(() => expect(callShop).toHaveBeenCalledWith("cancelRefundRequest", { companyId: "shop", requestId: "r1" }, "tallybook_shop_ops"));
  });
  it("renders nothing when there are none", async () => {
    vi.mocked(callShop).mockResolvedValue({ requests: [] });
    const { container } = render(<MyRefundRequests companyId="shop" online />);
    await waitFor(() => expect(callShop).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

describe("owner: decide", () => {
  const waiting = { requestId: "r1", saleId: "s1", receiptNumber: 7, totalMinor: "10000", requestedBy: "u2", status: "pending", reason: "Cracked", lines: [{ lineNo: 1, quantity: 1 }], returnToStock: true,
    createdAt: "2026-11-10T10:00:00Z", decidedAt: null, decisionNote: null, items: [{ name: "Eggs", quantity: 1 }] };
  let list: unknown[] = [];
  beforeEach(() => {
    list = [waiting];
    vi.mocked(callShop).mockImplementation(async (a: string) => {
      if (a === "listRefundRequests") return { requests: list };
      if (a === "approveRefundRequest") { list = []; return { requestId: "r1", status: "approved", replayed: false, receipt: { refundedMinor: 4500 } }; }
      list = []; return { requestId: "r1", status: "declined" };
    });
  });
  const mount = () => { const refresh = vi.fn(async () => {}), changed = vi.fn(); render(<OwnerRefundRequests companyId="shop" overview={overview} online refresh={refresh} onChanged={changed} />); return { refresh, changed }; };
  it("shows who asked, what and why, and approving posts the refund and refreshes", async () => {
    const { refresh, changed } = mount();
    expect(await screen.findByText(/ama@demo.test/)).toBeInTheDocument();
    expect(screen.getByText(/1 × Eggs/)).toBeInTheDocument();
    expect(screen.getByText(/Cracked/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Approve and refund" }));
    await waitFor(() => expect(callShop).toHaveBeenCalledWith("approveRefundRequest", { companyId: "shop", requestId: "r1" }, "tallybook_shop_ops"));
    expect(await screen.findByText(/Refunded\. Receipt #7 now shows .*45\.00 refunded/)).toBeInTheDocument();
    expect(await screen.findByText("No requests are waiting.")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled(); expect(changed).toHaveBeenCalled();
  });
  it("declining sends the note and posts nothing", async () => {
    mount();
    fireEvent.change(await screen.findByLabelText(/Note to the cashier/), { target: { value: "Customer used it" } });
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    await waitFor(() => expect(callShop).toHaveBeenCalledWith("declineRefundRequest", { companyId: "shop", requestId: "r1", note: "Customer used it" }, "tallybook_shop_ops"));
    expect(callShop).not.toHaveBeenCalledWith("approveRefundRequest", expect.anything(), expect.anything());
  });
  it("keeps the request waiting and says why when the server refuses the refund", async () => {
    vi.mocked(callShop).mockImplementation(async (a: string) => { if (a === "listRefundRequests") return { requests: [waiting] }; throw new Error("Refunds are turned off for this business"); });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Approve and refund" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Refunds are turned off");
    expect(screen.getByText(/ama@demo.test/)).toBeInTheDocument();
  });
  it("does nothing if the owner does not confirm", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Approve and refund" }));
    await new Promise(r => setTimeout(r, 20));
    expect(callShop).not.toHaveBeenCalledWith("approveRefundRequest", expect.anything(), expect.anything());
  });
});
