import {render, screen, fireEvent, waitFor} from "@testing-library/react";
import {expect, it, vi} from "vitest";
import {SharedShopOrders} from "./SharedShopOrders";
import {callShop, type ShopOverview} from "./shopClient";

vi.mock("./shopClient", () => ({callShop:vi.fn(), listShopSales:vi.fn(async () => [])}));

it("submits item quantities for server pricing and reloads the saved quote", async () => {
  let created = false;
  const order = {orderId:"order-a", storeId:"north", customerReference:"Order 17", status:"new", quotedTotalMinor:"1500", saleId:null};
  vi.mocked(callShop).mockImplementation(async action => {
    if (action === "listOnlineOrders") return {orders:created ? [order] : []};
    if (action === "createOnlineOrder") {created = true; return {orderId:order.orderId};}
    if (action === "orderLines") return {lines:[{productId:"rice", name:"Rice", quantity:2, unitPriceMinor:750}]};
    throw Error("Unexpected operation");
  });
  const overview: ShopOverview = {role:"owner", companyId:"demo", currency:"GHS", members:[], pendingInvites:[], stock:[],
    stores:[{id:"north", name:"North", status:"active"}], products:[{id:"rice", name:"Rice", active:true, unitPriceMinor:750}]};
  render(<SharedShopOrders companyId="demo" userId="owner" overview={overview} />);
  await screen.findByText("No online orders recorded.");
  fireEvent.change(screen.getByLabelText("Fulfilment store"),{target:{value:"north"}});
  fireEvent.change(screen.getByLabelText("Order reference (optional)"),{target:{value:"Order 17"}});
  fireEvent.change(screen.getByLabelText("Item 1"),{target:{value:"rice"}});
  fireEvent.change(screen.getByLabelText("Units 1"),{target:{value:"2"}});
  fireEvent.click(screen.getByRole("button",{name:"Save order"}));
  await waitFor(() => expect(callShop).toHaveBeenCalledWith("createOnlineOrder", {
    companyId:"demo", orderId:expect.any(String), storeId:"north", customerReference:"Order 17",
    lines:[{productId:"rice",quantity:2}]
  },"tallybook_shop_ops"));
  expect(await screen.findByText(/Rice · 2 ×/)).toBeInTheDocument();
  expect(screen.getByRole("button",{name:"Accept order"})).toBeEnabled();
});
