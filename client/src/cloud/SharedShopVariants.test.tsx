import {beforeEach,expect,it,vi} from "vitest";
import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {SharedShopVariants} from "./SharedShopVariants";
import {callShop,type ShopOverview} from "./shopClient";
vi.mock("./shopClient",async orig=>({...await orig<object>(),callShop:vi.fn()}));
const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const two="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const overview:ShopOverview={
 companyId:"biz",role:"owner",currency:"GHS",
 stores:[{id:"store",name:"Main",status:"active"}],
 products:[
  {id,name:"T-shirt (M blue)",unitPriceMinor:2600,active:true,barcode:"SHIRTMB",kind:"good",trackStock:true},
  {id:two,name:"T-shirt (L blue)",unitPriceMinor:2800,active:true,barcode:"SHIRTLB",kind:"good",trackStock:true}
 ],
 stock:[{storeId:"store",productId:id,quantity:4},{storeId:"store",productId:two,quantity:10}],
 members:[],pendingInvites:[]
};
const props={companyId:"biz",overview,online:true,storeId:"store",refresh:vi.fn(async()=>{})};
beforeEach(()=>{
 vi.clearAllMocks();
 vi.mocked(callShop).mockImplementation(async action=>{
  if(action==="list")return {variants:[]};
  throw Error("No variant writes configured");
 });
});
it("does not read or rewrite the ledger until the owner opens the variant manager",async()=>{
 render(<SharedShopVariants {...props}/>);
 expect(screen.getByRole("button",{name:/Sizes & colours/})).toHaveAttribute("aria-expanded","false");
 expect(callShop).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button",{name:/Sizes & colours/}));
 expect(await screen.findByLabelText("Variant summary")).toHaveTextContent("Grouped SKUs0");
 expect(callShop).toHaveBeenCalledWith("list",{companyId:"biz"},"tallybook_shop_variants");
 expect(vi.mocked(callShop).mock.calls.every(([action])=>action==="list")).toBe(true);
});
it("assigns a real separately stocked SKU to a family without touching sales or quantities",async()=>{
 const rows:unknown[]=[];
 vi.mocked(callShop).mockImplementation(async(action,input)=>{
  if(action==="list")return {variants:[...rows]};
  if(action==="set"){
   const result={productId:input.productId,variantFamily:input.variantFamily,
     variantSize:input.variantSize,variantColor:input.variantColor,changed:true};
   rows.push(result);return result;
  }
  throw Error("Unexpected shop action");
 });
 render(<SharedShopVariants {...props}/>);
 fireEvent.click(screen.getByRole("button",{name:/Sizes & colours/}));
 await screen.findByLabelText("Variant summary");
 fireEvent.change(screen.getByLabelText("Select stocked product"),{target:{value:id}});
 fireEvent.change(screen.getByLabelText("Product family"),{target:{value:"Cotton T-shirt"}});
 fireEvent.change(screen.getByLabelText("Size"),{target:{value:"M"}});
 fireEvent.change(screen.getByLabelText("Colour"),{target:{value:"Blue"}});
 fireEvent.click(screen.getByRole("button",{name:"Save variant"}));
 await waitFor(()=>expect(callShop).toHaveBeenCalledWith("set",{
  companyId:"biz",productId:id,variantFamily:"Cotton T-shirt",variantSize:"M",variantColor:"Blue"
 },"tallybook_shop_variants"));
 await screen.findByText("Cotton T-shirt");
 expect(screen.getByText(/4 units in selected store/)).toBeInTheDocument();
 expect(vi.mocked(callShop).mock.calls.map(([action])=>action)).toEqual(["list","set","list"]);
});
it("hides mutation controls from a staff reader and performs no writes offline",async()=>{
 const view=render(<SharedShopVariants {...props} overview={{...overview,role:"attendant"}} online={false}/>);
 fireEvent.click(screen.getByRole("button",{name:/Sizes & colours/}));
 expect(screen.getByText(/Connect to manage variants/)).toBeInTheDocument();
 expect(screen.queryByRole("button",{name:"Save variant"})).toBeNull();
 expect(callShop).not.toHaveBeenCalled();
 view.unmount();
});
it("displays a failed server read as unavailable, not zero variant groups",async()=>{
 vi.mocked(callShop).mockRejectedValue(new Error("Variant service unavailable"));
 render(<SharedShopVariants {...props}/>);
 fireEvent.click(screen.getByRole("button",{name:/Sizes & colours/}));
 expect(await screen.findByRole("alert")).toHaveTextContent("Variant service unavailable");
 expect(screen.queryByLabelText("Variant summary")).toBeNull();
 expect(screen.queryByText(/No variant groups saved yet/)).toBeNull();
});
