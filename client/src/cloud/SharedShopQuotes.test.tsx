import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {beforeEach,expect,it,vi} from "vitest";
import {SharedShopQuotes} from "./SharedShopQuotes";
import type {ShopOverview} from "./shopClient";
import type {Quotation} from "./quotations";

const ops=vi.hoisted(()=>({list:vi.fn(),create:vi.fn(),decide:vi.fn()}));
vi.mock("./quotations",async orig=>({
 ...(await orig<object>()),listShopQuotations:ops.list,createShopQuotation:ops.create,decideShopQuotation:ops.decide
}));
const overview:ShopOverview={companyId:"biz",currency:"GHS",role:"owner",
 stores:[{id:"main",name:"Main",status:"active"}],
 products:[{id:"rice",name:"Rice",active:true,unitPriceMinor:1500}],stock:[],
 members:[],pendingInvites:[]};
const quote=(n:number,status:Quotation["status"],name:string):Quotation=>({
 quotationId:"q-"+n,quoteNo:n,storeId:"main",customerId:null,customerName:name,
 status,validUntil:"2026-12-01",note:null,totalMinor:1500,
 createdBy:"owner",createdAt:"2026-11-14T05:00:00Z",saleId:null,
 lines:[{productId:"rice",name:"Rice",quantity:1,unitPriceMinor:1500,lineTotalMinor:1500}]
});
const props={companyId:"biz",overview,online:true,shopName:"Main",userId:"owner",onStartSale:vi.fn()};
beforeEach(()=>{
 vi.clearAllMocks();ops.list.mockResolvedValue([
   quote(1,"open","Ama"),quote(2,"accepted","Esi"),quote(3,"expired","Kofi")
 ]);
 ops.create.mockResolvedValue({quotationId:"new",quoteNo:4,replayed:false});
});
it("shows server-authorized quote statuses and filters recent records",async()=>{
 render(<SharedShopQuotes {...props}/>);
 const summary=await screen.findByLabelText("Quotation summary");
 expect(summary).toHaveTextContent("Recent offers3");
 expect(summary).toHaveTextContent("Open or accepted2");
 const filter=screen.getByRole("group",{name:"Quotation status"});
 fireEvent.click(filter.querySelectorAll("button")[2]!);
 expect(screen.getByText(/1 of 3 recent quotations shown/)).toBeInTheDocument();
 expect(screen.getByText(/#3 · Kofi/)).toBeInTheDocument();
 expect(screen.queryByText(/#2 · Esi/)).toBeNull();
 fireEvent.click(filter.querySelectorAll("button")[0]!);
 fireEvent.change(screen.getByLabelText("Search quotations"),{target:{value:"esi"}});
 expect(screen.getByText(/#2 · Esi/)).toBeInTheDocument();
 expect(screen.queryByText(/#1 · Ama/)).toBeNull();
 expect(ops.create).not.toHaveBeenCalled();
});
it("refuses validity beyond server's maximum without posting a quote",async()=>{
 render(<SharedShopQuotes {...props}/>);
 await screen.findByLabelText("Quotation summary");
 fireEvent.change(screen.getByLabelText("Customer name"),{target:{value:"Ada"}});
 fireEvent.change(screen.getByLabelText("Item"),{target:{value:"rice"}});
 fireEvent.change(screen.getByLabelText("Good for (days)"),{target:{value:"91"}});
 fireEvent.click(screen.getByRole("button",{name:"Save quotation"}));
 expect(await screen.findByRole("alert")).toHaveTextContent("between 1 and 90 whole days");
 expect(ops.create).not.toHaveBeenCalled();
});
it("holds the original submission after an ambiguous timeout rather than issuing a second quotation ID",async()=>{
 ops.create.mockRejectedValueOnce(new Error("Connection lost"));
 render(<SharedShopQuotes {...props}/>);
 await screen.findByLabelText("Quotation summary");
 fireEvent.change(screen.getByLabelText("Customer name"),{target:{value:"Ada"}});
 fireEvent.change(screen.getByLabelText("Item"),{target:{value:"rice"}});
 fireEvent.click(screen.getByRole("button",{name:"Save quotation"}));
 expect(await screen.findByRole("alert")).toHaveTextContent("Connection lost");
 fireEvent.change(screen.getByLabelText("Customer name"),{target:{value:"Different customer"}});
 fireEvent.click(screen.getByRole("button",{name:"Save quotation"}));
 expect(await screen.findByRole("alert")).toHaveTextContent("previous quotation may already have been saved");
 expect(ops.create).toHaveBeenCalledTimes(1);
});
it("does not show an empty quote list when the ledger response fails",async()=>{
 ops.list.mockRejectedValueOnce(new Error("Quotes temporarily unavailable"));
 render(<SharedShopQuotes {...props}/>);
 expect(await screen.findByRole("alert")).toHaveTextContent("Quotes temporarily unavailable");
 expect(screen.queryByText("No quotations yet.")).toBeNull();
 expect(screen.queryByLabelText("Quotation summary")).toBeNull();
});
