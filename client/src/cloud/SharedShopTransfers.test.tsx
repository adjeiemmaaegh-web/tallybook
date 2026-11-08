import {fireEvent, render, screen} from "@testing-library/react";
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
    expect(callShop).toHaveBeenCalledWith("dispatchTransfer", {companyId:"shop",transferId:"t1"}, "tallybook_shop_ops");
    const receive = await screen.findByRole("button", {name:"Confirm receipt"});
    expect(screen.queryByRole("button", {name:"Cancel transfer"})).toBeNull();
    fireEvent.click(receive);
    expect(await screen.findByText(/Store A.*Store B.*received/)).toBeInTheDocument();
    expect(callShop).toHaveBeenCalledWith("receiveTransfer", {companyId:"shop",transferId:"t1"}, "tallybook_shop_ops");
  } finally { confirm.mockRestore(); }
});
