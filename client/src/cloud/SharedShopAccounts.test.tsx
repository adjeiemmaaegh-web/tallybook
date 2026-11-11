import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SharedShopAccounts } from "./SharedShopAccounts";
import { callShop, type ShopOverview } from "./shopClient";

vi.mock("./shopClient", () => ({ callShop: vi.fn() }));
const overview = { companyId: "shop", role: "owner", currency: "GHS", stores: [], products: [], stock: [], members: [], pendingInvites: [] } as unknown as ShopOverview;
const comp = (over: Record<string, string> = {}) => ({ sales: "9000", repayments: "0", transfersIn: "0", refunds: "0", suppliers: "0", expenses: "700", transfersOut: "0", ...over });
const acct = (over: Record<string, unknown> = {}) => ({ components: comp(), inMinor: "9000", outMinor: "700", netMinor: "8300", lastReconciliation: null, expectedNowMinor: null, ...over });
const overviewJson = (cash: Record<string, unknown> = {}) => ({ from: "a", to: "b", accounts: { cash: acct(cash), mobile: acct({ components: comp({ sales: "0", expenses: "0" }), inMinor: "0", outMinor: "0", netMinor: "0" }),
  card: acct({ components: comp({ sales: "0", expenses: "0" }), inMinor: "0", outMinor: "0", netMinor: "0" }), bank: acct({ components: comp({ sales: "0", expenses: "0" }), inMinor: "0", outMinor: "0", netMinor: "0" }) },
  position: { customersOweMinor: "3500", oweSuppliersMinor: "23000", stockAtCostMinor: "624000", stockLinesWithoutCost: 2 } });
let ov = overviewJson(), transfers: unknown[] = [];
const calls = (name: string) => vi.mocked(callShop).mock.calls.filter(c => c[0] === name);

beforeEach(() => {
  ov = overviewJson(); transfers = [];
  vi.mocked(callShop).mockReset().mockImplementation(async (a: string) => {
    if (a === "accountsOverview") return ov; if (a === "listReconciliations") return { reconciliations: [] }; if (a === "listAccountTransfers") return { transfers };
    if (a === "reconcileAccount") return { reconciliationId: "r", expectedMinor: "54000", differenceMinor: "-200", replayed: false };
    return { transferId: "t", replayed: false, voided: true };
  });
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
const cash = () => screen.getByLabelText("Cash");

describe("accounts", () => {
  it("shows what came in and went out of each account, and what is owed", async () => {
    render(<SharedShopAccounts companyId="shop" overview={overview} online shopName="Kwaku" />);
    await screen.findByLabelText("Cash");
    expect(within(cash()).getByText(/In: .*90\.00/)).toBeInTheDocument();
    expect(within(cash()).getByText(/Out: .*7\.00/)).toBeInTheDocument();
    expect(within(cash()).getByText("Expenses")).toBeInTheDocument();
    expect(within(cash()).getByText(/Not counted yet/)).toBeInTheDocument();
    const pos = screen.getByLabelText("Position");
    expect(pos).toHaveTextContent("Customers owe you"); expect(pos).toHaveTextContent("35.00"); expect(pos).toHaveTextContent("230.00"); expect(pos).toHaveTextContent("6,240.00");
    expect(screen.getByRole("note")).toHaveTextContent("2 stock lines have no cost recorded");
  });
  it("the first count says it set the opening balance; a later one says over or short against the records", async () => {
    vi.mocked(callShop).mockImplementation(async (a: string) => a === "accountsOverview" ? ov : a === "reconcileAccount" ? { reconciliationId: "r", expectedMinor: null, differenceMinor: null, opening: true, replayed: false } : { reconciliations: [], transfers: [] });
    render(<SharedShopAccounts companyId="shop" overview={overview} online shopName="Kwaku" />);
    await screen.findByLabelText("Cash");
    fireEvent.change(within(cash()).getByLabelText(/Counted now/), { target: { value: "500" } });
    fireEvent.click(within(cash()).getByRole("button", { name: "Save count" }));
    await waitFor(() => expect(calls("reconcileAccount")).toHaveLength(1));
    expect(calls("reconcileAccount")[0][1]).toMatchObject({ companyId: "shop", account: "cash", actualMinor: 50000, reconciliationId: expect.any(String) });
    expect(await screen.findByText(/opening balance set to .*500\.00/)).toBeInTheDocument();
  });
  it("reports a shortfall in plain words", async () => {
    render(<SharedShopAccounts companyId="shop" overview={overview} online shopName="Kwaku" />);
    await screen.findByLabelText("Cash");
    fireEvent.change(within(cash()).getByLabelText(/Counted now/), { target: { value: "538" } });
    fireEvent.click(within(cash()).getByRole("button", { name: "Save count" }));
    expect(await screen.findByText(/Cash: .*2\.00 short \(the records said .*540\.00\)/)).toBeInTheDocument();
  });
  it("shows the last count and where the balance should be now", async () => {
    ov = overviewJson({ lastReconciliation: { reconciliationId: "r1", asOf: "2026-11-16T10:00:00Z", actualMinor: "53800", differenceMinor: "-200" }, expectedNowMinor: "53800" });
    render(<SharedShopAccounts companyId="shop" overview={overview} online shopName="Kwaku" />);
    await screen.findByLabelText("Cash");
    expect(within(cash()).getByText(/Last counted/)).toHaveTextContent("2.00 short");
    expect(within(cash()).getByText(/Last counted/)).toHaveTextContent("538.00");
  });
  it("a bad count is refused before the server, and a retry reuses the same id", async () => {
    const ids: string[] = []; let n = 0;
    vi.mocked(callShop).mockImplementation(async (a: string, input: unknown) => {
      if (a === "accountsOverview") return ov; if (a === "listReconciliations") return { reconciliations: [] }; if (a === "listAccountTransfers") return { transfers: [] };
      ids.push((input as { reconciliationId: string }).reconciliationId); if (++n === 1) throw new Error("Network lost");
      return { reconciliationId: "r", expectedMinor: "100", differenceMinor: "0", replayed: true };
    });
    render(<SharedShopAccounts companyId="shop" overview={overview} online shopName="Kwaku" />);
    await screen.findByLabelText("Cash");
    fireEvent.change(within(cash()).getByLabelText(/Counted now/), { target: { value: "abc" } });
    fireEvent.click(within(cash()).getByRole("button", { name: "Save count" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(ids).toHaveLength(0);
    fireEvent.change(within(cash()).getByLabelText(/Counted now/), { target: { value: "1" } });
    fireEvent.click(within(cash()).getByRole("button", { name: "Save count" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Network lost");
    fireEvent.click(within(cash()).getByRole("button", { name: "Save count" }));
    await waitFor(() => expect(ids).toHaveLength(2));
    expect(ids[0]).toBe(ids[1]);
  });
  it("records a transfer between two different accounts, in minor units", async () => {
    render(<SharedShopAccounts companyId="shop" overview={overview} online shopName="Kwaku" />);
    await screen.findByLabelText("Cash");
    fireEvent.change(screen.getByLabelText("Amount (GHS)"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("Note (optional)"), { target: { value: "Banked" } });
    fireEvent.click(screen.getByRole("button", { name: "Record transfer" }));
    await waitFor(() => expect(calls("recordAccountTransfer")).toHaveLength(1));
    expect(calls("recordAccountTransfer")[0][1]).toMatchObject({ from: "cash", to: "bank", amountMinor: 3000, note: "Banked" });
    expect(await screen.findByText("Transfer recorded.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "cash" } });
    fireEvent.change(screen.getByLabelText("Amount (GHS)"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Record transfer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("two different accounts");
    expect(calls("recordAccountTransfer")).toHaveLength(1);
  });
  it("cancelling a transfer needs a reason typed on the page, then confirmation", async () => {
    transfers = [{ transferId: "t1", from: "cash", to: "bank", amountMinor: "3000", note: null, recordedAt: "2026-11-16T10:00:00Z", voided: false, voidReason: null }];
    const prompt = vi.spyOn(window, "prompt");
    render(<SharedShopAccounts companyId="shop" overview={overview} online shopName="Kwaku" />);
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel transfer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("at least 4 characters");
    fireEvent.change(screen.getByLabelText("Why is this being cancelled?"), { target: { value: "Entered twice" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel transfer" }));
    await waitFor(() => expect(calls("voidAccountTransfer")).toHaveLength(1));
    expect(calls("voidAccountTransfer")[0][1]).toEqual({ companyId: "shop", transferId: "t1", reason: "Entered twice" });
    expect(prompt).not.toHaveBeenCalled();
  });
  it("downloads a spreadsheet, and says so offline without calling the server", async () => {
    const blobs: Blob[] = [];
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = b => { blobs.push(b); return "blob:x"; };
    (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {};
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const view = render(<SharedShopAccounts companyId="shop" overview={overview} online shopName="Kwaku" />);
    fireEvent.click(await screen.findByRole("button", { name: "Download spreadsheet" }));
    expect(await blobs[0].text()).toContain("Customers owe");
    view.unmount();
    vi.mocked(callShop).mockClear();
    render(<SharedShopAccounts companyId="shop" overview={overview} online={false} shopName="Kwaku" />);
    expect(screen.getByText("Connect to the internet to see the accounts.")).toBeInTheDocument();
    expect(callShop).not.toHaveBeenCalled();
  });
});
