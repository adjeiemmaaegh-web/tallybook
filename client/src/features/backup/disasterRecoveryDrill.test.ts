import Dexie from "dexie";
import {afterEach,expect,it} from "vitest";
import {TallybookDB,initializeDatabase} from "@/db/TallybookDB";
import {setActiveBusinessProfileId} from "@/features/business/activeCompany";
import {saveBusinessProfile} from "@/features/business/businessProfile";
import {createStaff,unlockStaff,lockStaff} from "@/features/staff/staff";
import {createProduct} from "@/features/inventory/inventory";
import {rehearseDisasterRecovery} from "./disasterRecoveryDrill";

const all:TallybookDB[]=[];
afterEach(async()=>{
 lockStaff("primary");setActiveBusinessProfileId("primary");
 for(const database of all.splice(0)){database.close();await new Dexie(database.name).delete();}
});
it("performs non-destructive backup parser rehearsal without inventing evidence of a downloaded file",async()=>{
 setActiveBusinessProfileId("primary");
 const database=new TallybookDB("disaster-rehearsal-"+crypto.randomUUID());all.push(database);
 await initializeDatabase(database);
 await saveBusinessProfile({name:"Recovery shop",country:"Ghana",currency:"GHS",businessType:"Retail"},database);
 const owner=await createStaff("Owner","owner","123456",database);await unlockStaff(owner.id,"123456",database);
 const item=await createProduct({name:"Rice",categoryId:"uncategorized",sellingPrice:"5",costPrice:"2",initialStock:"3",lowStockThreshold:"1"},"GHS",database);
 const before=await database.products.get(item.id);
 const result=await rehearseDisasterRecovery(database);
 expect(result).toMatchObject({companyId:"primary",roundTripValidated:true,externalFileRequired:true,
  snapshotCounts:{products:1,sales:0,payments:0,receipts:0}});
 expect(result.verifiedExternalFile).toBeNull();
 expect(result.warning).toMatch(/in-memory/);
 expect(await database.products.get(item.id)).toEqual(before);
 expect(await database.sales.count()).toBe(0);
});
it("never runs an in-memory drill over a pending interrupted restore",async()=>{
 setActiveBusinessProfileId("primary");
 const database=new TallybookDB("disaster-rehearsal-"+crypto.randomUUID());all.push(database);
 await initializeDatabase(database);
 await database.appMeta.put({key:"restoreRecoveryJournal",value:"unrecovered",updatedAt:new Date().toISOString()});
 await expect(rehearseDisasterRecovery(database)).rejects.toThrow(/interrupted restore/);
});
