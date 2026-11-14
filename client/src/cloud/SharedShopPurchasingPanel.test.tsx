/** Stage 12: owner purchasing never pretends to send supplier money. */
import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {beforeEach,expect,it,vi} from "vitest";
import {SharedShopPurchasingPanel} from "./SharedShopPurchasingPanel";
import type {ShopOverview} from "./shopClient";

const mocked=vi.hoisted(()=>({balances:vi.fn(),orders:vi.fn(),settle:vi.fn()}));
vi.mock("./shopPurchasing",()=>({
 getShopSupplierBalances:mocked.balances,listShopPurchaseOrders:mocked.orders,
 getShopPurchaseDetails:vi.fn(),saveShopSupplier:vi.fn(),archiveShopSupplier:vi.fn(),
 createShopPurchaseOrder:vi.fn(),receiveShopPurchase:vi.fn(),closeShopPurchase:vi.fn(),
 settleShopSupplier:mocked.settle,
}));
const overview:ShopOverview={companyId:"biz",role:"owner",currency:"GHS",
 stores:[{id:"store-a",name:"Accra Main",status:"active"}],
 products:[{id:"rice",name:"Rice",unitPriceMinor:500,active:true}],
 stock:[],members:[],pendingInvites:[]};
const props={userId:"owner",companyId:"biz",overview,refresh:async()=>{}};
beforeEach(()=>{
 vi.clearAllMocks();
 mocked.balances.mockResolvedValue({suppliers:[{supplierId:"supp-a",name:"Goods Co",archived:false,receivedMinor:"1500",settledMinor:"500",outstandingMinor:"1000"}]});
 mocked.orders.mockResolvedValue({orders:[]});
});
it("blocks supplier or stock writes while offline",()=>{
 render(<SharedShopPurchasingPanel {...props} online={false}/>);
 expect(screen.getByText(/Shared Shop purchasing is unavailable offline/)).toBeInTheDocument();
 expect(screen.getByRole("button",{name:/Create order \(no stock added yet\)/})).toBeDisabled();
 expect(mocked.balances).not.toHaveBeenCalled();
});
it("refuses an overstated supplier settlement before any server write",async()=>{
 render(<SharedShopPurchasingPanel {...props} online={true}/>);
 await screen.findAllByRole("option",{name:"Goods Co"});
 expect(screen.getByText(/No payment is sent from this app/)).toBeInTheDocument();
 const selects=screen.getAllByLabelText("Supplier");
 fireEvent.change(selects[selects.length-1],{target:{value:"supp-a"}});
 fireEvent.change(screen.getByLabelText(/Amount already paid/),{target:{value:"20.00"}});
 fireEvent.click(screen.getByLabelText(/I confirm money has already been paid outside this app/));
 fireEvent.click(screen.getByRole("button",{name:/Record outside supplier payment/}));
 await waitFor(()=>expect(screen.getByRole("alert")).toHaveTextContent(/Supplier payment must be positive and not exceed recorded outstanding/));
 expect(mocked.settle).not.toHaveBeenCalled();
});

it("shows authorized payable totals and filters suppliers/orders without posting stock",async()=>{
 mocked.orders.mockResolvedValue({orders:[
  {orderId:"po-a",supplierId:"supp-a",storeId:"store-a",reference:"INV-1",closed:false,orderedLines:2,receivedMinor:"2000",createdAt:"2026-11-14"},
  {orderId:"po-b",supplierId:"supp-a",storeId:"store-a",reference:"INV-2",closed:true,orderedLines:1,receivedMinor:"500",createdAt:"2026-11-14"}
 ]});
 render(<SharedShopPurchasingPanel {...props} online={true}/>);
 const summary=await screen.findByLabelText("Purchasing summary");
 expect(summary).toHaveTextContent("Suppliers owing1");
 expect(summary).toHaveTextContent("Recorded payablesGHS 10.00");
 expect(screen.getByText("2 of 2 purchase orders shown")).toBeInTheDocument();
 const filter=screen.getByRole("group",{name:"Purchase order status"});
 fireEvent.click(filter.querySelectorAll("button")[1]!);
 expect(screen.getByText("1 of 2 purchase orders shown")).toBeInTheDocument();
 const chooser=screen.getByLabelText("Purchase order");
 expect(chooser).toHaveTextContent("INV-1");
 expect(chooser).not.toHaveTextContent("INV-2");
 fireEvent.change(screen.getByLabelText("Search suppliers"),{target:{value:"unlisted"}});
 expect(screen.getByText(/No suppliers match/)).toBeInTheDocument();
 expect(screen.queryByText("No suppliers in this shop.")).toBeNull();
 expect(mocked.settle).not.toHaveBeenCalled();
});

it("does not misreport zero payables when the authorized supplier read failed",async()=>{
 mocked.balances.mockRejectedValueOnce(new Error("Server balances unavailable"));
 render(<SharedShopPurchasingPanel {...props} online={true}/>);
 expect(await screen.findByRole("alert")).toHaveTextContent("Server balances unavailable");
 expect(screen.queryByLabelText("Purchasing summary")).toBeNull();
 expect(screen.queryByText("No suppliers in this shop.")).toBeNull();
 expect(mocked.settle).not.toHaveBeenCalled();
});
