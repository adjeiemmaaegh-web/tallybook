import Dexie from 'dexie';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {TallybookDB,initializeDatabase} from '@/db/TallybookDB';
import {saveBusinessProfile} from '@/features/business/businessProfile';
import {setActiveBusinessProfileId} from '@/features/business/activeCompany';
import {createProduct} from '@/features/inventory/inventory';
import {createSupplier,completePurchase} from '@/features/purchases/purchases';
import {completeSale} from '@/features/sales/sales';
import {executeLatestSaleReversal} from '@/features/assistant/reversals';
import {getFinancialSummary,financialCsv} from './financialIntelligence';
import {createBackup,parseBackup,stringifyBackup} from '@/features/backup/backup';
import {reconstructInventoryCost} from '@/features/inventory/costLedger';

const testDb:TallybookDB[]=[];
function clock(at:string){
 vi.useFakeTimers({toFake:['Date']});
 vi.setSystemTime(new Date(at));
}
async function fixture(stock='2',costPrice='1'){
 clock('2026-01-01T10:00:00.000Z');
 setActiveBusinessProfileId('primary');
 const database=new TallybookDB(`run9-cost-integration-${crypto.randomUUID()}`);
 testDb.push(database);
 await initializeDatabase(database);
 await saveBusinessProfile({name:'Run 9 FIFO Shop',country:'Ghana',
  currency:'GHS',businessType:'Retail shop',phone:'',email:'',address:''},database);
 const product=await createProduct({name:'Rice',categoryId:'uncategorized',
  sellingPrice:'10',costPrice,initialStock:stock,lowStockThreshold:'1'},'GHS',database);
 return{database,product};
}
async function sale(database:TallybookDB,productId:string,quantity:number){
 return completeSale({lines:[{productId,quantity}],discount:'0',
  paymentMethod:'cash',amountPaid:String(quantity*10),
  currency:'GHS',submissionKey:crypto.randomUUID()},database);
}
const report=(database:TallybookDB)=>getFinancialSummary('month',
 new Date(),undefined,undefined,database);
afterEach(async()=>{
 vi.restoreAllMocks();vi.useRealTimers();setActiveBusinessProfileId('primary');
 for(const database of testDb.splice(0)){const name=database.name;database.close();await new Dexie(name).delete();}
});
describe('V19 Run 9 real IndexedDB historical-cost and money reconciliation',()=>{
 it('keeps separate as-of stock assets and period COGS after FIFO sale',async()=>{
  const{database,product}=await fixture();
  clock('2026-01-02T10:00:00.000Z');
  const supplier=await createSupplier({name:'Cost supplier'},database);
  await completePurchase({supplierId:supplier.id,purchaseDate:'2026-01-02',
   lines:[{productId:product.id,quantity:'3',unitCost:'2'}]},'GHS',database);
  clock('2026-01-03T10:00:00.000Z');
  await sale(database,product.id,4);
  const summary=await report(database);
  expect(summary.cogsMinor).toBe(600);
  expect(summary.inventoryValuation).toMatchObject({
   knownValueMinor:200,unknownCostUnits:0,complete:true,totalValueMinor:200
  });
  expect(financialCsv(summary)).toContain('Known historical-cost stock assets');
 });
 it('verifies supplier purchase invoice unit costs before reporting or exporting stock assets',async()=>{
  const{database,product}=await fixture();
  clock('2026-01-02T10:00:00.000Z');
  const supplier=await createSupplier({name:'Audited supplier'},database);
  await completePurchase({supplierId:supplier.id,purchaseDate:'2026-01-02',
   lines:[{productId:product.id,quantity:'2',unitCost:'3'}]},'GHS',database);
  const s=await report(database);
  expect(s.purchaseCostEvidence).toMatchObject({verifiedPurchases:1,legacyUnverifiedPurchases:0});
  expect(s.inventoryValuation).toMatchObject({knownValueMinor:800,complete:true});
 });
 it('rejects supplier cost-event unit-cost tampering without rewriting invoice',async()=>{
  const{database,product}=await fixture();
  clock('2026-01-02T10:00:00.000Z');
  const supplier=await createSupplier({name:'Audited supplier'},database);
  const purchase=await completePurchase({supplierId:supplier.id,purchaseDate:'2026-01-02',
   lines:[{productId:product.id,quantity:'2',unitCost:'3'}]},'GHS',database);
  const event=(await database.inventoryCostEvents.toArray())
   .find(x=>x.purchaseId===purchase.id)!;
  await database.inventoryCostEvents.update(event.id,{unitCostMinor:999});
  await expect(report(database)).rejects.toThrow(/Supplier receipt cost evidence/);
  const snapshot=await createBackup(database);
  expect(()=>parseBackup(stringifyBackup(snapshot))).toThrow(/Supplier receipt cost evidence/);
 });
 it('rejects altered invoice totals even if FIFO cost layers are still unchanged',async()=>{
  const{database,product}=await fixture();
  clock('2026-01-02T10:00:00.000Z');
  const supplier=await createSupplier({name:'Audited supplier'},database);
  const purchase=await completePurchase({supplierId:supplier.id,purchaseDate:'2026-01-02',
   lines:[{productId:product.id,quantity:'2',unitCost:'3'}]},'GHS',database);
  await database.purchases.update(purchase.id,{totalCostMinor:999});
  await expect(report(database)).rejects.toThrow(/Supplier receipt cost evidence/);
 });
 it('rejects foreign purchase-currency evidence rather than converting stock assets silently',async()=>{
  const{database,product}=await fixture();
  clock('2026-01-02T10:00:00.000Z');
  const supplier=await createSupplier({name:'Audited supplier'},database);
  const purchase=await completePurchase({supplierId:supplier.id,purchaseDate:'2026-01-02',
   lines:[{productId:product.id,quantity:'2',unitCost:'3'}]},'GHS',database);
  await database.purchases.update(purchase.id,{currency:'USD'});
  await expect(report(database)).rejects.toThrow(/currency/);
 });
 it('never invents FIFO value for unknown opening receipt cost',async()=>{
  const{database,product}=await fixture('2','');
  const summary=await report(database);
  expect(summary.inventoryValuation).toMatchObject({
   knownValueMinor:0,unknownCostUnits:2,unverifiedProducts:1,complete:false
  });
  expect(summary.inventoryValuation?.totalValueMinor).toBeUndefined();
  expect(product.stockQuantity).toBe(2);
 });
 it('restocking via legitimate full reversal returns original cost layers',async()=>{
  const{database,product}=await fixture();
  clock('2026-01-02T10:00:00.000Z');
  await sale(database,product.id,2);
  clock('2026-01-03T10:00:00.000Z');
  await executeLatestSaleReversal('GHS',database,'run9-full-reversal');
  const summary=await report(database);
  expect(summary.cogsMinor).toBe(0);
  expect(summary.inventoryValuation).toMatchObject({
   knownValueMinor:200,unknownCostUnits:0,complete:true,totalValueMinor:200
  });
 });
 it('rejects full refund money journal if cost restoration evidence disappears',async()=>{
  const{database,product}=await fixture();
  clock('2026-01-02T10:00:00.000Z');
  await sale(database,product.id,2);
  clock('2026-01-03T10:00:00.000Z');
  await executeLatestSaleReversal('GHS',database,'run9-missing-restoration');
  // Delete only disposable fixture's cost record; retained money and stock
  // still need a hard fail, never an inferred zero cost.
  const reversal=(await database.inventoryCostEvents.toArray()).find(e=>e.kind==='reversal');
  expect(reversal).toBeDefined();
  await database.inventoryCostEvents.delete(reversal!.id);
  await expect(report(database)).rejects.toThrow(/cost evidence|restoration/);
  const backup=await createBackup(database);
  expect(()=>parseBackup(stringifyBackup(backup))).toThrow(/cost evidence|restoration/);
 });
 it('rejects tampered full reversal quantity before showing financial results',async()=>{
  const{database,product}=await fixture();
  clock('2026-01-02T10:00:00.000Z');
  await sale(database,product.id,1);
  clock('2026-01-03T10:00:00.000Z');
  await executeLatestSaleReversal('GHS',database,'run9-tamper-restoration');
  const row=(await database.inventoryCostEvents.toArray()).find(x=>x.kind==='reversal')!;
  await database.inventoryCostEvents.update(row.id,{quantityDelta:2});
  await expect(report(database)).rejects.toThrow(/cost evidence|restoration/);
 });
 it('fails closed on historical FIFO evidence whose stock quantity disagrees',async()=>{
  const{database,product}=await fixture('3','1');
  await database.products.update(product.id,{stockQuantity:4});
  await expect(report(database)).rejects.toThrow(/Current stock/);
  const history=await database.inventoryCostEvents.toArray();
  expect(reconstructInventoryCost(history,'primary',product.id).quantity).toBe(3);
 });
 it('keeps completed zero-stock inventory value at zero without replacement cost',async()=>{
  const{database,product}=await fixture('1','1');
  clock('2026-01-02T10:00:00.000Z');
  await sale(database,product.id,1);
  const summary=await report(database);
  expect(summary.inventoryValuation).toMatchObject({
   knownValueMinor:0,unknownCostUnits:0,totalValueMinor:0,complete:true
  });
 });
 it('legacy stock without any cost events is unverified, never editable product-price value',async()=>{
  const{database,product}=await fixture('3','1');
  await database.inventoryCostEvents.where('productId').equals(product.id).delete();
  const summary=await report(database);
  expect(summary.inventoryValuation).toMatchObject({
   knownValueMinor:0,unknownCostUnits:3,unverifiedProducts:1,complete:false
  });
 });
});
