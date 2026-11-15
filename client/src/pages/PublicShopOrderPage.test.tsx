import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import PublicShopOrderPage from "./PublicShopOrderPage";
import {getGuestCatalog,submitGuestOrder} from "@/cloud/shopPublicOrders";
vi.mock("@/cloud/shopPublicOrders",()=>({
 isPublicUuid:(v:unknown)=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(v),
 getGuestCatalog:vi.fn(),submitGuestOrder:vi.fn(),
}));
const token="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const product="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const receiptId="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
beforeEach(()=>{
 vi.clearAllMocks();sessionStorage.clear();
 window.location.hash="#"+token;
 vi.mocked(getGuestCatalog).mockResolvedValue({
  businessName:"Test Boutique",storeName:"Main Shop",currency:"GHS",
  products:[{productId:product,name:"Rice",unitPriceMinor:1500,category:null,kind:"good"}],
  catalogLimited:false,paymentCollected:false,stockReserved:false
 });
 vi.mocked(submitGuestOrder).mockResolvedValue({
  requestId:receiptId,status:"new",quotedTotalMinor:"3000",
  replayed:false,paymentCollected:false,accepted:false
 });
 vi.stubGlobal("crypto",{randomUUID:()=>receiptId});
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it("guest screen shows public catalogue but never asks for card or impersonates checkout payment",async()=>{
 render(<PublicShopOrderPage/>);
 expect(await screen.findByText("Test Boutique")).toBeInTheDocument();
 expect(screen.getByText(/not payment/i)).toBeInTheDocument();
 expect(screen.getByText(/shop must review and accept/i)).toBeInTheDocument();
 expect(screen.queryByText(/card number/i)).toBeNull();
 expect(screen.queryByText(/CVV/i)).toBeNull();
 expect(submitGuestOrder).not.toHaveBeenCalled();
});
it("a real guest request has contact consent, server quote, and original submission UUID",async()=>{
 render(<PublicShopOrderPage/>);
 await screen.findByText("Rice");
 fireEvent.change(screen.getByLabelText("Quantity of Rice"),{target:{value:"2"}});
 fireEvent.change(screen.getByLabelText("Your name"),{target:{value:"Guest Example"}});
 fireEvent.change(screen.getByLabelText("Contact phone"),{target:{value:"+233 240 001 234"}});
 fireEvent.click(screen.getByRole("checkbox",{name:/I agree to share these contact details/}));
 fireEvent.click(screen.getByRole("button",{name:"Send order request"}));
 await waitFor(()=>expect(submitGuestOrder).toHaveBeenCalledWith({
  shareToken:token,submissionKey:receiptId,customerName:"Guest Example",
  contactPhone:"+233 240 001 234",customerNote:"",consent:true,
  lines:[{productId:product,quantity:2}]
 }));
 expect(await screen.findByText(/Request received for review/)).toBeInTheDocument();
 expect(screen.getByText(receiptId)).toBeInTheDocument();
 expect(screen.getByText(/has not accepted this order or collected payment/)).toBeInTheDocument();
});
it("an unavailable link does not show an invented public shop",async()=>{
 vi.mocked(getGuestCatalog).mockRejectedValueOnce(new Error("Link revoked"));
 render(<PublicShopOrderPage/>);
 expect(await screen.findByRole("alert")).toHaveTextContent("Link revoked");
 expect(screen.queryByText("Select products")).toBeNull();
 expect(screen.queryByRole("button",{name:"Send order request"})).toBeNull();
});
