import Dexie from "dexie";
import {afterEach,expect,it,vi} from "vitest";
import {TallybookDB,initializeDatabase} from "@/db/TallybookDB";
import {setActiveBusinessProfileId} from "@/features/business/activeCompany";
import {saveBusinessProfile} from "@/features/business/businessProfile";
import {createStaff,unlockStaff,openShift,lockStaff,previewShiftCash} from "@/features/staff/staff";
import {createProduct} from "@/features/inventory/inventory";
import {addMobileMoneyProvider} from "@/features/payments/mobileMoney";
import {completeSale,getSaleSnapshot} from "./sales";
import {recoverSavedCheckout} from "./recoverSavedCheckout";
import {getEndOfDaySummary} from "@/features/reports/reports";
import {getFinancialSummary} from "@/features/reports/financialIntelligence";
import {auditLocalIntegrity} from "@/features/reliability/integrity";
import {createBackup,parseBackup} from "@/features/backup/backup";
import {validateCentralSaleEvent} from "@/features/sync/centralSaleEvent";

const databases:TallybookDB[]=[];
async function fixture(){
  setActiveBusinessProfileId("primary");lockStaff("primary");
  const database=new TallybookDB("split-tender-"+crypto.randomUUID());databases.push(database);
  await initializeDatabase(database);
  await saveBusinessProfile({name:"Split payment test",country:"Ghana",currency:"GHS",businessType:"Retail"},database);
  const owner=await createStaff("Split owner","owner","123456",database);
  await unlockStaff(owner.id,"123456",database);
  const shift=await openShift(0,database);
  const product=await createProduct({name:"Rice",categoryId:"uncategorized",sellingPrice:"10",
    costPrice:"1",initialStock:"5",lowStockThreshold:"1"},"GHS",database);
  return {database,product,shift};
}
afterEach(async()=>{
  vi.restoreAllMocks();lockStaff("primary");setActiveBusinessProfileId("primary");
  for(const database of databases.splice(0)){database.close();await new Dexie(database.name).delete();}
});
it("atomically saves 2 split tenders, original event evidence, reconciliation and exact retry",async()=>{
  const {database,product,shift}=await fixture();
  const input={lines:[{productId:product.id,quantity:1}],discount:"0",amountPaid:"10",currency:"GHS",
    submissionKey:"split-retry-00000001",paymentMethod:"split" as const,
    splitTenders:[{method:"cash" as const,amount:"4"},{method:"card" as const,amount:"6",reference:"TERM-2026-001"}]};
  const result=await completeSale(input,database);
  expect(result.sale).toMatchObject({paymentMethod:"split",amountPaidMinor:1000,outstandingMinor:0});
  expect(result.payments.map(payment=>[payment.method,payment.amountMinor])).toEqual([["cash",400],["card",600]]);
  const envelope=(await database.centralSaleEvents.toArray())[0];
  validateCentralSaleEvent(envelope);
  expect(envelope.payload.payments).toHaveLength(2);
  const replay=await completeSale(input,database);
  expect(replay.sale.id).toBe(result.sale.id);
  expect(await database.sales.count()).toBe(1);
  expect(await database.payments.count()).toBe(2);
  expect((await database.products.get(product.id))?.stockQuantity).toBe(4);
  await expect(completeSale({...input,splitTenders:[
    {method:"cash",amount:"5"},{method:"card",amount:"5",reference:"TERM-2026-001"}
  ]},database)).rejects.toThrow(/different details/);
  expect(recoverSavedCheckout(await getSaleSnapshot(database),"primary",input.submissionKey)?.sale.id).toBe(result.sale.id);
  expect((await auditLocalIntegrity(database)).issues).toEqual([]);
  expect(await getFinancialSummary("today",new Date(),undefined,undefined,database)).toMatchObject({revenueMinor:1000,collectionsMinor:1000});
  const day=await getEndOfDaySummary(new Date(),database);
  expect(day.methods.find(method=>method.method==="split")?.salesMinor).toBe(1000);
  expect(day.methods.find(method=>method.method==="cash")?.receivedMinor).toBe(400);
  expect(day.methods.find(method=>method.method==="card")?.receivedMinor).toBe(600);
  expect((await previewShiftCash(shift.id,database)).cashSalesMinor).toBe(400);
  const backup=await createBackup(database);
  expect(()=>parseBackup(JSON.stringify(backup))).not.toThrow();
  const altered=structuredClone(backup);
  altered.records.centralSaleEvents[0].payload.payments![1].amountMinor+=1;
  expect(()=>parseBackup(JSON.stringify(altered))).toThrow();
});
it("rejects reused mobile references across split and normal sales and preserves stock",async()=>{
  const {database,product}=await fixture();
  const provider=await addMobileMoneyProvider({name:"MTN MoMo"},database);
  const first={lines:[{productId:product.id,quantity:1}],discount:"0",amountPaid:"10",currency:"GHS",
    paymentMethod:"split" as const,submissionKey:"split-mobile-000001",
    splitTenders:[{method:"cash" as const,amount:"1"},
      {method:"mobile" as const,amount:"9",providerId:provider.id,reference:"REF-2026-123"}]};
  await completeSale(first,database);
  await expect(completeSale({...first,submissionKey:"split-mobile-000002"},database)).rejects.toThrow(/already recorded/);
  await expect(completeSale({lines:[{productId:product.id,quantity:1}],discount:"0",amountPaid:"10",
    currency:"GHS",paymentMethod:"mobile",mobileMoneyProviderId:provider.id,
    mobileMoneyReference:"REF-2026-123",submissionKey:"normal-mobile-000002"},database)).rejects.toThrow(/already recorded/);
  expect(await database.sales.count()).toBe(1);
  expect((await database.products.get(product.id))?.stockQuantity).toBe(4);
});
it("rolls back every split tender, inventory adjustment and central event if a payment write fails",async()=>{
 const {database,product}=await fixture();
 vi.spyOn(database.payments,"bulkAdd").mockRejectedValueOnce(new Error("disk full"));
 await expect(completeSale({lines:[{productId:product.id,quantity:1}],discount:"0",amountPaid:"10",
  currency:"GHS",paymentMethod:"split",submissionKey:"split-rollback-001",
  splitTenders:[{method:"cash",amount:"5"},{method:"card",amount:"5",reference:"POS-SIM-777"}]},database)).rejects.toThrow(/disk full/);
 expect(await database.sales.count()).toBe(0);
 expect(await database.payments.count()).toBe(0);
 expect(await database.centralSaleEvents.count()).toBe(0);
 expect((await database.products.get(product.id))?.stockQuantity).toBe(5);
});
