import {callShop} from "./shopClient";

/** A batch and its line counts are posted atomically by the server. */
export interface BatchStocktakeLine {
  productId: string;
  expectedQuantity: number;
  countedQuantity: number|null;
}
export interface BatchStocktake {
  batchId: string;
  storeId: string;
  status: "open"|"applied"|"cancelled";
  createdAt: string;
  appliedAt: string|null;
  lines: BatchStocktakeLine[];
}
export interface BatchReceipt {batchId:string;status:string;replayed:boolean;totalAdjustment?:number}
export interface BatchInputLine {productId:string;countedQuantity:number}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LIMIT=2147483647;
export function validBatchId(value:unknown):value is string {
  return typeof value==="string"&&UUID.test(value);
}
export function normalizeBatchProducts(input:readonly string[]):string[] {
  if(!Array.isArray(input)||input.length<2||input.length>50)throw Error("Select 2–50 tracked products.");
  if(input.some(value=>!validBatchId(value)))throw Error("Invalid product identifier.");
  const sorted=input.map(value=>value.toLowerCase()).sort();
  if(new Set(sorted).size!==sorted.length)throw Error("A product was selected twice.");
  return sorted;
}
export function normalizeBatchCounts(input:readonly BatchInputLine[]):BatchInputLine[] {
  if(!Array.isArray(input)||input.length<2||input.length>50)throw Error("Count every product in the batch.");
  const sorted=input.map(row=>({...row,productId:typeof row?.productId==="string"?row.productId.toLowerCase():row?.productId})).sort((a,b)=>String(a?.productId).localeCompare(String(b?.productId)));
  const seen=new Set<string>();
  for(const row of sorted){
    if(!row||!validBatchId(row.productId)||!Number.isInteger(row.countedQuantity)||
      row.countedQuantity<0||row.countedQuantity>LIMIT||seen.has(row.productId))
      throw Error("Every counted product requires one valid whole number.");
    seen.add(row.productId);
  }
  return sorted;
}
export function validateBatchList(value:unknown):BatchStocktake[] {
  if(!Array.isArray(value)||value.length>30)throw Error("Batch history is unavailable or malformed.");
  const batches:BatchStocktake[]=[];
  const seen=new Set<string>();
  for(const candidate of value) {
    const b=candidate as BatchStocktake;
    if(!b||!validBatchId(b.batchId)||!validBatchId(b.storeId)||
      !["open","applied","cancelled"].includes(b.status)||typeof b.createdAt!=="string"||
      (b.appliedAt!==null&&typeof b.appliedAt!=="string")||
      !Array.isArray(b.lines)||b.lines.length<2||b.lines.length>50||
      seen.has(b.batchId))throw Error("Batch history is unavailable or malformed.");
    seen.add(b.batchId);
    const products=new Set<string>();
    for(const l of b.lines){
      if(!l||!validBatchId(l.productId)||!Number.isInteger(l.expectedQuantity)||
        l.expectedQuantity<0||l.expectedQuantity>LIMIT||
        (l.countedQuantity!==null&&(!Number.isInteger(l.countedQuantity)||
          l.countedQuantity<0||l.countedQuantity>LIMIT))||
        products.has(l.productId)||
        (b.status==="applied")!==(l.countedQuantity!==null))
        throw Error("Batch history is unavailable or malformed.");
      products.add(l.productId);
    }
    batches.push(b);
  }
  return batches;
}
export async function listBatchStocktakes(companyId:string):Promise<BatchStocktake[]> {
  const result=await callShop<{batches:unknown}>("list",{companyId},"tallybook_shop_stocktake_batches");
  return validateBatchList(result?.batches);
}
export function startBatchStocktake(companyId:string,input:{batchId:string;storeId:string;productIds:string[]}):Promise<BatchReceipt> {
  if(!validBatchId(input.batchId)||!validBatchId(input.storeId))throw Error("Invalid batch or store.");
  return callShop<BatchReceipt>("start",{companyId,...input,productIds:normalizeBatchProducts(input.productIds)},"tallybook_shop_stocktake_batches");
}
export function applyBatchStocktake(companyId:string,input:{batchId:string;lines:BatchInputLine[]}):Promise<BatchReceipt> {
  if(!validBatchId(input.batchId))throw Error("Invalid batch.");
  return callShop<BatchReceipt>("apply",{companyId,batchId:input.batchId,lines:normalizeBatchCounts(input.lines)},"tallybook_shop_stocktake_batches");
}
export function cancelBatchStocktake(companyId:string,batchId:string):Promise<BatchReceipt> {
  if(!validBatchId(batchId))throw Error("Invalid batch.");
  return callShop<BatchReceipt>("cancel",{companyId,batchId},"tallybook_shop_stocktake_batches");
}
