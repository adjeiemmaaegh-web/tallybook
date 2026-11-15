import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {beforeEach,expect,it,vi} from "vitest";
import {SharedShopStockCountPanel} from "./SharedShopStockCountPanel";
import type {ShopOverview} from "./shopClient";

const ops=vi.hoisted(()=>({list:vi.fn(),apply:vi.fn(),cancel:vi.fn(),start:vi.fn()}));
vi.mock("./shopPurchasing",()=>({
 getShopStockCounts:ops.list,applyShopStockCount:ops.apply,cancelShopStockCount:ops.cancel,startShopStockCount:ops.start
}));
const overview:ShopOverview={role:"owner",companyId:"biz",currency:"GHS",
 stores:[{id:"main",name:"Accra Main",status:"active"}],
 products:[{id:"rice",name:"Rice",active:true,unitPriceMinor:1500}],
 stock:[{storeId:"main",productId:"rice",quantity:12}],members:[],pendingInvites:[]};
const props={companyId:"biz",userId:"owner",overview,online:true,refresh:vi.fn(async()=>{})};
const count={countId:"count-1",storeId:"main",productId:"rice",expectedQuantity:12,
 countedQuantity:null,status:"open",createdAt:"2026-11-14T05:00:00Z"};

beforeEach(()=>{
 vi.clearAllMocks();
 ops.list.mockResolvedValue({counts:[count]});
 ops.apply.mockResolvedValue({countId:"count-1",status:"applied"});
 vi.spyOn(window,"confirm").mockReturnValue(true);
});
it("previews a shortage before the same server-verified count is posted",async()=>{
 render(<SharedShopStockCountPanel {...props}/>);
 await screen.findByText("Count # count-1");
 expect(screen.getByLabelText("Count summary")).toHaveTextContent("Open1");
 const apply=screen.getByRole("button",{name:"Apply physical count"});
 expect(apply).toBeDisabled();
 fireEvent.change(screen.getByLabelText("Physically counted units"),{target:{value:"7"}});
 expect(screen.getByText(/Short by 5 units versus snapshot/)).toBeInTheDocument();
 expect(apply).toBeEnabled();
 fireEvent.click(apply);
 await waitFor(()=>expect(ops.apply).toHaveBeenCalledWith("biz",{countId:"count-1",countedQuantity:7}));
 expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("Expected shortage of 5 units"));
});
it("never presents an unverified zero count when the server read fails",async()=>{
 ops.list.mockRejectedValueOnce(new Error("Ledger unavailable"));
 render(<SharedShopStockCountPanel {...props}/>);
 expect(await screen.findByRole("alert")).toHaveTextContent("Ledger unavailable");
 expect(screen.queryByLabelText("Count summary")).toBeNull();
 expect(screen.queryByText("No active stock takes")).toBeNull();
 expect(screen.getByText(/no zero-session conclusion/)).toBeInTheDocument();
});
it("blocks malformed or enormous counts without any ledger write",async()=>{
 render(<SharedShopStockCountPanel {...props}/>);
 await screen.findByText("Count # count-1");
 for(const value of ["3.5","-1","1e3","2147483648"]){
  fireEvent.change(screen.getByLabelText("Physically counted units"),{target:{value}});
  expect(screen.getByRole("button",{name:"Apply physical count"})).toBeDisabled();
 }
 expect(ops.apply).not.toHaveBeenCalled();
});
