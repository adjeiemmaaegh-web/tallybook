import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {beforeEach,expect,it,vi} from "vitest";
import {SharedShopVariantQuickPicker} from "./SharedShopVariantQuickPicker";
import {listShopVariants} from "./shopVariants";
import type {ShopOverview} from "./shopClient";
vi.mock("./shopVariants",async orig=>({
 ...await orig<object>(),listShopVariants:vi.fn()
}));
const one="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const two="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const overview:ShopOverview={
 companyId:"shop",role:"attendant",currency:"GHS",
 stores:[{id:"store",name:"Main",status:"active"}],
 products:[
  {id:one,name:"T-shirt M Blue",unitPriceMinor:2600,active:true,kind:"good",trackStock:true},
  {id:two,name:"T-shirt L Blue",unitPriceMinor:2800,active:true,kind:"good",trackStock:true},
 ],stock:[{storeId:"store",productId:one,quantity:4},{storeId:"store",productId:two,quantity:0}],
 members:[],pendingInvites:[]
};
const onAdd=vi.fn(()=>true);
const props={companyId:"shop",overview,online:true,storeId:"store",
 available:(p:{id:string})=>p.id===one,onAdd};
beforeEach(()=>{
 vi.clearAllMocks();
 vi.mocked(listShopVariants).mockResolvedValue([
  {productId:one,variantFamily:"Cotton T-shirt",variantSize:"M",variantColor:"Blue"},
  {productId:two,variantFamily:"Cotton T-shirt",variantSize:"L",variantColor:"Blue"},
 ]);
});
it("does no cloud work until the cashier asks for grouped SKUs",()=>{
 render(<SharedShopVariantQuickPicker {...props}/>);
 expect(listShopVariants).not.toHaveBeenCalled();
 expect(screen.getByRole("button",{name:"Browse sizes & colours"})).toHaveAttribute("aria-expanded","false");
});
it("uses original cart callback for available SKU; leaves out-of-stock option disabled",async()=>{
 render(<SharedShopVariantQuickPicker {...props}/>);
 fireEvent.click(screen.getByRole("button",{name:"Browse sizes & colours"}));
 expect(await screen.findByRole("button",{name:"Cotton T-shirt"})).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"Cotton T-shirt"}));
 expect(screen.getByText(/4 in this store/)).toBeInTheDocument();
 expect(screen.getByText(/0 in this store/)).toBeInTheDocument();
 const add=screen.getByRole("button",{name:"Add SKU"});
 fireEvent.click(add);
 await waitFor(()=>expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({id:one})));
 expect(screen.getByRole("button",{name:"Out of stock"})).toBeDisabled();
});
it("failed read is not presented as a valid empty variant catalogue",async()=>{
 vi.mocked(listShopVariants).mockRejectedValue(new Error("Migration unavailable"));
 render(<SharedShopVariantQuickPicker {...props}/>);
 fireEvent.click(screen.getByRole("button",{name:"Browse sizes & colours"}));
 expect(await screen.findByRole("alert")).toHaveTextContent("Migration unavailable");
 expect(screen.queryByText("No size/colour groups have been configured for this shop.")).toBeNull();
 expect(onAdd).not.toHaveBeenCalled();
});
