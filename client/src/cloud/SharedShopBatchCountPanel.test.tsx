import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {SharedShopBatchCountPanel} from "./SharedShopBatchCountPanel";
import type {ShopOverview} from "./shopClient";
const rpc=vi.hoisted(()=>({list:vi.fn(),start:vi.fn(),apply:vi.fn(),cancel:vi.fn()}));
vi.mock("./shopBatchStocktake",async orig=>({
 ...await orig<object>(),
 listBatchStocktakes:rpc.list,startBatchStocktake:rpc.start,
 applyBatchStocktake:rpc.apply,cancelBatchStocktake:rpc.cancel,
}));
vi.mock("@/lib/confirmAction",()=>({confirmAction:vi.fn(async()=>true)}));
const store="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const rice="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const sugar="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const batchId="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const overview:ShopOverview={
 companyId:"company",role:"owner",currency:"GHS",
 stores:[{id:store,name:"Main Store",status:"active"}],
 products:[
  {id:rice,name:"Rice",active:true,unitPriceMinor:1500,kind:"good",trackStock:true},
  {id:sugar,name:"Sugar",active:true,unitPriceMinor:2000,kind:"good",trackStock:true}
 ],
 stock:[{storeId:store,productId:rice,quantity:5},{storeId:store,productId:sugar,quantity:8}],
 members:[],pendingInvites:[]
};
const props={userId:"owner",companyId:"company",overview,online:true,refresh:vi.fn(async()=>{})};
const item={batchId,storeId:store,status:"open",createdAt:"2026-11-15T01:00:00Z",appliedAt:null,
 lines:[{productId:rice,expectedQuantity:5,countedQuantity:null},
   {productId:sugar,expectedQuantity:8,countedQuantity:null}]};
beforeEach(()=>{
 vi.clearAllMocks();
 sessionStorage.clear();
 rpc.list.mockResolvedValue([item]);
 rpc.apply.mockResolvedValue({batchId,status:"applied",replayed:false});
 rpc.start.mockImplementation(async (_company,input)=>({batchId:input.batchId,status:"open",replayed:false}));
 vi.stubGlobal("crypto",{randomUUID:()=>batchId});
});
afterEach(()=>vi.unstubAllGlobals());
it("does not load or mutate when the optional batch workspace is closed",()=>{
 render(<SharedShopBatchCountPanel {...props}/>);
 expect(screen.getByRole("button",{name:/Open multi-product stocktake/})).toHaveAttribute("aria-expanded","false");
 expect(rpc.list).not.toHaveBeenCalled();
 expect(rpc.start).not.toHaveBeenCalled();
});
it("requires every count and posts one complete multi-SKU request",async()=>{
 render(<SharedShopBatchCountPanel {...props}/>);
 fireEvent.click(screen.getByRole("button",{name:/Open multi-product stocktake/}));
 await screen.findByText(/Main Store · 2 products · open/);
 const post=screen.getByRole("button",{name:"Apply entire batch"});
 expect(post).toBeDisabled();
 fireEvent.change(screen.getByLabelText("Count Rice in batch "+batchId),{target:{value:"3"}});
 expect(post).toBeDisabled();
 fireEvent.change(screen.getByLabelText("Count Sugar in batch "+batchId),{target:{value:"8"}});
 expect(post).toBeEnabled();
 fireEvent.click(post);
 await waitFor(()=>expect(rpc.apply).toHaveBeenCalledWith("company",{
  batchId,lines:[{productId:rice,countedQuantity:3},{productId:sugar,countedQuantity:8}]
 }));
 expect(rpc.cancel).not.toHaveBeenCalled();
});
it("never turns a failed server read into empty history or a stock write",async()=>{
 rpc.list.mockRejectedValueOnce(new Error("Database missing migration"));
 render(<SharedShopBatchCountPanel {...props}/>);
 fireEvent.click(screen.getByRole("button",{name:/Open multi-product stocktake/}));
 expect(await screen.findByRole("alert")).toHaveTextContent("Database missing migration");
 expect(screen.queryByText("No batch sessions in the latest server results.")).toBeNull();
 expect(screen.queryByRole("button",{name:"Open selected batch"})).toBeNull();
 expect(rpc.apply).not.toHaveBeenCalled();
});
it("persists original batch identity on a lost response for an exact retry",async()=>{
 rpc.list.mockResolvedValue([]);
 rpc.start.mockRejectedValueOnce(new Error("Response lost"));
 render(<SharedShopBatchCountPanel {...props}/>);
 fireEvent.click(screen.getByRole("button",{name:/Open multi-product stocktake/}));
 await screen.findByText("No batch sessions in the latest server results.");
 fireEvent.change(screen.getByLabelText("Store"),{target:{value:store}});
 fireEvent.click(screen.getByRole("checkbox",{name:"Rice"}));
 fireEvent.click(screen.getByRole("checkbox",{name:"Sugar"}));
 fireEvent.click(screen.getByRole("button",{name:"Open selected batch"}));
 expect(await screen.findByRole("alert")).toHaveTextContent("Response lost");
 expect(sessionStorage.getItem("tallybook.batch-stocktake.pending.company.owner")).toContain(batchId);
 fireEvent.click(screen.getByRole("button",{name:"Retry same batch ID"}));
 await waitFor(()=>expect(rpc.start).toHaveBeenCalledTimes(2));
 expect(rpc.start.mock.calls[0][1]).toEqual(rpc.start.mock.calls[1][1]);
});
