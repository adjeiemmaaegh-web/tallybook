/** Developer-engineering regression cases. Requires the pinned client Vitest
 * + fake IndexedDB environment; not executed in this source-only edit.
 */
import Dexie from "dexie";
import {webcrypto} from "node:crypto";
import {afterEach,describe,expect,it} from "vitest";
import {TallybookDB,initializeDatabase} from "@/db/TallybookDB";
import {setActiveBusinessProfileId} from "@/features/business/activeCompany";
import {saveBusinessProfile} from "@/features/business/businessProfile";
import {createStaff,unlockStaff,lockStaff} from "@/features/staff/staff";
import {auditRun20CrossRunLinks} from "./run20CrossRunAudit";

if(!globalThis.crypto?.subtle)Object.defineProperty(globalThis,"crypto",{configurable:true,value:webcrypto});
let serial=0;
const opened:TallybookDB[]=[];
async function ready(){
 setActiveBusinessProfileId("primary");
 const database=new TallybookDB("run20-cross-run-"+Date.now()+"-"+(++serial));
 opened.push(database);
 await initializeDatabase(database);
 await saveBusinessProfile({name:"Disposable Audit Shop",country:"Ghana",
  currency:"GHS",businessType:"Retail shop",phone:"",email:"",address:""},database);
 const owner=await createStaff("Review Owner","owner","123456",database);
 await unlockStaff(owner.id,"123456",database);
 return database;
}
afterEach(async()=>{
 lockStaff("primary");
 for(const database of opened.splice(0)){
  const name=database.name;database.close();await new Dexie(name).delete();
 }
 setActiveBusinessProfileId("primary");
});
describe("Run 20 newer-table local source audit (not physical acceptance)",()=>{
 it("reports four explicitly separate structural checks without touching saved records",async()=>{
  const database=await ready();
  const before=await database.appMeta.count();
  const result=await auditRun20CrossRunLinks(database);
  expect(result.companyId).toBe("primary");
  expect(result.checks.map(x=>x.code)).toEqual([
   "run13-store","run16-commerce","run17-advisory","commerce-sale-links"
  ]);
  expect(result.status).toBe("clear");
  expect(result.financialAcceptanceVerified).toBe(false);
  expect(result.physicalInventoryVerified).toBe(false);
  expect(result.independentAcceptance).toBe(false);
  expect(await database.appMeta.count()).toBe(before);
 });
 it("finds orphan local order to POS reference without deleting or fabricating a sale",async()=>{
  const database=await ready();
  const now="2026-10-17T10:00:00.000Z";
  await database.commerceOrders.add({
   id:"run20-orphan-order",businessProfileId:"primary",
   createdAt:now,updatedAt:now,status:"draft",customerName:"Disposable Customer",
   lines:[{productId:"sample-product-missing",name:"Sample",quantity:1,unitPriceMinor:100}],
   totalMinor:100,saleId:"missing-original-sale"
  });
  const result=await auditRun20CrossRunLinks(database);
  expect(result.status).toBe("attention");
  expect(result.checks.find(x=>x.code==="commerce-sale-links")?.status).toBe("attention");
  expect(result.independentAcceptance).toBe(false);
  expect(await database.sales.count()).toBe(0);
  expect(await database.commerceOrders.count()).toBe(1);
 });
 it("refuses to inspect another company after the owner session is locked",async()=>{
  const database=await ready();
  lockStaff("primary");
  await expect(auditRun20CrossRunLinks(database)).rejects.toThrow();
 });
});
