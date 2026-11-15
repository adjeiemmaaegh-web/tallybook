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

it("accepts a recorded order but does not invent a paid receipt or move stock",async()=>{
 vi.clearAllMocks();
 let status:"new"|"accepted"="new";
 const order=()=>({orderId:"order-b",storeId:"north",customerReference:"Order 77",status,quotedTotalMinor:"2250",saleId:null});
 vi.mocked(callShop).mockImplementation(async action=>{
  if(action==="listOnlineOrders")return {orders:[order()]};
  if(action==="orderLines")return {lines:[{productId:"rice",name:"Rice",quantity:3,unitPriceMinor:750}]};
  if(action==="acceptOnlineOrder"){status="accepted";return {orderId:"order-b",status};}
  throw Error("Unexpected order operation");
 });
 const overview:ShopOverview={role:"owner",companyId:"demo",currency:"GHS",members:[],pendingInvites:[],
  stock:[],stores:[{id:"north",name:"North",status:"active"}],
  products:[{id:"rice",name:"Rice",active:true,unitPriceMinor:750}]};
 render(<SharedShopOrders companyId="demo" userId="owner" overview={overview}/>);
 await screen.findByRole("option",{name:/Order 77/});
 fireEvent.change(screen.getByLabelText("Review order"),{target:{value:"order-b"}});
 fireEvent.click(await screen.findByRole("button",{name:"Accept order"}));
 await waitFor(()=>expect(callShop).toHaveBeenCalledWith("acceptOnlineOrder",
  {companyId:"demo",orderId:"order-b"},"tallybook_shop_ops"));
 expect(await screen.findByLabelText("Matching recorded receipt")).toBeInTheDocument();
 expect(screen.getByRole("button",{name:"Link receipt"})).toBeDisabled();
 expect(vi.mocked(callShop).mock.calls.some(([action])=>action==="recordSale"||action==="adjustStock")).toBe(false);
});

it("filters true externally received orders by state and reference without posting sales",async()=>{
 vi.clearAllMocks();
 const data=[
 {orderId:"new-1",storeId:"north",customerReference:"Mobile customer A",status:"new",quotedTotalMinor:"1500",saleId:null},
 {orderId:"ok-2",storeId:"north",customerReference:"Counter enquiry B",status:"accepted",quotedTotalMinor:"1500",saleId:null},
 {orderId:"done-3",storeId:"north",customerReference:"Counter enquiry C",status:"closed",quotedTotalMinor:"1500",saleId:null}
 ];
 vi.mocked(callShop).mockImplementation(async action=>{
  if(action==="listOnlineOrders")return {orders:data};
  throw new Error("No write should occur");
 });
 const overview:ShopOverview={role:"owner",companyId:"demo",currency:"GHS",members:[],pendingInvites:[],
 stock:[],stores:[{id:"north",name:"North",status:"active"}],
 products:[{id:"rice",name:"Rice",active:true,unitPriceMinor:750}]};
 render(<SharedShopOrders companyId="demo" userId="owner" overview={overview}/>);
 expect(await screen.findByText("3 of 3 orders shown")).toBeInTheDocument();
 expect(screen.getByText(/customer-facing web checkout is not connected/)).toBeInTheDocument();
 const status=screen.getByRole("group",{name:"Order status"});
 fireEvent.click(status.querySelectorAll("button")[2]!);
 expect(screen.getByText("1 of 3 orders shown")).toBeInTheDocument();
 expect(screen.getByLabelText("Review order")).toHaveTextContent("Counter enquiry B");
 expect(screen.getByLabelText("Review order")).not.toHaveTextContent("Mobile customer A");
 fireEvent.click(status.querySelectorAll("button")[0]!);
 fireEvent.change(screen.getByLabelText("Search orders"),{target:{value:"done-3"}});
 expect(screen.getByLabelText("Review order")).toHaveTextContent("Counter enquiry C");
 expect(screen.getByText("1 of 3 orders shown")).toBeInTheDocument();
 expect(vi.mocked(callShop).mock.calls.every(([action])=>action==="listOnlineOrders")).toBe(true);
});
