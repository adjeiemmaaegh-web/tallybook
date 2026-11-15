/** Stage 18: dashboard figures must originate from the current company's authorized server read. */
import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {beforeEach,expect,it,vi} from "vitest";
import {SharedShopOwnerDashboard} from "./SharedShopOwnerDashboard";
import {callShop,type ShopOverview} from "./shopClient";
import {getShopSupplierBalances} from "./shopPurchasing";

vi.mock("./shopClient",()=>({callShop:vi.fn()}));
vi.mock("./shopPurchasing",()=>({getShopSupplierBalances:vi.fn()}));

const overview:ShopOverview={companyId:"biz-a",role:"owner",currency:"GHS",stores:[],products:[],
 stock:[{storeId:"branch",productId:"rice",quantity:5}],members:[],pendingInvites:[]};
const result=(companyId:string,days:number)=>({companyId,role:"owner" as const,days,currency:"GHS",
 salesCount:days===1?3:12,grossMinor:days===1?"135000":"750000",
 refundMinor:days===1?"15000":"50000",netSalesMinor:days===1?"120000":"700000",
 customerCreditOutstandingMinor:"9000"});
beforeEach(()=>vi.resetAllMocks());

it("uses only authorized server summaries and opens the existing POS route",async()=>{
 const navigate=vi.fn();
 vi.mocked(callShop).mockImplementation(async (_action,input)=>result("biz-a",Number(input.days)));
 vi.mocked(getShopSupplierBalances).mockResolvedValue({suppliers:[{outstandingMinor:"5500"}]} as never);
 const {container}=render(<SharedShopOwnerDashboard companyId="biz-a" businessName="North shop"
  overview={overview} online={true} onNavigate={navigate}/>);
 await waitFor(()=>expect(container.querySelector(".tb-shop-home-metric-featured strong")?.textContent).toContain("1,200"));
 expect(callShop).toHaveBeenCalledWith("salesSummary",{companyId:"biz-a",days:1},"tallybook_shop_ops");
 expect(callShop).toHaveBeenCalledWith("salesSummary",{companyId:"biz-a",days:7},"tallybook_shop_ops");
 expect(screen.getByText("Not verified")).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"Open POS"}));
 expect(navigate).toHaveBeenCalledWith("sell");
});

it("does not display foreign-company totals or fabricate live amounts when offline",async()=>{
 vi.mocked(callShop).mockImplementation(async (_action,input)=>result("another-company",Number(input.days)));
 vi.mocked(getShopSupplierBalances).mockRejectedValue(new Error("Unavailable"));
 const {container,rerender}=render(<SharedShopOwnerDashboard companyId="biz-a"
  businessName="North shop" overview={overview} online={true}/>);
 await waitFor(()=>expect(callShop).toHaveBeenCalledTimes(2));
 expect(container.querySelector(".tb-shop-home-metric-featured strong")?.textContent).toBe("Unavailable");
 rerender(<SharedShopOwnerDashboard companyId="biz-a" businessName="North shop" overview={overview} online={false}/>);
 expect(await screen.findByText(/Offline: live shared sales/)).toBeInTheDocument();
 expect(container.querySelector(".tb-shop-home-metric-featured strong")?.textContent).toBe("Unavailable");
});

it("navigates the owner directly to real sales, purchasing, and physical count workflows",async()=>{
 vi.mocked(callShop).mockImplementation(async (_action,input)=>result("biz-a",Number(input.days)));
 vi.mocked(getShopSupplierBalances).mockResolvedValue({suppliers:[]} as never);
 const navigate=vi.fn();
 render(<SharedShopOwnerDashboard companyId="biz-a" businessName="North shop" overview={overview} online={true} onNavigate={navigate}/>);
 await screen.findByText("North shop");
 for(const [label,tab] of [["Sales history","sales"],["Purchasing","purchasing"],["Physical stock counts","stock-counts"]] as const){
  fireEvent.click(screen.getByRole("button",{name:new RegExp("^"+label)}));
  expect(navigate).toHaveBeenLastCalledWith(tab);
 }
});
