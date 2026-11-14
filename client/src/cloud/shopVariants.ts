/** A distinct sellable product ID is a distinct SKU with its own server price and
 * per-store stock. Variants only GROUP existing stock-controlled SKUs.
 */
import {callShop} from "./shopClient";
export interface ShopVariant {
 productId:string;variantFamily:string|null;variantSize:string|null;variantColor:string|null;
}
export interface ShopVariantInput {productId:string;variantFamily:string;variantSize:string|null;variantColor:string|null;}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function normaliseVariantDraft(input:ShopVariantInput):ShopVariantInput{
 if(!UUID.test(input.productId))throw Error("Select a valid product.");
 const variantFamily=input.variantFamily.trim();
 const variantSize=input.variantSize?.trim()||null;
 const variantColor=input.variantColor?.trim()||null;
 const valid=(t:string,max:number)=>t.length>0&&t.length<=max&&!/[\x00-\x1F\x7F]/.test(t);
 if(variantFamily
    ? !valid(variantFamily,80)||(!variantSize&&!variantColor)||
      (variantSize!==null&&!valid(variantSize,40))||
      (variantColor!==null&&!valid(variantColor,40))
    : variantSize!==null||variantColor!==null)
  throw Error("Enter a family and at least one size/colour, or clear all three.");
 return {productId:input.productId,variantFamily,variantSize,variantColor};
}
export async function listShopVariants(companyId:string):Promise<ShopVariant[]>{
 const data=await callShop<{variants:ShopVariant[]}>("list",{companyId},"tallybook_shop_variants");
 if(!Array.isArray(data.variants)||data.variants.length>5000)
   throw Error("Variant list is unavailable or exceeds its safe limit.");
 const seen=new Set<string>();
 for(const v of data.variants){
  if(!v||typeof v!=="object"||typeof v.variantFamily!=="string"||
     (v.variantSize!==null&&typeof v.variantSize!=="string")||
     (v.variantColor!==null&&typeof v.variantColor!=="string"))
    throw Error("Variant list is malformed. Do not change grouped stock.");
  try {
    const validated=normaliseVariantDraft({...v,variantFamily:v.variantFamily});
    if(!validated.variantFamily||validated.variantFamily!==v.variantFamily||
       validated.variantSize!==v.variantSize||validated.variantColor!==v.variantColor||
       seen.has(v.productId))
      throw Error("invalid");
  } catch {
    throw Error("Variant list is malformed. Do not change grouped stock.");
  }
  seen.add(v.productId);
 }
 return data.variants;
}
export async function saveShopVariant(companyId:string,draft:ShopVariantInput):Promise<ShopVariant>{
 const input=normaliseVariantDraft(draft);
 const data=await callShop<ShopVariant &{changed:boolean}>("set",{companyId,...input},"tallybook_shop_variants");
 if(data.productId!==input.productId||data.variantFamily!==(input.variantFamily||null)||
    data.variantSize!==input.variantSize||data.variantColor!==input.variantColor)
   throw Error("Variant change not confirmed. Refresh and reconcile this SKU.");
 return data;
}
