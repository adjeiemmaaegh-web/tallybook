import {beforeEach,expect,it,vi} from "vitest";
import {callShop} from "./shopClient";
import {
 applyBatchStocktake,listBatchStocktakes,normalizeBatchCounts,normalizeBatchProducts,
 startBatchStocktake,validateBatchList,
} from "./shopBatchStocktake";
vi.mock("./shopClient",()=>({callShop:vi.fn()}));
const a="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const b="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const c="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
beforeEach(()=>vi.clearAllMocks());
it("rejects duplicate, malformed and too-short stocktake selections without a server call",()=>{
 expect(()=>normalizeBatchProducts([a,a])).toThrow();
 expect(()=>normalizeBatchProducts([a])).toThrow();
 expect(()=>normalizeBatchProducts([a,"rice"])).toThrow();
 expect(()=>normalizeBatchProducts(Array.from({length:51},(_,i)=>i.toString()))).toThrow();
 expect(callShop).not.toHaveBeenCalled();
});
it("submits one canonical, idempotent batch start request",async()=>{
 vi.mocked(callShop).mockResolvedValue({batchId:c,status:"open",replayed:false});
 await expect(startBatchStocktake("shop",{batchId:c,storeId:a,productIds:[b,a]})).resolves.toMatchObject({batchId:c,status:"open"});
 expect(callShop).toHaveBeenCalledWith("start",{
  companyId:"shop",batchId:c,storeId:a,productIds:[a,b],
 },"tallybook_shop_stocktake_batches");
});
it("rejects duplicate or invalid count values; never rounds them",()=>{
 for(const lines of [
  [{productId:a,countedQuantity:3},{productId:a,countedQuantity:4}],
  [{productId:a,countedQuantity:3},{productId:b,countedQuantity:-1}],
  [{productId:a,countedQuantity:3},{productId:b,countedQuantity:1.5}],
  [{productId:a,countedQuantity:3},{productId:b,countedQuantity:2147483648}]
 ])expect(()=>normalizeBatchCounts(lines)).toThrow();
 expect(callShop).not.toHaveBeenCalled();
});
it("sends every counted SKU once to the atomic server operation",async()=>{
 vi.mocked(callShop).mockResolvedValue({batchId:c,status:"applied",replayed:false,totalAdjustment:-2});
 await applyBatchStocktake("shop",{batchId:c,lines:[
   {productId:b,countedQuantity:11},{productId:a,countedQuantity:5}]});
 expect(callShop).toHaveBeenCalledWith("apply",{companyId:"shop",batchId:c,
  lines:[{productId:a,countedQuantity:5},{productId:b,countedQuantity:11}]
 },"tallybook_shop_stocktake_batches");
});
it("rejects malformed server histories instead of inferring zero batches",async()=>{
 vi.mocked(callShop).mockResolvedValueOnce({batches:null});
 await expect(listBatchStocktakes("shop")).rejects.toThrow(/unavailable or malformed/);
 expect(()=>validateBatchList([{batchId:c,storeId:a,status:"applied",createdAt:"2026-11-15T00:00:00Z",
   appliedAt:null,lines:[{productId:a,expectedQuantity:4,countedQuantity:null},
    {productId:b,expectedQuantity:5,countedQuantity:null}]}])).toThrow();
});
it("accepts bounded real server line snapshots without synthesizing stock",()=>{
 const result=validateBatchList([{batchId:c,storeId:a,status:"open",createdAt:"2026-11-15T00:00:00Z",
  appliedAt:null,lines:[{productId:a,expectedQuantity:4,countedQuantity:null},
   {productId:b,expectedQuantity:0,countedQuantity:null}]}]);
 expect(result[0].lines.map(l=>l.expectedQuantity)).toEqual([4,0]);
});
