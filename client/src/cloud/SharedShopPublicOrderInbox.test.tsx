import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {SharedShopPublicOrderInbox} from "./SharedShopPublicOrderInbox";
import type {ShopOverview} from "./shopClient";

const api=vi.hoisted(()=>({list:vi.fn(),create:vi.fn(),revoke:vi.fn(),resolve:vi.fn()}));
vi.mock("./shopPublicOrders",()=>({
 listOwnerGuestOrders:api.list,createPublicOrderShare:api.create,
 revokePublicOrderShare:api.revoke,resolveOwnerGuestRequest:api.resolve
}));
vi.mock("@/lib/confirmAction",()=>({confirmAction:vi.fn(async()=>true)}));
const store="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const product="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const share="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const request="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const token="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const overview:ShopOverview={
 role:"owner",companyId:"company",currency:"GHS",
 stores:[{id:store,name:"Main Store",status:"active"}],
 products:[{id:product,name:"Rice",unitPriceMinor:1500,active:true}],
 stock:[],members:[],pendingInvites:[]
};
const onConverted=vi.fn(async()=>{});
beforeEach(()=>{
 vi.clearAllMocks();
 api.list.mockResolvedValue({shares:[],requests:[]});
 api.create.mockResolvedValue({shareId:share,shareToken:token,storeId:store});
 api.resolve.mockResolvedValue({requestId:request,status:"converted",orderId:share,replayed:false});
});
afterEach(()=>cleanup());
it("never reads private guest contact information before owner opens the inbox",()=>{
 render(<SharedShopPublicOrderInbox companyId="company" overview={overview} onConverted={onConverted}/>);
 expect(api.list).not.toHaveBeenCalled();
 expect(screen.getByRole("button",{name:/Open public order links/})).toHaveAttribute("aria-expanded","false");
});
it("explicitly issues a share for selected store without creating a checkout payment",async()=>{
 render(<SharedShopPublicOrderInbox companyId="company" overview={overview} onConverted={onConverted}/>);
 fireEvent.click(screen.getByRole("button",{name:/Open public order links/}));
 await screen.findByText("No active public order links.");
 fireEvent.change(screen.getByLabelText("Store"),{target:{value:store}});
 fireEvent.click(screen.getByRole("button",{name:"Create public order link"}));
 await waitFor(()=>expect(api.create).toHaveBeenCalledWith("company",store));
 expect(screen.getByLabelText("New public order link")).toHaveValue(expect.stringContaining("/order#"+token));
 expect(screen.getByText(/No payments or stock reservations will be made|not checkout payments/i)).toBeInTheDocument();
});
it("verified owner sees real request and converts through existing-order callback",async()=>{
 api.list.mockResolvedValue({shares:[],requests:[{
  requestId:request,storeId:store,customerName:"Guest Example",
  contactPhone:"+233 240 001 234",customerNote:"Please call.",
  quotedTotalMinor:"3000",lines:[{productId:product,quantity:2}],
  status:"new",convertedOrderId:null,createdAt:"2026-11-15T09:00:00Z"
 }]});
 render(<SharedShopPublicOrderInbox companyId="company" overview={overview} onConverted={onConverted}/>);
 fireEvent.click(screen.getByRole("button",{name:/Open public order links/}));
 await screen.findByText(/Guest Example · new/);
 expect(screen.getByText(/Contact:/)).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"Convert to online order"}));
 await waitFor(()=>expect(api.resolve).toHaveBeenCalledWith("company",request,"convert"));
 await waitFor(()=>expect(onConverted).toHaveBeenCalledTimes(1));
});
