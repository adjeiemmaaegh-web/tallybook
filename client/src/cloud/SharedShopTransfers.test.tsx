import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {expect, it, vi} from "vitest";
import {SharedShopTransfers} from "./SharedShopTransfers";
import {callShop, type ShopOverview} from "./shopClient";

vi.mock("./shopClient", () => ({callShop: vi.fn()}));
const overview: ShopOverview = {
  companyId: "shop", role: "owner", currency: "GHS",
  stores: [{id:"a", name:"Store A", status:"active"}, {id:"b", name:"Store B", status:"active"}],
  products: [{id:"eggs", name:"Eggs", active:true, unitPriceMinor:250}],
  stock: [], members: [], pendingInvites: [],
};

it("only exposes the next physical handoff and hides transfer actions offline", async () => {
  let status = "requested";
  const row = {transferId:"t1", fromStoreId:"a", toStoreId:"b", productId:"eggs", quantity:6};
  vi.mocked(callShop).mockImplementation(async action => {
    if (action === "listTransfers") return {transfers: [{...row, status}]};
    if (action === "dispatchTransfer") status = "in_transit";
    if (action === "receiveTransfer") status = "received";
    return {transferId:row.transferId, status};
  });
  const props = {userId:"owner", companyId:"shop", overview, refresh: vi.fn(async () => {})};
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  try {
    const view = render(<SharedShopTransfers {...props} online={false} />);
    fireEvent.click(screen.getByRole("button", {name:"Inter-store transfers"}));
    expect(screen.getByRole("status")).toHaveTextContent("Reconnect");
    expect(callShop).not.toHaveBeenCalled();
    view.rerender(<SharedShopTransfers {...props} online />);
    expect(screen.queryByRole("button", {name:"Confirm receipt"})).toBeNull();
    fireEvent.click(await screen.findByRole("button", {name:"Confirm dispatch"}));
    await waitFor(() => expect(callShop).toHaveBeenCalledWith("dispatchTransfer", {companyId:"shop",transferId:"t1"}, "tallybook_shop_ops"));
    const receive = await screen.findByRole("button", {name:"Confirm receipt"});
    expect(screen.queryByRole("button", {name:"Cancel transfer"})).toBeNull();
    fireEvent.click(receive);
    expect(await screen.findByText(/Store A.*Store B.*received/)).toBeInTheDocument();
    expect(callShop).toHaveBeenCalledWith("receiveTransfer", {companyId:"shop",transferId:"t1"}, "tallybook_shop_ops");
  } finally { confirm.mockRestore(); }
});

function mockTransferServer(failReceive: boolean) {
  let status = "requested";
  const row = {transferId:"t1", fromStoreId:"a", toStoreId:"b", productId:"eggs", quantity:6};
  vi.mocked(callShop).mockReset();
  vi.mocked(callShop).mockImplementation(async action => {
    if (action === "listTransfers") return {transfers: [{...row, status}]};
    if (action === "dispatchTransfer") status = "in_transit";
    if (action === "receiveTransfer") {
      if (failReceive) throw new Error("Receiving failed");
      status = "received";
    }
    return {transferId: row.transferId, status};
  });
}

async function openLedger() {
  const props = {userId:"owner", companyId:"shop", overview, refresh: vi.fn(async () => {})};
  render(<SharedShopTransfers {...props} online />);
  fireEvent.click(screen.getByRole("button", {name:"Inter-store transfers"}));
  return screen.findByRole("button", {name:"Dispatch and receive now"});
}

it("moves a requested transfer in one step: dispatch, then receive", async () => {
  mockTransferServer(false);
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  try {
    fireEvent.click(await openLedger());
    expect(await screen.findByText(/Store A.*Store B.*received/)).toBeInTheDocument();
    const actions = vi.mocked(callShop).mock.calls.map(call => call[0]).filter(a => a === "dispatchTransfer" || a === "receiveTransfer");
    expect(actions).toEqual(["dispatchTransfer", "receiveTransfer"]);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Move 6 × Eggs from Store A to Store B now?"));
  } finally { confirm.mockRestore(); }
});

it("does nothing when the person declines the one-step move", async () => {
  mockTransferServer(false);
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  try {
    fireEvent.click(await openLedger());
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    const actions = vi.mocked(callShop).mock.calls.map(call => call[0]);
    expect(actions).not.toContain("dispatchTransfer");
  } finally { confirm.mockRestore(); }
});

it("leaves the transfer in transit and offers Confirm receipt if the second step fails", async () => {
  mockTransferServer(true);
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  try {
    fireEvent.click(await openLedger());
    expect(await screen.findByRole("alert")).toHaveTextContent("Receiving failed");
    expect(await screen.findByRole("button", {name:"Confirm receipt"})).toBeInTheDocument();
    expect(screen.getByText(/in transit/)).toBeInTheDocument();
  } finally { confirm.mockRestore(); }
});

it("summarizes only received units and filters actual server transfer history",async()=>{
 vi.mocked(callShop).mockReset().mockImplementation(async action=>{
  if(action==="listTransfers")return {transfers:[
   {transferId:"t1",fromStoreId:"a",toStoreId:"b",productId:"eggs",quantity:10,status:"requested"},
   {transferId:"t2",fromStoreId:"b",toStoreId:"a",productId:"eggs",quantity:7,status:"in_transit"},
   {transferId:"t3",fromStoreId:"a",toStoreId:"b",productId:"eggs",quantity:3,status:"received"},
   {transferId:"t4",fromStoreId:"b",toStoreId:"a",productId:"eggs",quantity:12,status:"cancelled"}
  ]};
  throw new Error("Unexpected write");
 });
 render(<SharedShopTransfers userId="owner" companyId="shop" overview={overview} online refresh={async()=>{}}/>);
 fireEvent.click(screen.getByRole("button",{name:"Inter-store transfers"}));
 const metrics=await screen.findByLabelText("Transfer summary");
 expect(metrics).toHaveTextContent("Units received3");
 expect(screen.getByText("4 of 4 transfer records shown")).toBeInTheDocument();
 const filters=screen.getByRole("group",{name:"Transfer status filter"});
 fireEvent.click(filters.querySelector('button:nth-child(3)')!);
 expect(screen.getByText("1 of 4 transfer records shown")).toBeInTheDocument();
 expect(screen.getByText("Transfer ID t2")).toBeInTheDocument();
 fireEvent.click(filters.querySelectorAll("button")[0]!);
 fireEvent.change(screen.getByLabelText("Search transfers"),{target:{value:"t4"}});
 expect(screen.getByText("Transfer ID t4")).toBeInTheDocument();
 expect(screen.queryByText("Transfer ID t2")).toBeNull();
 expect(vi.mocked(callShop).mock.calls.some(([action])=>action!=="listTransfers")).toBe(false);
});
