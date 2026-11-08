import Dexie from "dexie";
import {afterEach,expect,it} from "vitest";
import {TallybookDB,initializeDatabase} from "@/db/TallybookDB";
import {setActiveBusinessProfileId} from "@/features/business/activeCompany";
import {saveBusinessProfile} from "@/features/business/businessProfile";
import {createStaff,unlockStaff,lockStaff,openShift} from "@/features/staff/staff";
import {createProduct} from "@/features/inventory/inventory";
import {completeSale,getSaleSnapshot} from "@/features/sales/sales";
import {recoverSavedCheckout} from "@/features/sales/recoverSavedCheckout";
import {createBackup,parseBackup,stringifyBackup} from "@/features/backup/backup";
import {setProductPromotion} from "./promotions";
import {promotionPriceReviewKey} from "./promotionRules.mjs";
const databases:TallybookDB[]=[];
afterEach(async()=>{lockStaff("primary");setActiveBusinessProfileId("primary");
 for(const database of databases.splice(0)){database.close();await new Dexie(database.name).delete();}
});
it("owner discount is frozen in checkout unit pricing, verified in backup and cannot be rewritten",async()=>{
 setActiveBusinessProfileId("primary");lockStaff("primary");
 const database=new TallybookDB("promo-checkout-"+crypto.randomUUID());databases.push(database);
 await initializeDatabase(database);
 await saveBusinessProfile({name:"Accra outlet",country:"Ghana",currency:"GHS",businessType:"Retail"},database);
 const owner=await createStaff("Owner","owner","123456",database);
 await unlockStaff(owner.id,"123456",database);await openShift(0,database);
 const product=await createProduct({name:"Rice",categoryId:"uncategorized",
  sellingPrice:"10",costPrice:"5",initialStock:"5",lowStockThreshold:"1"},"GHS",database);
 const window={startsAt:"2026-01-01T00:00:00.000Z",endsAt:"2099-12-31T23:59:59.999Z"};
 const promo=await setProductPromotion(product.id,{enabled:true,discountBps:2000,reason:"Owner's seasonal offer",...window},database);
 expect(promo.revision).toBe(1);
 const key=promotionPriceReviewKey([{productId:product.id,quantity:1,unitPriceMinor:800,revision:1}]);
 const input={lines:[{productId:product.id,quantity:1}],discount:"0",paymentMethod:"cash" as const,
  amountPaid:"8",currency:"GHS",priceReviewKey:key,submissionKey:"promotion-sale-0001"};
 const first=await completeSale(input,database);
 expect(first.sale).toMatchObject({subtotalMinor:800,totalMinor:800,amountPaidMinor:800,priceReviewKeyAtSale:key});
 expect(first.lines[0]).toMatchObject({unitPriceMinor:800,regularUnitPriceMinorAtSale:1000,
  promotionSavingsPerUnitMinor:200,promotionRevisionAtSale:1});
 expect(recoverSavedCheckout(await getSaleSnapshot(database),"primary",input.submissionKey)?.sale.id).toBe(first.sale.id);
 const backup=await createBackup(database);
 expect(()=>parseBackup(stringifyBackup(backup))).not.toThrow();
 const tampered=structuredClone(backup);
 tampered.records.saleLines[0].promotionSavingsPerUnitMinor=199;
 expect(()=>parseBackup(stringifyBackup(tampered))).toThrow(/payload differs/);
 // Matching copies must still fail the independent promotion arithmetic check.
 tampered.records.centralSaleEvents[0].payload.lines[0].promotionSavingsPerUnitMinor=199;
 expect(()=>parseBackup(stringifyBackup(tampered))).toThrow(/promotion/i);
 const replay=await completeSale(input,database);
 expect(replay.sale.id).toBe(first.sale.id);
 expect(await database.sales.count()).toBe(1);
 const disabled=await setProductPromotion(product.id,{enabled:false,discountBps:0,reason:"Owner ended discount",...window},database);
 expect(disabled.revision).toBe(2);
 const noPromoKey=promotionPriceReviewKey([{productId:product.id,quantity:1,unitPriceMinor:1000,revision:2}]);
 const second=await completeSale({...input,submissionKey:"promotion-sale-0002",amountPaid:"10",priceReviewKey:noPromoKey},database);
 expect(second.lines[0]).toMatchObject({unitPriceMinor:1000,promotionRevisionAtSale:2});
 expect(second.lines[0].promotionSavingsPerUnitMinor).toBeUndefined();
 expect(recoverSavedCheckout(await getSaleSnapshot(database),"primary","promotion-sale-0002")?.sale.id).toBe(second.sale.id);
 const secondBackup=await createBackup(database);
 expect(()=>parseBackup(stringifyBackup(secondBackup))).not.toThrow();
 const cashier=await createStaff("Cashier","cashier","234567",database);
 lockStaff("primary");await unlockStaff(cashier.id,"234567",database);
 await expect(setProductPromotion(product.id,{enabled:true,discountBps:1000,reason:"Denied cashier",...window},database)).rejects.toThrow();
 expect((await database.products.get(product.id))?.promotionHistory).toHaveLength(2);
});
