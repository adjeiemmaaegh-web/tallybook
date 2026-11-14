import {beforeEach,expect,it,vi} from "vitest";
import {normaliseVariantDraft,listShopVariants,saveShopVariant} from "./shopVariants";
import {callShop} from "./shopClient";
vi.mock("./shopClient",()=>({callShop:vi.fn()}));
const sku="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
beforeEach(()=>{vi.clearAllMocks();});
it("validates family, options and sellable SKU before sending any request",async()=>{
 for(const item of [
  {productId:"bad",variantFamily:"Cotton",variantSize:"M",variantColor:"Blue"},
  {productId:sku,variantFamily:"Cotton",variantSize:null,variantColor:null},
  {productId:sku,variantFamily:"",variantSize:"XL",variantColor:null},
  {productId:sku,variantFamily:"Cotton",variantSize:"1".repeat(41),variantColor:null},
  {productId:sku,variantFamily:"Line\nBreak",variantSize:"M",variantColor:null}
 ]){
  expect(()=>normaliseVariantDraft(item)).toThrow();
  await expect(saveShopVariant("biz",item)).rejects.toThrow();
 }
 expect(callShop).not.toHaveBeenCalled();
});
it("normalizes safe metadata and preserves distinct SKU identity",async()=>{
 const input=normaliseVariantDraft({productId:sku,variantFamily:" Cotton T-shirt ",
   variantSize:" M ",variantColor:" Blue "});
 expect(input).toEqual({productId:sku,variantFamily:"Cotton T-shirt",variantSize:"M",variantColor:"Blue"});
 vi.mocked(callShop).mockResolvedValueOnce({...input,changed:true});
 const result=await saveShopVariant("biz",input);
 expect(result.productId).toBe(sku);
 expect(callShop).toHaveBeenCalledWith("set",{companyId:"biz",...input},"tallybook_shop_variants");
});
it("accepts an explicit ungroup without altering the SKU",async()=>{
 const cleared={productId:sku,variantFamily:"",variantSize:null,variantColor:null};
 vi.mocked(callShop).mockResolvedValueOnce({productId:sku,variantFamily:null,variantSize:null,variantColor:null,changed:true});
 await expect(saveShopVariant("biz",cleared)).resolves.toMatchObject({productId:sku,variantFamily:null});
});
it("fails closed on mismatching server receipt or malformed variant list",async()=>{
 vi.mocked(callShop).mockResolvedValueOnce({productId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",variantFamily:"Family",variantSize:"S",variantColor:null});
 await expect(saveShopVariant("biz",{productId:sku,variantFamily:"Family",variantSize:"S",variantColor:null})).rejects.toThrow(/not confirmed/);
 vi.mocked(callShop).mockResolvedValueOnce({variants:null});
 await expect(listShopVariants("biz")).rejects.toThrow(/unavailable/);
 vi.mocked(callShop).mockResolvedValueOnce({variants:[{productId:sku,variantFamily:"",variantSize:null,variantColor:null}]});
 await expect(listShopVariants("biz")).rejects.toThrow(/malformed/);
 vi.mocked(callShop).mockResolvedValueOnce({variants:[
  {productId:sku,variantFamily:"Cotton",variantSize:"M",variantColor:"Blue"},
  {productId:sku,variantFamily:"Cotton",variantSize:"L",variantColor:"Blue"}]});
 await expect(listShopVariants("biz")).rejects.toThrow(/malformed/);
 vi.mocked(callShop).mockResolvedValueOnce({variants:[{
  productId:sku,variantFamily:"Cotton",variantSize:"M",variantColor:"Red\nAlert"}]});
 await expect(listShopVariants("biz")).rejects.toThrow(/malformed/);
});
