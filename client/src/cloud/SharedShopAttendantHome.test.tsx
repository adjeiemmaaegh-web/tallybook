import {describe,expect,it,vi} from "vitest";
import {fireEvent,render,screen} from "@testing-library/react";
import {SharedShopAttendantHome} from "./SharedShopAttendantHome";
import type {ShopOverview} from "./shopClient";

const attendantOverview = (withStore:boolean):ShopOverview => ({
 companyId:"company-1",role:"attendant",currency:"GHS",
 stores:withStore?[{id:"store-1",name:"Assigned shop",status:"active"}]:[],
 products:[{id:"product-1",name:"Soap",active:true,unitPriceMinor:500}],
 stock:[],members:[],pendingInvites:[],
});
describe("attendant home uses server-scoped stores, not owner-only member lists",()=>{
 it("enables sales for an assigned store even when members is redacted",()=>{
  const navigate=vi.fn();
  render(<SharedShopAttendantHome shopName="Shop" overview={attendantOverview(true)} onNavigate={navigate}/>);
  const sell=screen.getByRole("button",{name:/Start selling/});
  expect(sell.hasAttribute("disabled")).toBe(false);
  fireEvent.click(sell);
  expect(navigate).toHaveBeenCalledWith("sell");
  expect(screen.queryByText(/Outstanding customer credit/)).toBeNull();
 });
 it("prevents opening the till from home when the server supplies no assigned stores",()=>{
  const navigate=vi.fn();
  render(<SharedShopAttendantHome shopName="Shop" overview={attendantOverview(false)} onNavigate={navigate}/>);
  const sell=screen.getByRole("button",{name:/Start selling/});
  expect(sell.hasAttribute("disabled")).toBe(true);
  fireEvent.click(sell);
  expect(navigate).not.toHaveBeenCalled();
 });
});
