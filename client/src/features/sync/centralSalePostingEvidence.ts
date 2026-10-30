import type {TallybookDB} from '@/db/TallybookDB';
import type {Sale,SaleLine,CustomerActivity} from '@/features/sales/sales';
import type {InventoryMovement} from '@/features/inventory/inventory';
import type {InventoryCostEvent} from '@/features/inventory/costLedger';
import type {InventoryBatch} from '@/features/inventory/stage2Inventory';
import type {StoreStockEntry} from '@/features/stores/storeStockLedger';
import type {CustomerBenefitEntry} from '@/features/customers/customerBenefits';

/** Original posting records, not a replay authorization. Prior receipt/cost,
 * product/customer, store and commerce history still has to reconcile. */
export interface SalePostingEvidence {
 version:1;
 storeAccountingActive:boolean;
 stockMovements:InventoryMovement[];
 costIssues:InventoryCostEvent[];
 storeEntries:StoreStockEntry[];
 batchAfter:InventoryBatch[];
 customerActivity:CustomerActivity|null;
 benefits:CustomerBenefitEntry[];
}
export async function captureSalePostingEvidence(database:TallybookDB,sale:Sale,lines:SaleLine[],
 stockMovements:InventoryMovement[],batchAfter:InventoryBatch[],customerActivity:CustomerActivity|undefined):Promise<SalePostingEvidence>{
 const [costIssues,storeEntries,benefits,storeMode]=await Promise.all([
  database.inventoryCostEvents.where('saleId').equals(sale.id).toArray(),
  stockMovements.length?database.storeStockEntries.where('sourceId').anyOf(stockMovements.map(m=>m.id)).toArray():Promise.resolve([]),
  database.customerBenefits.where('[businessProfileId+submissionKey]').anyOf(
   ['sale-redeemed-','sale-wallet-','sale-points-'].map(prefix=>[sale.businessProfileId,prefix+sale.id])).toArray(),
  database.storeStockModes.get(sale.businessProfileId)
 ]);
 const evidence:SalePostingEvidence={version:1,storeAccountingActive:!!storeMode,stockMovements,costIssues,storeEntries,batchAfter,
  customerActivity:customerActivity??null,benefits};
 validateSalePostingEvidence(sale,lines,evidence);
 return evidence;
}
export function validateSalePostingEvidence(sale:Sale,lines:SaleLine[],e:SalePostingEvidence){
 const deny=()=>{throw Error('Sale posting evidence does not reconcile with checkout.');};
 if(!e||e.version!==1||typeof e.storeAccountingActive!=='boolean'||
   ![e.stockMovements,e.costIssues,e.storeEntries,e.batchAfter,e.benefits].every(Array.isArray))deny();
 for(const rows of [e.stockMovements,e.costIssues,e.storeEntries,e.batchAfter,e.benefits]){
  const ids=new Set<string>();
  for(const row of rows){if(!row.id||ids.has(row.id)||row.businessProfileId!==sale.businessProfileId)deny();ids.add(row.id);}
 }
 const tracked=lines.filter(l=>l.stockTracked===true);
 if(lines.some(l=>typeof l.stockTracked!=='boolean')||
    e.storeEntries.length!==(e.storeAccountingActive?tracked.length:0))deny();
 if(e.stockMovements.length!==tracked.length||e.costIssues.length!==tracked.length)deny();
 for(const line of tracked){
  const movement=e.stockMovements.find(m=>m.productId===line.productId);
  const cost=e.costIssues.find(c=>c.id===line.costEventId);
  if(!movement||!cost||movement.movementType!=='sale'||movement.createdAt!==sale.createdAt||
   movement.quantityDelta!==-line.quantity||!Number.isSafeInteger(movement.previousQuantity)||
   !Number.isSafeInteger(movement.resultingQuantity)||movement.resultingQuantity<0||
   movement.previousQuantity+movement.quantityDelta!==movement.resultingQuantity||
   cost.kind!=='issue'||cost.productId!==line.productId||cost.saleId!==sale.id||cost.saleLineId!==line.id||
   cost.sourceId!==movement.id||cost.quantityDelta!==-line.quantity||cost.createdAt!==sale.createdAt)deny();
  if(!Array.isArray(cost!.allocations))deny();
  let units=0,value=0,known=true;
  const receipts=new Set<string>();
  for(const a of cost!.allocations){
   if(!a.receiptId||receipts.has(a.receiptId)||!Number.isSafeInteger(a.quantity)||a.quantity<=0)deny();
   receipts.add(a.receiptId);units+=a.quantity;
   if(a.unitCostMinor===undefined)known=false;
   else {if(!Number.isSafeInteger(a.unitCostMinor)||a.unitCostMinor<0)deny();value+=a.quantity*a.unitCostMinor;}
   if(!Number.isSafeInteger(units)||!Number.isSafeInteger(value))deny();
  }
  if(units!==line.quantity||(known&&(line.costStatus!=='verified'||line.cogsMinor!==value))||
    (!known&&(line.costStatus!=='unavailable'||line.cogsMinor!==undefined)))deny();
 }
 for(const entry of e.storeEntries){
  const movement=e.stockMovements.find(m=>m.id===entry.sourceId);
  if(!movement||entry.kind!=='sale'||entry.productId!==movement.productId||entry.storeId!==sale.storeId||
    entry.quantityDelta!==movement.quantityDelta||entry.createdAt!==sale.createdAt)deny();
 }
 for(const batch of e.batchAfter){
  if(!Number.isSafeInteger(batch.quantity)||batch.quantity<0||
    !lines.some(l=>l.productId===batch.productId&&l.batchAllocations?.some(a=>a.batchId===batch.id)))deny();
 }
 const allocatedBatches=new Set(lines.flatMap(l=>(l.batchAllocations??[]).map(a=>a.batchId)));
 if(allocatedBatches.size!==e.batchAfter.length||e.batchAfter.some(b=>!allocatedBatches.has(b.id)))deny();
 const activity=e.customerActivity;
 if(sale.customerId){
  if(!activity||activity.saleId!==sale.id||activity.customerId!==sale.customerId||
   activity.businessProfileId!==sale.businessProfileId||activity.totalMinor!==sale.totalMinor||
   activity.amountPaidMinor!==sale.amountPaidMinor||activity.outstandingMinor!==sale.outstandingMinor)deny();
 }else if(activity!==null)deny();
 const submissions=new Set<string>();
 for(const benefit of e.benefits){
  if(!sale.customerId||benefit.customerId!==sale.customerId||!Number.isSafeInteger(benefit.delta)||
   submissions.has(benefit.submissionKey)||
   !['sale-redeemed-','sale-wallet-','sale-points-'].some(prefix=>benefit.submissionKey===prefix+sale.id))deny();
  submissions.add(benefit.submissionKey);
 }
 const wallet=e.benefits.find(b=>b.submissionKey==='sale-wallet-'+sale.id);
 if((sale.walletAppliedMinor??0)>0){if(!wallet||wallet.kind!=='wallet'||wallet.delta!==-sale.walletAppliedMinor!)deny();}
 else if(wallet)deny();
 const redeemed=e.benefits.find(b=>b.submissionKey==='sale-redeemed-'+sale.id);
 if((sale.loyaltyRedeemedPoints??0)>0){if(!redeemed||redeemed.kind!=='points'||redeemed.delta!==-sale.loyaltyRedeemedPoints!)deny();}
 else if(redeemed)deny();
}
