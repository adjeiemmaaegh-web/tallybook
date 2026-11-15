import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {beforeEach,expect,it,vi} from "vitest";
import type {ShopOverview} from "@/cloud/shopClient";

const mocks=vi.hoisted(()=>({overview:vi.fn(),outbox:vi.fn(),flush:vi.fn(),dismiss:vi.fn()}));
vi.mock("@/lib/supabase",()=>({
 isSupabaseConfigured:true,
 getSupabaseClient:()=>({auth:{
  getSession:async()=>({data:{session:{user:{id:"att-1"}}}}),
  getUser:async()=>({data:{user:{id:"att-1",email:"cashier@example.test"}}}),
  onAuthStateChange:()=>({data:{subscription:{unsubscribe:()=>{}}}})
 }})
}));
vi.mock("@/cloud/cloudMembership",()=>({
 listVerifiedCloudBusinesses:async()=>[{id:"biz",name:"Shop",role:"attendant",owner_id:"owner",created_at:"",updated_at:""}]
}));
vi.mock("@/cloud/shopClient",async original=>({
 ...(await original<object>()),getShopOverview:mocks.overview,
 getProductCatalog:async()=>[],
 getShopReadiness:async()=>({companyId:"biz",saleCount:1})
}));
vi.mock("@/cloud/shopOutbox",()=>({
 readOutbox:mocks.outbox,flushOutbox:mocks.flush,dismissQueuedSale:mocks.dismiss,
 submitSale:vi.fn(async()=>{throw Error("Should not submit a sale");})
}));
import SharedShopPage from "./SharedShopPage";

const overview:ShopOverview={
 companyId:"biz",role:"attendant",currency:"GHS",
 stores:[{id:"st-a",name:"Accra",status:"active"}],
 products:[{id:"eggs",name:"Eggs",unitPriceMinor:300,active:true}],
 stock:[{storeId:"st-a",productId:"eggs",quantity:3}],
 members:[],pendingInvites:[]
};
beforeEach(()=>{
 vi.clearAllMocks();
 localStorage.clear();sessionStorage.clear();
 Object.defineProperty(navigator,"onLine",{value:true,configurable:true});
 mocks.overview.mockResolvedValue(overview);
 mocks.outbox.mockResolvedValue([{id:"opaque-key",summary:"Sale pending review",status:"needs-review",error:"Needs stock reconciliation",unreadable:false}]);
 mocks.flush.mockResolvedValue([]);
 mocks.dismiss.mockResolvedValue(undefined);
});
it("does not discard an unresolved sale until a person explicitly confirms",async()=>{
 const confirm=vi.spyOn(window,"confirm").mockReturnValue(false);
 try{
  render(<SharedShopPage/>);
  const remove=await screen.findByRole("button",{name:"Remove rejected record"});
  expect(screen.getByText(/original submission key is retained/)).toBeInTheDocument();
  fireEvent.click(remove);
  await waitFor(()=>expect(confirm).toHaveBeenCalled());
  expect(mocks.dismiss).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);
  fireEvent.click(remove);
  await waitFor(()=>expect(mocks.dismiss).toHaveBeenCalledWith({userId:"att-1",companyId:"biz"},"opaque-key",{force:false}));
 }finally{confirm.mockRestore();}
});
