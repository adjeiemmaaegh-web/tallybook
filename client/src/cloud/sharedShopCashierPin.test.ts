import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {recordShopSaleForCashier,ShopUnreachableError} from "./shopClient";
import type {SaleRequest} from "./shopClient";

const test=vi.hoisted(()=>({session:vi.fn()}));
vi.mock("@/lib/supabase",()=>({getSupabaseClient:()=>({auth:{getSession:test.session}})}));
const sale:SaleRequest={storeId:"store",submissionKey:"sale-123",lines:[{productId:"soap",quantity:1}],tenders:[{method:"cash",amountMinor:500,tenderedMinor:500}]};
const serverReceipt=(who:string)=>({companyId:"biz",cashierId:who,submissionKey:"sale-123"});
beforeEach(()=>{
 vi.stubEnv("VITE_SUPABASE_URL","https://shop-test.supabase.co");
 vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY","public-test-key");
 test.session.mockReset().mockResolvedValue({data:{session:{user:{id:"staff-a"},access_token:"signed-token-a"}},error:null});
});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe("original cashier JWT is pinned when a queued sale syncs",()=>{
 it("pins A's token even if the active browser account changes to B while the POST is pending",async()=>{
  let resolve!: (value:unknown)=>void;
  const request=new Promise(done=>{resolve=done;});
  const fetchMock=vi.fn().mockReturnValue(request);
  vi.stubGlobal("fetch",fetchMock);
  const outcome=recordShopSaleForCashier("biz",sale,"staff-a");
  await vi.waitFor(()=>expect(fetchMock).toHaveBeenCalledOnce());
  test.session.mockResolvedValue({data:{session:{user:{id:"staff-b"},access_token:"signed-token-b"}},error:null});
  const options=fetchMock.mock.calls[0][1] as RequestInit;
  expect((options.headers as Record<string,string>).Authorization).toBe("Bearer signed-token-a");
  resolve({ok:true,json:async()=>serverReceipt("staff-a")});
  expect((await outcome).cashierId).toBe("staff-a");
 });
 it("does not post A's queued sale using B's login",async()=>{
  test.session.mockResolvedValue({data:{session:{user:{id:"staff-b"},access_token:"signed-token-b"}},error:null});
  const fetchMock=vi.fn();vi.stubGlobal("fetch",fetchMock);
  await expect(recordShopSaleForCashier("biz",sale,"staff-a")).rejects.toBeInstanceOf(ShopUnreachableError);
  expect(fetchMock).not.toHaveBeenCalled();
 });
 it("rejects a response assigned to the wrong cashier rather than confirming the queued sale",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>serverReceipt("staff-b")}));
  await expect(recordShopSaleForCashier("biz",sale,"staff-a")).rejects.toBeInstanceOf(ShopUnreachableError);
 });
});
