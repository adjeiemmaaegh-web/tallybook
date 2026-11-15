import {beforeEach,expect,it,vi} from "vitest";
import {callShop} from "./shopClient";
import {
 getGuestCatalog,normalizeGuestLines,normalizeGuestInput,
 submitGuestOrder,validateOwnerGuestOrders,
} from "./shopPublicOrders";
vi.mock("./shopClient",()=>({callShop:vi.fn()}));
const a="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const b="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const c="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
beforeEach(()=>vi.clearAllMocks());
it("rejects duplicate, negative, oversized and fractional guest quantities before RPC",()=>{
 const bad=[
  [{productId:a,quantity:1},{productId:a,quantity:2}],
  [{productId:a,quantity:-1}],
  [{productId:a,quantity:101}],
  [{productId:a,quantity:1.25}],
  [{productId:"not-a-uuid",quantity:2}],
 ];
 for(const lines of bad)expect(()=>normalizeGuestLines(lines)).toThrow();
 expect(callShop).not.toHaveBeenCalled();
});
it("never accepts malformed phone or hidden control characters",()=>{
 const valid={shareToken:a,submissionKey:b,customerName:" Visitor ",contactPhone:"+233 240 001 234",
  customerNote:"Hi",lines:[{productId:c,quantity:3}]};
 expect(normalizeGuestInput(valid).customerName).toBe("Visitor");
 expect(()=>normalizeGuestInput({...valid,contactPhone:"123"})).toThrow();
 expect(()=>normalizeGuestInput({...valid,customerName:"V\nictim"})).toThrow();
 expect(callShop).not.toHaveBeenCalled();
});
it("public catalogue validates the absence of stock, private cost and payments",async()=>{
 vi.mocked(callShop).mockResolvedValueOnce({
  businessName:"Business",storeName:"Store",currency:"GHS",
  products:[{productId:a,name:"Rice",unitPriceMinor:1000,category:null,kind:"good"}],
  catalogLimited:false,paymentCollected:false,stockReserved:false
 });
 const result=await getGuestCatalog(b);
 expect(result.products).toHaveLength(1);
 expect(callShop).toHaveBeenCalledWith("catalog",{shareToken:b},"tallybook_guest_order");
 await expect(getGuestCatalog("invalid")).rejects.toThrow();
 vi.mocked(callShop).mockResolvedValueOnce({
  businessName:"Business",storeName:"Store",currency:"GHS",
  products:[],catalogLimited:false,paymentCollected:true,stockReserved:false
 });
 await expect(getGuestCatalog(b)).rejects.toThrow(/Unverified public catalogue/);
});
it("sends exact same client submission ID and checks no-payment server receipt",async()=>{
 const draft={shareToken:a,submissionKey:b,customerName:"Visitor",contactPhone:"+233 240 001 234",
  customerNote:"",lines:[{productId:c,quantity:2}]};
 vi.mocked(callShop).mockResolvedValueOnce({
  requestId:c,status:"new",quotedTotalMinor:"4000",replayed:false,paymentCollected:false,accepted:false
 });
 expect((await submitGuestOrder(draft)).status).toBe("new");
 expect(callShop).toHaveBeenCalledWith("submit",draft,"tallybook_guest_order");
 vi.mocked(callShop).mockResolvedValueOnce({
  requestId:c,status:"new",quotedTotalMinor:"4000",replayed:false,paymentCollected:true,accepted:false
 });
 await expect(submitGuestOrder(draft)).rejects.toThrow(/not verified/);
});
it("owner lists only validated bounded private history",()=>{
 const request={
  requestId:c,storeId:a,customerName:"Visitor",contactPhone:"+233 240 001 234",
  customerNote:"",lines:[{productId:b,quantity:2}],quotedTotalMinor:"4000",
  status:"new",convertedOrderId:null,createdAt:"2026-11-15T09:00:00Z"
 };
 expect(validateOwnerGuestOrders({shares:[],requests:[request]}).requests).toHaveLength(1);
 expect(()=>validateOwnerGuestOrders({shares:[],requests:[{...request,convertedOrderId:b}]})).toThrow();
 expect(()=>validateOwnerGuestOrders({shares:[],requests:[request,request]})).toThrow();
 expect(()=>validateOwnerGuestOrders({shares:[],requests:[{...request,lines:[{productId:b,quantity:-9}]}]})).toThrow();
});
