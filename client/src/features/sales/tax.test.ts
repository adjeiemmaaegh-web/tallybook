import { auditLocalIntegrity } from "@/features/reliability/integrity";
import Dexie from "dexie";
import { afterEach, expect, it, vi } from "vitest";
import { calculateTax, calculateSaleTax, taxReviewKeyForSale, taxPolicyKey, validateTaxSnapshot, type TaxPolicy } from "./tax";
import { TallybookDB, initializeDatabase } from "@/db/TallybookDB";
import { saveBusinessProfile } from "@/features/business/businessProfile";
import {updateCompanyReturnPolicy} from '@/features/business/returnPolicySettings';
import { setActiveBusinessProfileId } from "@/features/business/activeCompany";
import { createProduct, updateProduct } from "@/features/inventory/inventory";
import { completeSale, getSaleSnapshot } from "./sales";
import { recoverSavedCheckout } from "./recoverSavedCheckout";
import { createBackup, parseBackup, restoreBackup } from "@/features/backup/backup";
import { getFinancialSummary } from "@/features/reports/financialIntelligence";
import { executeLatestSaleReversal } from "@/features/assistant/reversals";
import { createStaff, unlockStaff, openShift, lockStaff } from "@/features/staff/staff";
import { formatReceiptShareText, resolveReceiptDetail } from "@/features/receipts/receiptDetail";

const policy: TaxPolicy = { enabled: true, registrationStatus: "registered", registrationNumber: "TEST-ONLY", label: "Example tax", rateBasisPoints: 1250, priceMode: "exclusive" };
const profile = {name:"Tax shop", country:"Ghana", currency:"GHS", businessType:"Retail"};
const databases: TallybookDB[] = [];
async function fixture(taxPolicy?: TaxPolicy) {
  setActiveBusinessProfileId("primary");lockStaff("primary");
  const db = new TallybookDB(`tax-${crypto.randomUUID()}`);databases.push(db);await initializeDatabase(db);
  await saveBusinessProfile({...profile, taxPolicy},db);
  const owner=await createStaff("Tax test owner","owner","123456",db);
  await unlockStaff(owner.id,"123456",db);
  await openShift(0,db);
  // Explicit Run 11 company opt-in is required for the existing positive
  // tax/full-reversal regression. This is test-only, not a product default.
  await updateCompanyReturnPolicy({enabled:true,allowFullReversal:true,
    allowCashPartial:false,maxAgeDays:30},'Tax reversal regression opt-in',db);
  const product=await createProduct({name:"Rice",categoryId:"uncategorized",sellingPrice:"10",costPrice:"1",initialStock:"3",lowStockThreshold:"1"},"GHS",db);
  const input={lines:[{productId:product.id,quantity:1}],discount:"2",amountPaid:"9",paymentMethod:"cash" as const,currency:"GHS",submissionKey:"tax-checkout-01",taxReviewKey:taxPolicyKey(taxPolicy)};
  return {db,product,input};
}
afterEach(async()=>{vi.restoreAllMocks();lockStaff("primary");setActiveBusinessProfileId("primary");for(const db of databases.splice(0)){db.close();await new Dexie(db.name).delete();}});

it("keeps tax off by default and calculates exact invoice half-up inclusive/exclusive amounts",()=>{
  expect(calculateTax(999)).toBeUndefined();
  expect(calculateTax(999,{...policy,enabled:false})).toBeUndefined();
  expect(calculateTax(800,policy)).toMatchObject({taxableMinor:800,taxMinor:100,totalMinor:900});
  expect(calculateTax(900,{...policy,priceMode:"inclusive"})).toMatchObject({taxableMinor:800,taxMinor:100,totalMinor:900});
  expect(calculateTax(4,policy)?.taxMinor).toBe(1);
  expect(()=>calculateTax(Number.MAX_SAFE_INTEGER,policy)).toThrow(/safe money/);
  expect(()=>calculateTax(100,{...policy,registrationStatus:"unknown"})).toThrow(/registered status/);
});
it("records discounted tax, receipt, recovery and net-of-tax cost reporting together",async()=>{
  const {db,input}=await fixture(policy);const saved=await completeSale(input,db);
  expect(saved.sale).toMatchObject({subtotalMinor:1000,discountMinor:200,totalMinor:900,outstandingMinor:0,tax:{taxMinor:100,taxableMinor:800}});
  expect((await auditLocalIntegrity(db)).issues).toEqual([]);
  const snapshot=await getSaleSnapshot(db);
  expect(recoverSavedCheckout(snapshot,"primary",input.submissionKey)?.sale.id).toBe(saved.sale.id);
  const detail=resolveReceiptDetail({receiptId:saved.receipt.id,snapshot,profile,customers:[]})!;
  expect(formatReceiptShareText(detail)).toContain("Example tax (12.5%, exclusive)");
  expect(await getFinancialSummary("today",new Date(),undefined,undefined,db)).toMatchObject({recordedTaxMinor:100,salesExcludingRecordedTaxMinor:800,cogsMinor:100,salesLessCostMinor:700});
});
it("preserves the original tax snapshot on retries after a policy change and reverses it exactly",async()=>{
  const {db,input}=await fixture(policy);const first=await completeSale(input,db);
  await saveBusinessProfile({...profile,taxPolicy:{...policy,rateBasisPoints:2000}},db);
  expect((await completeSale(input,db)).sale.tax).toEqual(first.sale.tax);
  await executeLatestSaleReversal("GHS",db,"tax-reversal");
  expect(await getFinancialSummary("today",new Date(),undefined,undefined,db)).toMatchObject({recordedTaxMinor:0,salesExcludingRecordedTaxMinor:0,salesLessCostMinor:0});
});
it("rejects stale or missing tax review without a sale or stock write",async()=>{
  const {db,product,input}=await fixture(policy);
  for(const taxReviewKey of [undefined,"off"]) await expect(completeSale({...input,taxReviewKey},db)).rejects.toThrow(/review/);
  expect(await db.sales.count()).toBe(0);expect((await db.products.get(product.id))?.stockQuantity).toBe(3);
});
it("rolls back a taxed checkout after a receipt storage failure",async()=>{
  const {db,product,input}=await fixture(policy);
  vi.spyOn(db.receipts,"add").mockRejectedValueOnce(new Error("disk full"));
  await expect(completeSale(input,db)).rejects.toThrow("disk full");
  expect(await db.sales.count()).toBe(0);expect(await db.inventoryCostEvents.count()).toBe(1);
  expect((await db.products.get(product.id))?.stockQuantity).toBe(3);
});
it("backs up and restores policy and immutable receipts, rejects altered tax",async()=>{
  const {db,input}=await fixture(policy);await completeSale(input,db);const backup=await createBackup(db);
  const tampered=structuredClone(backup);tampered.records.sales[0].tax!.taxMinor++;
  tampered.records.centralSaleEvents[0].payload.sale.tax!.taxMinor++;
  expect(()=>parseBackup(JSON.stringify(tampered))).toThrow(/tax.*(amounts|reconcile)/i);
  const invalid=structuredClone(backup);invalid.records.businessProfiles[0].taxPolicy!.registrationStatus="unknown";
  expect(()=>parseBackup(JSON.stringify(invalid))).toThrow(/registered status/);
  await restoreBackup(backup,db);
  expect((await db.businessProfiles.get("primary"))?.taxPolicy).toEqual(policy);
  expect((await db.sales.toArray())[0].tax?.taxMinor).toBe(100);
});
it("keeps tax policies scoped to their business",async()=>{
  const {db}=await fixture(policy);setActiveBusinessProfileId("second-company");
  await saveBusinessProfile({...profile,name:"Second company"},db);
  expect((await db.businessProfiles.get("second-company"))?.taxPolicy).toBeUndefined();
  expect((await db.businessProfiles.get("primary"))?.taxPolicy).toEqual(policy);
});
it("denies tax changes from cashier and locked owner sessions",async()=>{
  const {db}=await fixture();const owner=await db.staffMembers.where("businessProfileId").equals("primary").first();await unlockStaff(owner!.id,"123456",db);
  const cashier=await createStaff("Cashier","cashier","654321",db);await unlockStaff(cashier.id,"654321",db);
  await expect(saveBusinessProfile({...profile,taxPolicy:policy},db)).rejects.toThrow(/permission denied/);
  lockStaff("primary");await expect(saveBusinessProfile({...profile,taxPolicy:policy},db)).rejects.toThrow(/locked/);
  expect((await db.businessProfiles.get("primary"))?.taxPolicy).toBeUndefined();
});

const ghanaAct1151: TaxPolicy = {
  enabled: true, registrationStatus: "registered", registrationNumber: "TEST-GRA-ONLY",
  label: "Ghana VAT and levies (2026)", rateBasisPoints: 2000, priceMode: "exclusive",
  scheme: "ghana-vat-2026"
};
it("posts a real discounted Ghana VAT sale with separate VAT/NHIL/GETFund, receipt, backup and audit", async () => {
  const {db,product,input} = await fixture(ghanaAct1151);
  await updateProduct(product.id, {name:"Rice",categoryId:"uncategorized",sellingPrice:"10",costPrice:"1",initialStock:"3",lowStockThreshold:"1",ghanaTaxTreatment:"standard"}, "GHS", db);
  const taxLines = [{productId:product.id,amountMinor:1000,treatment:"standard" as const}];
  const taxReviewKey = taxReviewKeyForSale(ghanaAct1151,taxLines);
  const saved = await completeSale({...input,amountPaid:"9.60",taxReviewKey},db);
  expect(saved.sale).toMatchObject({subtotalMinor:1000,discountMinor:200,totalMinor:960,amountPaidMinor:960,tax:{
    taxMinor:160,taxableMinor:800,ghana:{standardMinor:800,taxableBaseMinor:800,vatMinor:120,nhilMinor:20,getFundMinor:20,eVatStatus:"not-certified"}
  }});
  expect(saved.lines[0].ghanaTaxTreatmentAtSale).toBe("standard");
  expect(validateTaxSnapshot(saved.sale)).toBe(160);
  expect((await auditLocalIntegrity(db)).issues).toEqual([]);
  const snapshot = await getSaleSnapshot(db);
  const receipt = resolveReceiptDetail({receiptId:saved.receipt.id,snapshot,profile:{...profile,country:"Ghana"},customers:[]})!;
  expect(formatReceiptShareText(receipt)).toContain("VAT (15%)");
  expect(formatReceiptShareText(receipt)).toContain("NHIL (2.5%)");
  expect(formatReceiptShareText(receipt)).toContain("GETFund (2.5%)");
  expect(formatReceiptShareText(receipt)).toContain("NOT A GRA-CERTIFIED E-VAT INVOICE");
  const backup = await createBackup(db);
  const broken = structuredClone(backup);
  broken.records.sales[0].tax!.ghana!.nhilMinor++;
  expect(() => parseBackup(JSON.stringify(broken))).toThrow(/tax|reconcile|component/i);
  expect(await getFinancialSummary("today",new Date(),undefined,undefined,db)).toMatchObject({recordedTaxMinor:160,salesExcludingRecordedTaxMinor:800});
});
it("refuses Ghana checkout if an item lacks a reviewed tax treatment without writing a sale", async () => {
  const {db,product,input} = await fixture(ghanaAct1151);
  const key = taxReviewKeyForSale(ghanaAct1151,[{productId:product.id,amountMinor:1000}]);
  await expect(completeSale({...input,amountPaid:"9.60",taxReviewKey:key},db)).rejects.toThrow(/Classify every product/);
  expect(await db.sales.count()).toBe(0);
  expect((await db.products.get(product.id))?.stockQuantity).toBe(3);
});
it("keeps zero-rated and exempt Ghana lines free of levies with stable discount allocation", () => {
  const policy = ghanaAct1151;
  const result = calculateSaleTax([
    {amountMinor:10000,treatment:"standard"},
    {amountMinor:10000,treatment:"zero-rated"},
    {amountMinor:10000,treatment:"exempt"}
  ],3000,policy);
  expect(result?.ghana).toMatchObject({standardMinor:9000,zeroRatedMinor:9000,exemptMinor:9000,vatMinor:1350,nhilMinor:225,getFundMinor:225,totalMinor:28800});
  expect(() => calculateTax(27000, policy)).toThrow(/classified product/);
});
